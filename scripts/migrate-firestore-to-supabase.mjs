#!/usr/bin/env node
import fs from "node:fs/promises";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";
import {
  COLLECTIONS,
  requiredEnv,
  normalizeValue,
  replaceUidFields,
  bytesFromNormalized,
  loadSupabaseProfiles,
  loadSupabaseAuthUsers,
  createMissingSupabaseAuthUsers,
  buildUidMap,
  upsertProfile,
  upsertInvite,
  upsertDocument,
  uploadAttachment,
  writeReport
} from "./migration-common.mjs";

async function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const filePath = requiredEnv("FIREBASE_SERVICE_ACCOUNT_PATH");
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readCollection(firestore, name) {
  const snapshot = await firestore.collection(name).get();
  return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const allowMissing = process.argv.includes("--allow-missing-users");
  const createMissingUsers = process.argv.includes("--create-missing-users");
  const serviceAccount = await loadServiceAccount();
  if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
  const firestore = getFirestore();
  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  console.log("Lendo perfis do Firebase...");
  const sourceProfiles = await readCollection(firestore, "users");
  const targetProfiles = await loadSupabaseProfiles(supabase);
  const targetAuthUsers = await loadSupabaseAuthUsers(supabase);
  const identitiesById = new Map([...targetAuthUsers, ...targetProfiles].map((identity) => [identity.id, identity]));
  const identityPreparation = await createMissingSupabaseAuthUsers(
    supabase,
    sourceProfiles,
    [...identitiesById.values()],
    { enabled: createMissingUsers, dryRun }
  );
  const { uidMap, missing } = buildUidMap(
    sourceProfiles.map((profile) => ({ id: profile.id, data: normalizeValue(profile.data) })),
    identityPreparation.targetIdentities
  );

  if (missing.length && !allowMissing) {
    console.error("Crie estes usuários no Supabase antes da migração:");
    missing.forEach((item) => console.error(`- ${item.name || "Sem nome"} <${item.email || "sem e-mail"}>`));
    console.error("Execute novamente com --create-missing-users para criá-los automaticamente, ou use --allow-missing-users para ignorar.");
    process.exitCode = 2;
    return;
  }

  const report = {
    startedAt: new Date().toISOString(),
    dryRun,
    missingUsers: missing,
    createdAuthUsers: identityPreparation.created,
    uidMappings: Object.fromEntries(uidMap),
    collections: {},
    errors: []
  };

  for (const collectionName of COLLECTIONS) {
    console.log(`Migrando ${collectionName}...`);
    const sourceDocuments = collectionName === "users"
      ? sourceProfiles
      : await readCollection(firestore, collectionName);
    let migrated = 0;

    for (const source of sourceDocuments) {
      try {
        const normalized = normalizeValue(source.data);
        const transformed = replaceUidFields(normalized, uidMap);
        if (dryRun) {
          migrated += 1;
          continue;
        }

        if (collectionName === "users") {
          const targetId = uidMap.get(source.id);
          if (!targetId) continue;
          await upsertProfile(supabase, source, targetId, transformed);
        } else if (collectionName === "userInvites") {
          await upsertInvite(supabase, source.id, transformed);
        } else if (collectionName === "requestAttachments") {
          const bytes = bytesFromNormalized(normalized.data);
          const attachmentData = { ...transformed };
          delete attachmentData.data;
          if (bytes) attachmentData.storagePath = await uploadAttachment(supabase, source.id, attachmentData, bytes);
          await upsertDocument(supabase, collectionName, source.id, attachmentData);
        } else {
          await upsertDocument(supabase, collectionName, source.id, transformed);
        }
        migrated += 1;
      } catch (error) {
        report.errors.push({ collection: collectionName, id: source.id, message: error.message });
        console.error(`Falha em ${collectionName}/${source.id}: ${error.message}`);
      }
    }

    report.collections[collectionName] = {
      read: sourceDocuments.length,
      migrated
    };
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = await writeReport("migration-report.json", report);
  console.log(`Migração finalizada. Relatório: ${reportPath}`);
  if (report.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
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

async function main() {
  const input = process.argv.find((argument) => argument.endsWith(".json"));
  if (!input) throw new Error("Informe o arquivo: node scripts/import-backup-to-supabase.mjs caminho-do-backup.json");
  const dryRun = process.argv.includes("--dry-run");
  const allowMissing = process.argv.includes("--allow-missing-users");
  const createMissingUsers = process.argv.includes("--create-missing-users");
  const backup = JSON.parse(await fs.readFile(path.resolve(input), "utf8"));
  const sourceData = backup.data || {};
  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const sourceProfiles = (sourceData.users || []).map(({ id, ...data }) => ({ id, data: normalizeValue(data) }));
  const targetProfiles = await loadSupabaseProfiles(supabase);
  const targetAuthUsers = await loadSupabaseAuthUsers(supabase);
  const identitiesById = new Map([...targetAuthUsers, ...targetProfiles].map((identity) => [identity.id, identity]));
  const identityPreparation = await createMissingSupabaseAuthUsers(
    supabase,
    sourceProfiles,
    [...identitiesById.values()],
    { enabled: createMissingUsers, dryRun }
  );
  const { uidMap, missing } = buildUidMap(sourceProfiles, identityPreparation.targetIdentities);
  if (missing.length && !allowMissing) {
    console.error("Crie estes usuários no Supabase antes da importação:");
    missing.forEach((item) => console.error(`- ${item.name || "Sem nome"} <${item.email || "sem e-mail"}>`));
    process.exitCode = 2;
    return;
  }

  const report = {
    startedAt: new Date().toISOString(),
    source: path.resolve(input),
    dryRun,
    missingUsers: missing,
    createdAuthUsers: identityPreparation.created,
    uidMappings: Object.fromEntries(uidMap),
    collections: {},
    errors: []
  };

  for (const collectionName of COLLECTIONS) {
    const documents = (sourceData[collectionName] || []).map(({ id, ...data }) => ({ id, data }));
    let migrated = 0;
    for (const source of documents) {
      try {
        const normalized = normalizeValue(source.data);
        const transformed = replaceUidFields(normalized, uidMap);
        if (!dryRun) {
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
        }
        migrated += 1;
      } catch (error) {
        report.errors.push({ collection: collectionName, id: source.id, message: error.message });
      }
    }
    report.collections[collectionName] = { read: documents.length, migrated };
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = await writeReport("migration-report.json", report);
  console.log(`Importação finalizada. Relatório: ${reportPath}`);
  if (report.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

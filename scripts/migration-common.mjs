import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const COLLECTIONS = [
  "requests",
  "archivedRequests",
  "requestComments",
  "requestHistory",
  "requestAttachments",
  "users",
  "userInvites",
  "notifications",
  "savedFilters",
  "commentTemplates",
  "accessLogs"
];

export const UID_FIELDS = new Set([
  "uid",
  "ownerUid",
  "requesterUid",
  "assigneeUid",
  "targetUid",
  "createdByUid",
  "updatedByUid",
  "actorUid",
  "authorUid",
  "acceptedUid",
  "lockedByUid",
  "cancelledByUid"
]);

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Defina a variável de ambiente ${name}.`);
  return value;
}

export function safeFileName(name = "anexo") {
  return String(name).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "anexo";
}

export function normalizeValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (value?.toDate instanceof Function) return value.toDate().toISOString();
  if (value?._seconds !== undefined && Number.isFinite(value._seconds)) {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6)).toISOString();
  }
  if (Buffer.isBuffer(value)) return { __type: "bytes", value: value.toString("base64") };
  if (value?.toUint8Array instanceof Function) {
    return { __type: "bytes", value: Buffer.from(value.toUint8Array()).toString("base64") };
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    if (value.__type === "timestamp") return value.value || null;
    if (value.__type === "bytes") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  }
  return value;
}

export function replaceUidFields(value, uidMap, parentKey = "") {
  if (Array.isArray(value)) return value.map((entry) => replaceUidFields(entry, uidMap, parentKey));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      replaceUidFields(entry, uidMap, key)
    ]));
  }
  if (typeof value === "string" && UID_FIELDS.has(parentKey) && uidMap.has(value)) return uidMap.get(value);
  return value;
}

export function bytesFromNormalized(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value?.__type === "bytes" && value.value) return Buffer.from(value.value, "base64");
  if (value?.toUint8Array instanceof Function) return Buffer.from(value.toUint8Array());
  return null;
}

export async function writeReport(fileName, report) {
  const target = path.resolve(process.cwd(), fileName);
  await fs.writeFile(target, JSON.stringify(report, null, 2), "utf8");
  return target;
}

export async function loadSupabaseProfiles(supabase) {
  const { data, error } = await supabase.from("profiles").select("id,email,data");
  if (error) throw error;
  return data || [];
}


export async function loadSupabaseAuthUsers(supabase) {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch.map((user) => ({ id: user.id, email: user.email || "" })));
    if (batch.length < 1000) break;
    page += 1;
  }
  return users;
}

export async function createMissingSupabaseAuthUsers(supabase, sourceProfiles, targetIdentities, { enabled = false, dryRun = false } = {}) {
  const byEmail = new Map(
    targetIdentities
      .filter((user) => user.email)
      .map((user) => [String(user.email).toLowerCase(), user])
  );
  const created = [];
  const unresolved = [];

  for (const source of sourceProfiles) {
    const email = String(source.data?.email || "").trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    if (!enabled || dryRun) {
      unresolved.push({ uid: source.id, email, name: source.data?.name || "" });
      continue;
    }

    const temporaryPassword = randomBytes(32).toString("base64url");
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        name: source.data?.name || "",
        migratedFromFirebaseUid: source.id,
        passwordResetRequired: true
      }
    });
    if (error) throw new Error(`Não foi possível criar ${email}: ${error.message}`);
    const identity = { id: data.user.id, email };
    byEmail.set(email, identity);
    targetIdentities.push(identity);
    created.push({ id: data.user.id, email, name: source.data?.name || "" });
  }

  return { targetIdentities, created, unresolved };
}

export function buildUidMap(sourceProfiles, targetProfiles) {
  const byEmail = new Map(
    targetProfiles
      .filter((profile) => profile.email)
      .map((profile) => [String(profile.email).toLowerCase(), profile.id])
  );
  const uidMap = new Map();
  const missing = [];
  for (const source of sourceProfiles) {
    const email = String(source.data?.email || "").toLowerCase();
    const targetId = byEmail.get(email);
    if (targetId) uidMap.set(source.id, targetId);
    else missing.push({ uid: source.id, email: source.data?.email || "", name: source.data?.name || "" });
  }
  return { uidMap, missing };
}

export async function upsertProfile(supabase, source, targetId, transformed) {
  const payload = {
    id: targetId,
    email: String(transformed.email || "").toLowerCase(),
    name: String(transformed.name || ""),
    role: transformed.role === "admin" ? "admin" : "solicitante",
    squad: transformed.role === "admin" ? "" : String(transformed.squad || ""),
    active: transformed.active !== false,
    access_locked: transformed.accessLocked === true,
    data: { ...transformed, migratedFromFirebaseUid: source.id },
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("profiles").upsert(payload);
  if (error) throw error;
}

export async function upsertInvite(supabase, id, data) {
  const { error } = await supabase.from("user_invites").upsert({
    token: id,
    email: String(data.email || "").toLowerCase(),
    status: String(data.status || "pending"),
    expires_at: data.expiresAt || null,
    data,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

export async function upsertDocument(supabase, collectionName, id, data) {
  const { error } = await supabase.from("documents").upsert({
    collection_name: collectionName,
    id,
    data,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

export async function uploadAttachment(supabase, id, data, bytes) {
  const owner = String(data.ownerUid || "sem-usuario");
  const requestId = String(data.requestId || "sem-solicitacao");
  const name = safeFileName(data.name || "anexo");
  const storagePath = `${owner}/${requestId}/${id}-${name}`;
  const { error } = await supabase.storage.from("request-attachments").upload(storagePath, bytes, {
    contentType: data.contentType || "application/octet-stream",
    upsert: true
  });
  if (error) throw error;
  return storagePath;
}

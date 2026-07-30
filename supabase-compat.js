import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/+esm";

const TABLE_DOCUMENTS = "documents";
const TABLE_PROFILES = "profiles";
const TABLE_INVITES = "user_invites";
const ATTACHMENT_BUCKET = "request-attachments";
const AUTH_STORAGE_KEY = "painel-supabase-auth";
const AUTH_PERSISTENCE_KEY = "painel-supabase-persistence";

const clientCache = new WeakMap();
const contexts = [];
let channelSequence = 0;

export const browserLocalPersistence = "local";
export const browserSessionPersistence = "session";

class AdaptiveAuthStorage {
  constructor() {
    this.mode = localStorage.getItem(AUTH_PERSISTENCE_KEY) === browserSessionPersistence
      ? browserSessionPersistence
      : browserLocalPersistence;
  }

  activeStorage() {
    return this.mode === browserSessionPersistence ? sessionStorage : localStorage;
  }

  fallbackStorage() {
    return this.mode === browserSessionPersistence ? localStorage : sessionStorage;
  }

  getItem(key) {
    return this.activeStorage().getItem(key) ?? this.fallbackStorage().getItem(key);
  }

  setItem(key, value) {
    this.activeStorage().setItem(key, value);
    this.fallbackStorage().removeItem(key);
  }

  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  setMode(mode) {
    this.mode = mode === browserSessionPersistence ? browserSessionPersistence : browserLocalPersistence;
    localStorage.setItem(AUTH_PERSISTENCE_KEY, this.mode);
    const alternate = this.fallbackStorage();
    const active = this.activeStorage();
    const current = alternate.getItem(AUTH_STORAGE_KEY);
    if (current && !active.getItem(AUTH_STORAGE_KEY)) active.setItem(AUTH_STORAGE_KEY, current);
    alternate.removeItem(AUTH_STORAGE_KEY);
  }
}

function normalizeConfig(config = {}) {
  return {
    url: String(config.url || "").trim().replace(/\/$/, ""),
    anonKey: String(config.anonKey || "").trim()
  };
}

function getOrCreateContext(configObject) {
  if (clientCache.has(configObject)) return clientCache.get(configObject);
  const config = normalizeConfig(configObject);
  const storage = new AdaptiveAuthStorage();
  const client = createClient(config.url, config.anonKey, {
    auth: {
      storage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  const context = { config, client, storage, auth: null, db: null };
  clientCache.set(configObject, context);
  contexts.push(context);
  return context;
}

export function initializeApp(config) {
  return { __supabaseConfig: config };
}

export function getAuth(app) {
  const context = getOrCreateContext(app.__supabaseConfig);
  if (!context.auth) {
    context.auth = {
      client: context.client,
      storage: context.storage,
      currentUser: null,
      languageCode: "pt-BR"
    };
  }
  return context.auth;
}

export function getFirestore(app) {
  const context = getOrCreateContext(app.__supabaseConfig);
  if (!context.db) context.db = { client: context.client };
  return context.db;
}

function mapUser(user) {
  if (!user) return null;
  return {
    ...user,
    uid: user.id,
    email: user.email || ""
  };
}

function mapAuthError(error) {
  if (!error) return null;
  const message = String(error.message || "").toLowerCase();
  let code = error.code || error.name || "supabase/error";
  if (message.includes("invalid login credentials")) code = "auth/invalid-credential";
  else if (message.includes("email not confirmed")) code = "auth/email-not-confirmed";
  else if (message.includes("user already registered")) code = "auth/email-already-in-use";
  else if (message.includes("password should be at least")) code = "auth/weak-password";
  else if (message.includes("rate limit") || message.includes("too many requests")) code = "auth/too-many-requests";
  else if (message.includes("network") || message.includes("fetch")) code = "auth/network-request-failed";
  const mapped = new Error(error.message || "Erro no Supabase.");
  mapped.code = code;
  mapped.details = error.details;
  mapped.hint = error.hint;
  mapped.status = error.status;
  return mapped;
}

function throwIfError(error) {
  if (error) throw mapAuthError(error);
}

export async function setPersistence(auth, mode) {
  auth.storage.setMode(mode);
}

export async function signInWithEmailAndPassword(auth, email, password) {
  const { data, error } = await auth.client.auth.signInWithPassword({ email, password });
  throwIfError(error);
  auth.currentUser = mapUser(data.user);
  return { user: auth.currentUser };
}

export async function createUserWithEmailAndPassword(auth, email, password) {
  const { data, error } = await auth.client.auth.signUp({ email, password });
  throwIfError(error);
  if (!data.user) {
    const missing = new Error("Não foi possível criar o usuário.");
    missing.code = "auth/user-not-created";
    throw missing;
  }
  if (!data.session) {
    const confirmation = new Error("A confirmação de e-mail está ativada no Supabase.");
    confirmation.code = "auth/email-confirmation-required";
    throw confirmation;
  }
  auth.currentUser = mapUser(data.user);
  return { user: auth.currentUser };
}

export async function deleteUser(user) {
  const context = contexts.find((item) => item.auth?.currentUser?.uid === user?.uid);
  if (!context) return;
  const { error } = await context.client.rpc("delete_own_unprofiled_user");
  if (error) console.warn("Não foi possível remover o usuário incompleto.", error);
  await context.client.auth.signOut({ scope: "local" });
}

export async function signOut(auth) {
  const { error } = await auth.client.auth.signOut({ scope: "local" });
  if (error) throw mapAuthError(error);
  auth.currentUser = null;
}

export async function sendPasswordResetEmail(auth, email) {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await auth.client.auth.resetPasswordForEmail(email, { redirectTo });
  throwIfError(error);
}

export const EmailAuthProvider = {
  credential(email, password) {
    return { email, password };
  }
};

export async function reauthenticateWithCredential(user, credential) {
  if (!user?.email || !credential?.password) {
    const error = new Error("Credencial inválida.");
    error.code = "auth/invalid-credential";
    throw error;
  }
  const context = findContextByUser(user);
  const { error } = await context.client.auth.signInWithPassword({
    email: credential.email || user.email,
    password: credential.password
  });
  throwIfError(error);
  return { user };
}

export async function updatePassword(user, password) {
  const context = findContextByUser(user);
  const { error } = await context.client.auth.updateUser({ password });
  throwIfError(error);
}

function findContextByUser(user) {
  for (const context of clientCacheValues()) {
    if (context.auth?.currentUser?.uid === user?.uid) return context;
  }
  const error = new Error("Sessão não encontrada.");
  error.code = "auth/user-not-found";
  throw error;
}

function clientCacheValues() {
  return contexts;
}

export function onAuthStateChanged(auth, callback) {
  let active = true;
  let lastSignature = Symbol("initial");

  const deliver = (user, event = "UNKNOWN") => {
    if (!active) return;
    const signature = user?.uid || "signed-out";
    const isPasswordRecovery = event === "PASSWORD_RECOVERY";
    if (signature === lastSignature && !isPasswordRecovery) return;
    lastSignature = signature;
    auth.currentUser = user;
    callback(user, event);
  };

  auth.client.auth.getSession().then(({ data, error }) => {
    if (error) console.error(error);
    deliver(mapUser(data?.session?.user || null), "INITIAL_SESSION");
  });

  const { data: listener } = auth.client.auth.onAuthStateChange((event, session) => {
    deliver(mapUser(session?.user || null), event);
  });

  return () => {
    active = false;
    listener.subscription.unsubscribe();
  };
}

export class Timestamp {
  constructor(date) {
    this.date = date instanceof Date ? date : new Date(date);
  }

  toDate() {
    return new Date(this.date);
  }

  static fromDate(date) {
    return new Timestamp(date);
  }
}

export class Bytes {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  }

  toUint8Array() {
    return new Uint8Array(this.bytes);
  }

  static fromUint8Array(bytes) {
    return new Bytes(bytes);
  }
}

const SERVER_TIMESTAMP = Symbol("serverTimestamp");
const INCREMENT = Symbol("increment");

export function serverTimestamp() {
  return { __operation: SERVER_TIMESTAMP };
}

export function increment(amount) {
  return { __operation: INCREMENT, amount: Number(amount || 0) };
}

export function collection(db, name) {
  return { kind: "collection", db, name: String(name) };
}

export function doc(first, second, third) {
  if (first?.kind === "collection") {
    return {
      kind: "document",
      db: first.db,
      collection: first.name,
      id: second ? String(second) : crypto.randomUUID()
    };
  }
  return {
    kind: "document",
    db: first,
    collection: String(second),
    id: third ? String(third) : crypto.randomUUID()
  };
}

export function where(field, operator, value) {
  if (operator !== "==") {
    const error = new Error(`Operador não suportado: ${operator}`);
    error.code = "failed-precondition";
    throw error;
  }
  return { field, operator, value };
}

export function query(collectionReference, ...conditions) {
  return { kind: "query", collectionReference, conditions };
}

function encodeValue(value, currentValue = undefined) {
  if (value?.__operation === SERVER_TIMESTAMP) return new Date().toISOString();
  if (value?.__operation === INCREMENT) return Number(currentValue || 0) + value.amount;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Bytes) return { __type: "bytes", value: uint8ToBase64(value.toUint8Array()) };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry, index) => encodeValue(entry, currentValue?.[index]));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeValue(entry, currentValue?.[key])]));
  }
  return value;
}

function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value && typeof value === "object") {
    if (value.__type === "bytes" && value.value) return Bytes.fromUint8Array(base64ToUint8(value.value));
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeValue(entry)]));
  }
  return value;
}

function uint8ToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToUint8(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function normalizeDatabaseError(error) {
  if (!error) return null;
  const message = String(error.message || "").toLowerCase();
  let code = error.code || "supabase/database-error";
  if (code === "42501" || message.includes("row-level security") || message.includes("permission")) code = "permission-denied";
  else if (code === "23505") code = "already-exists";
  else if (code === "PGRST116") code = "not-found";
  else if (message.includes("failed to fetch") || message.includes("network")) code = "unavailable";
  const mapped = new Error(error.message || "Erro ao acessar o Supabase.");
  mapped.code = code;
  mapped.details = error.details;
  mapped.hint = error.hint;
  return mapped;
}

function cloneDecodedValue(value) {
  if (value instanceof Bytes) return Bytes.fromUint8Array(value.toUint8Array());
  if (value instanceof Timestamp) return Timestamp.fromDate(value.toDate());
  if (Array.isArray(value)) return value.map(cloneDecodedValue);
  if (value && typeof value === "object") {
    if (value.__type === "bytes" && value.value) return Bytes.fromUint8Array(base64ToUint8(value.value));
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneDecodedValue(entry)]));
  }
  return value;
}

function documentSnapshot(reference, data, exists = true) {
  return {
    id: reference.id,
    ref: reference,
    exists: () => exists,
    data: () => cloneDecodedValue(data || {})
  };
}

function querySnapshot(reference, rows) {
  const collectionName = reference.kind === "query"
    ? reference.collectionReference.name
    : reference.name;
  const db = reference.kind === "query" ? reference.collectionReference.db : reference.db;
  return {
    docs: rows.map((row) => {
      const ref = doc(db, collectionName, row.id);
      return documentSnapshot(ref, row.data, true);
    })
  };
}

function applyConditions(rows, conditions = []) {
  return rows.filter((row) => conditions.every((condition) => row.data?.[condition.field] === condition.value));
}

async function loadProfileRows(db) {
  const { data, error } = await db.client.from(TABLE_PROFILES).select("id,data");
  if (error) throw normalizeDatabaseError(error);
  return (data || []).map((row) => ({ id: row.id, data: decodeValue(row.data || {}) }));
}

async function loadInviteRows(db) {
  const { data, error } = await db.client.from(TABLE_INVITES).select("token,data");
  if (error) throw normalizeDatabaseError(error);
  return (data || []).map((row) => ({ id: row.token, data: decodeValue(row.data || {}) }));
}

async function loadDocumentRows(db, collectionName) {
  const { data, error } = await db.client
    .from(TABLE_DOCUMENTS)
    .select("id,data")
    .eq("collection_name", collectionName);
  if (error) throw normalizeDatabaseError(error);
  const rows = (data || []).map((row) => ({ id: row.id, data: decodeValue(row.data || {}) }));
  if (collectionName === "requestAttachments") {
    for (const row of rows) {
      if (!row.data?.storagePath) continue;
      const { data: fileData, error: fileError } = await db.client.storage
        .from(ATTACHMENT_BUCKET)
        .download(row.data.storagePath);
      if (fileError) throw normalizeDatabaseError(fileError);
      row.data.data = Bytes.fromUint8Array(new Uint8Array(await fileData.arrayBuffer()));
    }
  }
  return rows;
}

async function loadRows(reference) {
  const collectionReference = reference.kind === "query" ? reference.collectionReference : reference;
  let rows;
  if (collectionReference.name === "users") rows = await loadProfileRows(collectionReference.db);
  else if (collectionReference.name === "userInvites") rows = await loadInviteRows(collectionReference.db);
  else rows = await loadDocumentRows(collectionReference.db, collectionReference.name);
  return reference.kind === "query" ? applyConditions(rows, reference.conditions) : rows;
}

export async function getDocs(reference) {
  return querySnapshot(reference, await loadRows(reference));
}

async function getPublicInvite(reference) {
  const { data, error } = await reference.db.client.rpc("get_public_invite", { p_token: reference.id });
  if (error) throw normalizeDatabaseError(error);
  const invite = Array.isArray(data) ? data[0] : data;
  return invite ? documentSnapshot(reference, invite, true) : documentSnapshot(reference, {}, false);
}

export async function getDoc(reference) {
  if (reference.collection === "users") {
    const { data, error } = await reference.db.client.from(TABLE_PROFILES).select("id,data").eq("id", reference.id).maybeSingle();
    if (error) throw normalizeDatabaseError(error);
    return data ? documentSnapshot(reference, data.data || {}, true) : documentSnapshot(reference, {}, false);
  }

  if (reference.collection === "userInvites") {
    const { data: sessionData } = await reference.db.client.auth.getSession();
    if (!sessionData?.session) return getPublicInvite(reference);
    const { data, error } = await reference.db.client.from(TABLE_INVITES).select("token,data").eq("token", reference.id).maybeSingle();
    if (error) throw normalizeDatabaseError(error);
    return data ? documentSnapshot(reference, data.data || {}, true) : documentSnapshot(reference, {}, false);
  }

  const { data, error } = await reference.db.client
    .from(TABLE_DOCUMENTS)
    .select("id,data")
    .eq("collection_name", reference.collection)
    .eq("id", reference.id)
    .maybeSingle();
  if (error) throw normalizeDatabaseError(error);
  if (!data) return documentSnapshot(reference, {}, false);

  const decoded = decodeValue(data.data || {});
  if (reference.collection === "requestAttachments" && decoded.storagePath) {
    const { data: fileData, error: fileError } = await reference.db.client.storage
      .from(ATTACHMENT_BUCKET)
      .download(decoded.storagePath);
    if (fileError) throw normalizeDatabaseError(fileError);
    decoded.data = Bytes.fromUint8Array(new Uint8Array(await fileData.arrayBuffer()));
  }
  return documentSnapshot(reference, decoded, true);
}

async function currentDocumentData(reference) {
  const snapshot = await getDoc(reference);
  return snapshot.exists() ? snapshot.data() : {};
}

function profilePayload(id, data) {
  const encoded = encodeValue(data);
  return {
    id,
    email: String(encoded.email || "").toLowerCase(),
    name: String(encoded.name || ""),
    role: String(encoded.role || "solicitante"),
    squad: String(encoded.squad || ""),
    active: encoded.active !== false,
    access_locked: encoded.accessLocked === true,
    data: encoded,
    updated_at: new Date().toISOString()
  };
}

function invitePayload(token, data) {
  const encoded = encodeValue(data);
  return {
    token,
    email: String(encoded.email || "").toLowerCase(),
    status: String(encoded.status || "pending"),
    expires_at: encoded.expiresAt || null,
    data: encoded,
    updated_at: new Date().toISOString()
  };
}

async function uploadAttachment(reference, encodedData) {
  const bytesValue = encodedData.data;
  if (!bytesValue?.__type || bytesValue.__type !== "bytes") return encodedData;
  const bytes = base64ToUint8(bytesValue.value);
  const safeName = String(encodedData.name || "anexo").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const owner = String(encodedData.ownerUid || "sem-usuario");
  const requestId = String(encodedData.requestId || "sem-solicitacao");
  const storagePath = `${owner}/${requestId}/${reference.id}-${safeName}`;
  const { error } = await reference.db.client.storage.from(ATTACHMENT_BUCKET).upload(storagePath, bytes, {
    contentType: encodedData.contentType || "application/octet-stream",
    upsert: true
  });
  if (error) throw normalizeDatabaseError(error);
  const copy = { ...encodedData, storagePath };
  delete copy.data;
  return copy;
}

async function setDocument(reference, data, { merge = false } = {}) {
  const previous = merge ? await currentDocumentData(reference) : {};
  let encoded = encodeValue(data, previous);
  if (merge) encoded = { ...encodeValue(previous), ...encoded };

  if (reference.collection === "users") {
    const { error } = await reference.db.client.from(TABLE_PROFILES).upsert(profilePayload(reference.id, encoded));
    if (error) throw normalizeDatabaseError(error);
    return;
  }

  if (reference.collection === "userInvites") {
    const { error } = await reference.db.client.from(TABLE_INVITES).upsert(invitePayload(reference.id, encoded));
    if (error) throw normalizeDatabaseError(error);
    return;
  }

  if (reference.collection === "requestAttachments") encoded = await uploadAttachment(reference, encoded);
  const { error } = await reference.db.client.from(TABLE_DOCUMENTS).upsert({
    collection_name: reference.collection,
    id: reference.id,
    data: encoded,
    updated_at: new Date().toISOString()
  });
  if (error) throw normalizeDatabaseError(error);
}

export async function setDoc(reference, data, options = {}) {
  return setDocument(reference, data, options);
}

export async function updateDoc(reference, updates) {
  const previous = await currentDocumentData(reference);
  if (!Object.keys(previous).length) {
    const error = new Error("Documento não encontrado.");
    error.code = "not-found";
    throw error;
  }
  const encodedUpdates = encodeValue(updates, previous);
  return setDocument(reference, { ...previous, ...encodedUpdates });
}

export async function deleteDoc(reference) {
  if (reference.collection === "users") {
    const { error } = await reference.db.client.from(TABLE_PROFILES).delete().eq("id", reference.id);
    if (error) throw normalizeDatabaseError(error);
    return;
  }
  if (reference.collection === "userInvites") {
    const { error } = await reference.db.client.from(TABLE_INVITES).delete().eq("token", reference.id);
    if (error) throw normalizeDatabaseError(error);
    return;
  }

  if (reference.collection === "requestAttachments") {
    const existing = await getDoc(reference);
    const storagePath = existing.exists() ? existing.data().storagePath : "";
    if (storagePath) {
      const { error: storageError } = await reference.db.client.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
      if (storageError) console.warn("Não foi possível remover o arquivo do Storage.", storageError);
    }
  }
  const { error } = await reference.db.client
    .from(TABLE_DOCUMENTS)
    .delete()
    .eq("collection_name", reference.collection)
    .eq("id", reference.id);
  if (error) throw normalizeDatabaseError(error);
}

export function writeBatch() {
  const operations = [];
  return {
    set(reference, data, options = {}) { operations.push(() => setDoc(reference, data, options)); },
    update(reference, data) { operations.push(() => updateDoc(reference, data)); },
    delete(reference) { operations.push(() => deleteDoc(reference)); },
    async commit() {
      for (const operation of operations) await operation();
    }
  };
}

function realtimeTarget(reference) {
  const base = reference.kind === "query" ? reference.collectionReference : reference;
  if (base.kind === "document") {
    if (base.collection === "users") return { table: TABLE_PROFILES, filter: `id=eq.${base.id}` };
    if (base.collection === "userInvites") return { table: TABLE_INVITES, filter: `token=eq.${base.id}` };
    return { table: TABLE_DOCUMENTS, filter: `collection_name=eq.${base.collection}` };
  }
  if (base.name === "users") return { table: TABLE_PROFILES };
  if (base.name === "userInvites") return { table: TABLE_INVITES };
  return { table: TABLE_DOCUMENTS, filter: `collection_name=eq.${base.name}` };
}

export function onSnapshot(reference, next, errorCallback = console.error) {
  let active = true;
  let timer = null;
  const db = reference.kind === "document"
    ? reference.db
    : reference.kind === "query"
      ? reference.collectionReference.db
      : reference.db;

  const emit = async () => {
    if (!active) return;
    try {
      if (reference.kind === "document") next(await getDoc(reference));
      else next(await getDocs(reference));
    } catch (error) {
      errorCallback(normalizeDatabaseError(error));
    }
  };

  const scheduleEmit = () => {
    clearTimeout(timer);
    timer = setTimeout(emit, 120);
  };

  emit();
  const target = realtimeTarget(reference);
  const channelName = `painel-${target.table}-${Date.now()}-${channelSequence += 1}`;
  let builder = db.client.channel(channelName).on("postgres_changes", {
    event: "*",
    schema: "public",
    table: target.table,
    ...(target.filter ? { filter: target.filter } : {})
  }, scheduleEmit);
  const channel = builder.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn(`Canal em tempo real indisponível: ${channelName}`);
    }
  });

  return () => {
    active = false;
    clearTimeout(timer);
    db.client.removeChannel(channel);
  };
}

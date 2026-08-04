const AUTHENTICATED = "__AUTHENTICATED__" === "true";
const E2E_USER = {
  uid: "e2e-admin",
  email: "admin.e2e@example.com",
  displayName: "Administrador E2E",
  emailVerified: true
};

const E2E_CUSTOM_PROJECT = {
  name: "Acesso remoto",
  description: "Solicitação personalizada para validar o construtor de formulários.",
  audience: "all",
  status: "published",
  active: true,
  legacyType: "custom",
  order: 40,
  standardFields: {
    document: { enabled: true, required: true },
    companyName: { enabled: true, required: true },
    phone: { enabled: false, required: false },
    email: { enabled: false, required: false }
  },
  customFields: [
    {
      id: "motivo",
      label: "Motivo do acesso",
      placeholder: "Descreva o motivo do acesso remoto.",
      required: true,
      maxLength: 1000,
      order: 1,
      active: true
    }
  ]
};

const E2E_PROFILE = {
  name: "Administrador E2E",
  email: E2E_USER.email,
  role: "admin",
  squad: "squad_d",
  active: true,
  accessLocked: false
};

export const browserLocalPersistence = "local";
export const browserSessionPersistence = "session";
export function initializeApp(config) { return { config }; }
export function getAuth(app) { return { app, currentUser: null }; }
export function getFirestore(app) { return { app }; }
export async function setPersistence() {}
export async function signInWithEmailAndPassword() { return { user: E2E_USER }; }
export async function createUserWithEmailAndPassword() { return { user: E2E_USER }; }
export async function acceptUserInvite() { return { uid: E2E_USER.uid }; }
export async function deleteUser() {}
export async function signOut(auth) { auth.currentUser = null; }
export async function sendPasswordResetEmail() {}
export async function getLegalAcceptanceStatus() { return { accepted: true, version: "e2e" }; }
export async function acceptLegalTerms() { return { accepted: true }; }
export function clearAuthSessionStorage() {}
export async function getMfaAssuranceLevel() { return { currentLevel: "aal1", nextLevel: "aal1" }; }
export async function listMfaFactors() { return { all: [], totp: [] }; }
export async function enrollMfaTotp() { return { id: "e2e-factor", totp: {} }; }
export async function challengeMfaFactor() { return { id: "e2e-challenge" }; }
export async function verifyMfaFactor() {}
export async function unenrollMfaFactor() {}
export const EmailAuthProvider = { credential(email, password) { return { email, password }; } };
export async function reauthenticateWithCredential() {}
export async function updatePassword() {}

export function onAuthStateChanged(auth, callback) {
  queueMicrotask(() => {
    const user = AUTHENTICATED ? E2E_USER : null;
    auth.currentUser = user;
    callback(user, "INITIAL_SESSION");
  });
  return () => {};
}

export class Timestamp {
  constructor(date = new Date()) { this.date = date instanceof Date ? date : new Date(date); }
  static fromDate(date) { return new Timestamp(date); }
  static now() { return new Timestamp(new Date()); }
  toDate() { return new Date(this.date); }
  toMillis() { return this.date.getTime(); }
}

export class Bytes {
  constructor(bytes = new Uint8Array()) { this.bytes = bytes; }
  static fromBase64String(value) {
    return new Bytes(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));
  }
  toBase64() { return btoa(String.fromCharCode(...this.bytes)); }
}

export function serverTimestamp() { return Timestamp.now(); }
export function increment(amount) { return { __increment: Number(amount || 0) }; }
export function collection(db, name) { return { kind: "collection", db, collectionName: name }; }
export function doc(first, second, third) {
  if (first?.kind === "collection") {
    return { kind: "document", db: first.db, collectionName: first.collectionName, id: second || crypto.randomUUID() };
  }
  return { kind: "document", db: first, collectionName: second, id: third || crypto.randomUUID() };
}
export function where(field, operator, value) { return { field, operator, value }; }
export function query(collectionReference, ...conditions) { return { kind: "query", collectionReference, conditions }; }

function existingSnapshot(id, data) {
  return { id, exists: () => true, data: () => structuredClone(data) };
}
function missingSnapshot(id) { return { id, exists: () => false, data: () => undefined }; }
function collectionName(reference) {
  return reference?.collectionName || reference?.collectionReference?.collectionName || "";
}

export async function getDoc(reference) {
  if (reference.collectionName === "users" && reference.id === E2E_USER.uid) {
    return existingSnapshot(E2E_USER.uid, E2E_PROFILE);
  }
  return missingSnapshot(reference.id);
}
export async function getDocs(reference) {
  const name = collectionName(reference);
  let docs = [];
  if (name === "users" && AUTHENTICATED) {
    docs = [existingSnapshot(E2E_USER.uid, E2E_PROFILE)];
  } else if (name === "requestProjects" && AUTHENTICATED) {
    docs = [existingSnapshot("acesso-remoto", E2E_CUSTOM_PROJECT)];
  }
  return { docs, empty: docs.length === 0, size: docs.length };
}
export async function setDoc() {}
export async function updateDoc() {}
export async function deleteDoc() {}
export function writeBatch() {
  return { set() {}, update() {}, delete() {}, async commit() {} };
}
export function onSnapshot(reference, next) {
  queueMicrotask(async () => {
    next(reference.kind === "document" ? await getDoc(reference) : await getDocs(reference));
  });
  return () => {};
}

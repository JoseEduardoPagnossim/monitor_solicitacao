import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
  Bytes,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const STATUS_LABELS = {
  nova: "Nova",
  analise: "Em análise",
  aguardando: "Aguardando",
  concluida: "Concluída"
};

const TYPE_LABELS = {
  programacao: "Programação",
  cancelamento: "Cancelamento"
};

const PRIORITY_LABELS = {
  urgente: "Urgente",
  alta: "Alta",
  normal: "Normal",
  baixa: "Baixa"
};

const VALID_STATUSES = Object.keys(STATUS_LABELS);
const VALID_TYPES = Object.keys(TYPE_LABELS);
const VALID_PRIORITIES = Object.keys(PRIORITY_LABELS);
const MAX_CANCELLATION_ITEMS = 50;
const MAX_ATTACHMENTS = 2;
const MAX_IMAGE_SOURCE_SIZE = 5 * 1024 * 1024;
const MAX_STORED_ATTACHMENT_SIZE = 700 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "text/plain"]);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const state = {
  user: null,
  profile: null,
  requests: [],
  users: [],
  unsubscribeRequests: null,
  elapsedTimer: null,
  filters: { search: "", type: "all", priority: "all", requester: "all" },
  draggedId: null,
  modalEditable: true,
  modalCancellationItems: [],
  modalExistingAttachments: [],
  modalNewAttachments: [],
  modalRemovedAttachmentKeys: []
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  loginView: $("#login-view"),
  appView: $("#app-view"),
  loginForm: $("#login-form"),
  loginEmail: $("#login-email"),
  loginPassword: $("#login-password"),
  loginButton: $("#login-button"),
  loginError: $("#login-error"),
  rememberEmail: $("#remember-email"),
  togglePassword: $("#toggle-password"),
  forgotPassword: $("#forgot-password"),
  logoutButton: $("#logout-button"),
  userName: $("#user-name"),
  userRole: $("#user-role"),
  userAvatar: $("#user-avatar"),
  welcomeMessage: $("#welcome-message"),
  newRequestButton: $("#new-request-button"),
  helpButton: $("#help-button"),
  topHelpButton: $("#top-help-button"),
  helpDialog: $("#help-dialog"),
  refreshButton: $("#refresh-button"),
  metricOpen: $("#metric-open"),
  metricOldest: $("#metric-oldest"),
  metricProgramming: $("#metric-programming"),
  metricDone: $("#metric-done"),
  searchInput: $("#search-input"),
  typeFilter: $("#type-filter"),
  priorityFilter: $("#priority-filter"),
  requesterFilter: $("#requester-filter"),
  clearFilters: $("#clear-filters"),
  kanbanBoard: $("#kanban-board"),
  emptyState: $("#empty-state"),
  requestDialog: $("#request-dialog"),
  requestForm: $("#request-form"),
  requestModalTitle: $("#request-modal-title"),
  requestId: $("#request-id"),
  requestType: $("#request-type"),
  priorityField: $("#priority-field"),
  requestPriority: $("#request-priority"),
  programmingFields: $("#programming-fields"),
  requestClient: $("#request-client"),
  requestClientCode: $("#request-client-code"),
  requestContactName: $("#request-contact-name"),
  requestContactRole: $("#request-contact-role"),
  requestContactEmail: $("#request-contact-email"),
  requestContactPhone: $("#request-contact-phone"),
  requestContactPhoneError: $("#request-contact-phone-error"),
  requestTitle: $("#request-title"),
  requestDescription: $("#request-description"),
  requestCurrentBehavior: $("#request-current-behavior"),
  requestExpectedBehavior: $("#request-expected-behavior"),
  requestJustification: $("#request-justification"),
  requestLink: $("#request-link"),
  attachmentPicker: $("#attachment-picker"),
  requestAttachments: $("#request-attachments"),
  attachmentList: $("#attachment-list"),
  cancellationFields: $("#cancellation-fields"),
  cancellationEntry: $("#cancellation-entry"),
  cancellationCnpjInput: $("#cancellation-cnpj-input"),
  cancellationClientNameInput: $("#cancellation-client-name-input"),
  cancellationReasonInput: $("#cancellation-reason-input"),
  cancellationListCount: $("#cancellation-list-count"),
  cancellationList: $("#cancellation-list"),
  addCancellationItem: $("#add-cancellation-item"),
  requestStatus: $("#request-status"),
  requestAssignee: $("#request-assignee"),
  requestAudit: $("#request-audit"),
  requestError: $("#request-error"),
  saveRequestButton: $("#save-request-button"),
  copyRequestButton: $("#copy-request-button"),
  deleteRequestButton: $("#delete-request-button"),
  deleteConfirmDialog: $("#delete-confirm-dialog"),
  deleteConfirmMessage: $("#delete-confirm-message"),
  confirmDeleteButton: $("#confirm-delete-button"),
  resetDialog: $("#reset-dialog"),
  resetForm: $("#reset-form"),
  resetEmail: $("#reset-email"),
  resetError: $("#reset-error"),
  sidebar: $(".sidebar"),
  mobileMenuButton: $("#mobile-menu-button"),
  toastContainer: $("#toast-container")
};

function isConfigReady() {
  return firebaseConfig.apiKey
    && !firebaseConfig.apiKey.includes("COLE_")
    && firebaseConfig.projectId
    && firebaseConfig.projectId !== "SEU_PROJETO";
}

function isAdmin() {
  return state.profile?.role === "admin";
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function showFormError(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

function setButtonLoading(button, loading, loadingText = "Salvando...") {
  if (loading) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = loadingText;
    return;
  }
  button.disabled = false;
  button.innerHTML = button.dataset.originalText || button.innerHTML;
}

function sanitizeText(value = "") {
  return String(value).replace(/[<>]/g, "").trim();
}

function documentDigits(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 14);
}

function formatCpfCnpj(value = "") {
  const digits = documentDigits(value);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function hasRepeatedDigits(digits) {
  return /^(\d)\1+$/.test(digits);
}

function isValidCpf(value = "") {
  const digits = documentDigits(value);
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(digits[9])
    && calculateDigit(10) === Number(digits[10]);
}

function isValidCnpj(value = "") {
  const digits = documentDigits(value);
  if (digits.length !== 14 || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (baseLength) => {
    const weights = baseLength === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12])
    && calculateDigit(13) === Number(digits[13]);
}

function isValidCpfCnpj(value = "") {
  const digits = documentDigits(value);
  return digits.length === 11 ? isValidCpf(digits) : isValidCnpj(digits);
}

function setDocumentValidity(input, { required = false, showMessage = false } = {}) {
  const value = input.value.trim();
  let message = "";

  if (!value && required) message = "Informe o CPF ou CNPJ.";
  else if (value && !isValidCpfCnpj(value)) message = "O documento não é válido.";

  const messageElement = input.dataset.validationMessage
    ? document.getElementById(input.dataset.validationMessage)
    : null;
  const visibleMessage = showMessage ? message : "";

  input.setCustomValidity(message);
  input.classList.toggle("input-invalid", Boolean(visibleMessage));
  input.classList.toggle("input-valid", Boolean(value) && !message);
  input.setAttribute("aria-invalid", visibleMessage ? "true" : "false");

  if (messageElement) {
    messageElement.textContent = visibleMessage;
    messageElement.hidden = !visibleMessage;
  }

  return !message;
}

function setupDocumentInput(input, options = {}) {
  input.addEventListener("input", () => {
    input.value = formatCpfCnpj(input.value);
    setDocumentValidity(input, { ...options, showMessage: false });
  });
  input.addEventListener("blur", () => {
    input.value = formatCpfCnpj(input.value);
    setDocumentValidity(input, { ...options, showMessage: true });
  });
}

function phoneDigits(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 11);
}

function formatPhone(value = "") {
  const digits = phoneDigits(value);
  if (!digits) return "";

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidPhone(value = "") {
  const digits = phoneDigits(value);
  return digits.length === 10 || digits.length === 11;
}

function setPhoneValidity(input, { showMessage = false } = {}) {
  const value = input.value.trim();
  let message = "";

  if (!value) message = "Informe o telefone com DDD.";
  else if (!isValidPhone(value)) message = "Informe um telefone fixo ou celular com DDD válido.";

  const messageElement = input.dataset.validationMessage
    ? document.getElementById(input.dataset.validationMessage)
    : null;
  const visibleMessage = showMessage ? message : "";

  input.setCustomValidity(message);
  input.classList.toggle("input-invalid", Boolean(visibleMessage));
  input.classList.toggle("input-valid", Boolean(value) && !message);
  input.setAttribute("aria-invalid", visibleMessage ? "true" : "false");

  if (messageElement) {
    messageElement.textContent = visibleMessage;
    messageElement.hidden = !visibleMessage;
  }

  return !message;
}

function setupPhoneInput(input) {
  input.addEventListener("input", () => {
    input.value = formatPhone(input.value);
    setPhoneValidity(input, { showMessage: false });
  });
  input.addEventListener("blur", () => {
    input.value = formatPhone(input.value);
    setPhoneValidity(input, { showMessage: true });
  });
}

function attachmentExtension(fileName = "") {
  return fileName.toLocaleLowerCase("pt-BR").split(".").pop() || "";
}

function normalizedAttachmentType(file) {
  if (ALLOWED_ATTACHMENT_TYPES.has(file.type)) return file.type;
  const extension = attachmentExtension(file.name);
  if (["jpg", "jpeg"].includes(extension)) return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "txt") return "text/plain";
  return "";
}

function isAllowedAttachment(file) {
  return Boolean(normalizedAttachmentType(file));
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentKey(attachment = {}) {
  if (attachment.storage === "firestore" && attachment.id) return `firestore:${attachment.id}`;
  if (attachment.path) return `storage:${attachment.path}`;
  if (attachment.url) return `url:${attachment.url}`;
  return `name:${attachment.name || "anexo"}:${attachment.size || 0}`;
}

function normalizeAttachment(attachment = {}) {
  const inferredStorage = attachment.storage
    || (attachment.id ? "firestore" : attachment.path ? "storage" : attachment.url ? "url" : "");
  return {
    id: String(attachment.id || ""),
    storage: String(inferredStorage || ""),
    name: String(attachment.name || "Anexo"),
    url: String(attachment.url || ""),
    path: String(attachment.path || ""),
    contentType: String(attachment.contentType || ""),
    size: Number(attachment.size || 0)
  };
}

function retainedModalAttachments() {
  return state.modalExistingAttachments.filter(
    (attachment) => !state.modalRemovedAttachmentKeys.includes(attachmentKey(attachment))
  );
}

function totalModalAttachments() {
  return retainedModalAttachments().length + state.modalNewAttachments.length;
}

async function openFirestoreAttachment(attachment, button = null) {
  if (!attachment?.id) return;
  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Abrindo...";
  }

  try {
    const snapshot = await getDoc(doc(db, "requestAttachments", attachment.id));
    if (!snapshot.exists()) throw new Error("attachment-not-found");
    const stored = snapshot.data();
    const bytes = stored.data?.toUint8Array?.();
    if (!bytes) throw new Error("attachment-invalid");

    const blob = new Blob([bytes], { type: stored.contentType || attachment.contentType || "application/octet-stream" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = stored.name || attachment.name || "anexo";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    console.error(error);
    showToast("Não foi possível abrir o anexo.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function renderAttachmentList() {
  const retainedExisting = retainedModalAttachments();
  const canAdd = state.modalEditable && totalModalAttachments() < MAX_ATTACHMENTS;

  els.attachmentPicker.hidden = !state.modalEditable;
  els.requestAttachments.disabled = !state.modalEditable || !canAdd;
  const pickerButton = $(".attachment-picker-button", els.attachmentPicker);
  if (pickerButton) {
    pickerButton.classList.toggle("disabled", !canAdd);
    pickerButton.setAttribute("aria-disabled", canAdd ? "false" : "true");
  }

  const existingHtml = retainedExisting.map((attachment, index) => {
    const openControl = attachment.storage === "firestore" && attachment.id
      ? `<button class="attachment-open-link" type="button" data-attachment-id="${escapeHtml(attachment.id)}">${escapeHtml(attachment.name)}</button>`
      : attachment.url
        ? `<a href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(attachment.name)}</a>`
        : `<strong>${escapeHtml(attachment.name)}</strong>`;
    return `
      <div class="attachment-item">
        <div class="attachment-icon">${attachment.contentType === "text/plain" ? "TXT" : "IMG"}</div>
        <div class="attachment-info">
          ${openControl}
          <small>${attachment.size ? formatFileSize(attachment.size) : "Arquivo salvo"}</small>
        </div>
        ${state.modalEditable ? `<button class="icon-button remove-attachment" type="button" data-attachment-source="existing" data-attachment-index="${index}" title="Remover anexo" aria-label="Remover anexo">×</button>` : ""}
      </div>`;
  }).join("");

  const pendingHtml = state.modalNewAttachments.map((file, index) => `
    <div class="attachment-item pending">
      <div class="attachment-icon">${file.contentType === "text/plain" ? "TXT" : "IMG"}</div>
      <div class="attachment-info">
        <strong>${escapeHtml(file.name)}</strong>
        <small>${formatFileSize(file.size)} · pronto para salvar no Firestore</small>
      </div>
      ${state.modalEditable ? `<button class="icon-button remove-attachment" type="button" data-attachment-source="new" data-attachment-index="${index}" title="Remover anexo" aria-label="Remover anexo">×</button>` : ""}
    </div>`).join("");

  els.attachmentList.innerHTML = existingHtml || pendingHtml
    ? `${existingHtml}${pendingHtml}<div class="attachment-counter">${totalModalAttachments()} de ${MAX_ATTACHMENTS} anexos</div>`
    : `<div class="attachment-empty">Nenhum anexo selecionado.</div>`;

  $$(".attachment-open-link", els.attachmentList).forEach((button) => {
    button.addEventListener("click", () => {
      const attachment = retainedExisting.find((item) => item.id === button.dataset.attachmentId);
      openFirestoreAttachment(attachment, button);
    });
  });

  $$(".remove-attachment", els.attachmentList).forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.attachmentIndex);
      if (button.dataset.attachmentSource === "new") {
        state.modalNewAttachments.splice(index, 1);
      } else {
        const attachment = retainedExisting[index];
        const key = attachmentKey(attachment);
        if (attachment && !state.modalRemovedAttachmentKeys.includes(key)) {
          state.modalRemovedAttachmentKeys.push(key);
        }
      }
      renderAttachmentList();
    });
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image-compression-failed")), type, quality);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-read-failed"));
    };
    image.src = url;
  });
}

function replaceExtension(fileName, extension) {
  const base = fileName.replace(/\.[^.]+$/, "") || "imagem";
  return `${base}.${extension}`;
}

async function compressImageAttachment(file) {
  const image = await loadImage(file);
  const sourceLargestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(1, sourceLargestSide));
  const originalType = normalizedAttachmentType(file);

  for (let resizeAttempt = 0; resizeAttempt < 6; resizeAttempt += 1) {
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: originalType === "image/png" });
    if (!context) throw new Error("image-compression-failed");

    if (originalType !== "image/png") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);

    if (originalType === "image/png") {
      const pngBlob = await canvasToBlob(canvas, "image/png");
      if (pngBlob.size <= MAX_STORED_ATTACHMENT_SIZE) {
        return { name: file.name, contentType: "image/png", size: pngBlob.size, blob: pngBlob, originalSize: file.size };
      }
    }

    const jpegCanvas = document.createElement("canvas");
    jpegCanvas.width = width;
    jpegCanvas.height = height;
    const jpegContext = jpegCanvas.getContext("2d");
    if (!jpegContext) throw new Error("image-compression-failed");
    jpegContext.fillStyle = "#ffffff";
    jpegContext.fillRect(0, 0, width, height);
    jpegContext.drawImage(image, 0, 0, width, height);

    for (const quality of [0.86, 0.78, 0.70, 0.62, 0.54, 0.46]) {
      const jpegBlob = await canvasToBlob(jpegCanvas, "image/jpeg", quality);
      if (jpegBlob.size <= MAX_STORED_ATTACHMENT_SIZE) {
        return {
          name: originalType === "image/png" ? replaceExtension(file.name, "jpg") : file.name,
          contentType: "image/jpeg",
          size: jpegBlob.size,
          blob: jpegBlob,
          originalSize: file.size
        };
      }
    }

    scale *= 0.78;
  }

  throw new Error("attachment-too-large");
}

async function prepareAttachment(file) {
  const contentType = normalizedAttachmentType(file);
  if (contentType === "text/plain") {
    if (file.size > MAX_STORED_ATTACHMENT_SIZE) throw new Error("attachment-too-large");
    return { name: file.name, contentType, size: file.size, blob: file, originalSize: file.size };
  }
  return compressImageAttachment(file);
}

async function handleAttachmentSelection(event) {
  const selectedFiles = [...event.target.files];
  event.target.value = "";
  showFormError(els.requestError);
  const pickerButton = $(".attachment-picker-button", els.attachmentPicker);
  pickerButton?.classList.add("processing");

  try {
    for (const file of selectedFiles) {
      if (totalModalAttachments() >= MAX_ATTACHMENTS) {
        showToast(`É possível anexar no máximo ${MAX_ATTACHMENTS} arquivos.`, "warning");
        break;
      }
      if (!isAllowedAttachment(file)) {
        showFormError(els.requestError, `O arquivo “${file.name}” não possui um formato permitido.`);
        continue;
      }
      if (normalizedAttachmentType(file) !== "text/plain" && file.size > MAX_IMAGE_SOURCE_SIZE) {
        showFormError(els.requestError, `A imagem “${file.name}” ultrapassa o limite de 5 MB antes da compactação.`);
        continue;
      }

      const duplicate = state.modalNewAttachments.some(
        (existingFile) => existingFile.name === file.name && existingFile.originalSize === file.size
      );
      if (duplicate) continue;

      try {
        const prepared = await prepareAttachment(file);
        state.modalNewAttachments.push(prepared);
        if (prepared.size < file.size && prepared.contentType !== "text/plain") {
          showToast(`Imagem “${file.name}” compactada para ${formatFileSize(prepared.size)}.`);
        }
      } catch (error) {
        console.error(error);
        const message = error.message === "attachment-too-large"
          ? `O arquivo “${file.name}” não pôde ser reduzido para o limite de 700 KB.`
          : `Não foi possível preparar o arquivo “${file.name}”.`;
        showFormError(els.requestError, message);
      }
    }
  } finally {
    pickerButton?.classList.remove("processing");
    renderAttachmentList();
  }
}

async function buildPendingAttachmentWrites(ownerUid, requestId) {
  const writes = [];
  for (const attachment of state.modalNewAttachments) {
    const attachmentReference = doc(collection(db, "requestAttachments"));
    const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
    writes.push({
      reference: attachmentReference,
      metadata: {
        id: attachmentReference.id,
        storage: "firestore",
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size
      },
      data: {
        requestId,
        ownerUid,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
        data: Bytes.fromUint8Array(bytes),
        createdAt: serverTimestamp(),
        createdByUid: state.user.uid
      }
    });
  }
  return writes;
}

function firestoreAttachmentReference(attachment) {
  return attachment?.storage === "firestore" && attachment.id
    ? doc(db, "requestAttachments", attachment.id)
    : null;
}

function normalizeUrl(value = "") {
  const url = value.trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function timestampToDate(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function elapsedMs(createdAt, endAt = null) {
  const start = timestampToDate(createdAt);
  const end = endAt ? timestampToDate(endAt) : new Date();
  return start && !Number.isNaN(start.getTime())
    ? Math.max(0, end.getTime() - start.getTime())
    : 0;
}

function formatElapsed(milliseconds, compact = false) {
  const totalMinutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (compact) {
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${Math.max(0, minutes)}m`;
  }

  if (days > 0) return `${days} dia${days === 1 ? "" : "s"} e ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${Math.max(0, minutes)} minuto${minutes === 1 ? "" : "s"}`;
}

function formatDateTime(value) {
  const date = timestampToDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join("") || "U").toUpperCase();
}

function firebaseErrorMessage(error) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/user-disabled": "Este usuário está desativado.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/missing-password": "Informe sua senha.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
    "auth/user-not-found": "Usuário não encontrado.",
    "permission-denied": "Você não possui permissão para executar esta ação.",
    "resource-exhausted": "O limite gratuito do Firestore foi atingido. Tente novamente mais tarde.",
    "failed-precondition": "A operação não pôde ser concluída com a configuração atual do Firestore."
  };
  return messages[error?.code]
    || messages[error?.message]
    || "Não foi possível concluir a operação. Tente novamente.";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadProfile(user) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  if (!snapshot.exists()) throw new Error("profile-not-found");
  return { uid: snapshot.id, ...snapshot.data() };
}

async function loadUsers() {
  if (!isAdmin()) {
    state.users = [state.profile];
    populateUserOptions();
    return;
  }

  const snapshots = await getDocs(collection(db, "users"));
  state.users = snapshots.docs
    .map((documentSnapshot) => ({ uid: documentSnapshot.id, ...documentSnapshot.data() }))
    .filter((user) => user.active !== false);

  state.users.sort((a, b) => (a.name || a.email || "").localeCompare(
    b.name || b.email || "",
    "pt-BR"
  ));
  populateUserOptions();
}

function populateUserOptions() {
  const requesters = state.users
    .map((user) => `<option value="${escapeHtml(user.uid)}">${escapeHtml(user.name || user.email || "Usuário")}</option>`)
    .join("");

  els.requesterFilter.innerHTML = `<option value="all">Todos os solicitantes</option>${requesters}`;
  els.requestAssignee.innerHTML = `<option value="">Não atribuído</option>${requesters}`;
}

function subscribeRequests() {
  if (state.unsubscribeRequests) state.unsubscribeRequests();
  renderLoadingCards();

  const base = collection(db, "requests");
  const requestsQuery = isAdmin()
    ? base
    : query(base, where("requesterUid", "==", state.user.uid));

  state.unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
    state.requests = snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }));
    renderAll();
  }, (error) => {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  });
}

function cancellationItemsFromRequest(item) {
  if (Array.isArray(item.cancellationItems) && item.cancellationItems.length) {
    return item.cancellationItems.map((entry) => ({
      clientName: entry?.clientName || entry?.companyName || "",
      clientCnpj: entry?.clientCnpj || entry?.cnpj || "",
      reason: entry?.reason || entry?.motivo || ""
    }));
  }

  if (item.type === "cancelamento") {
    return [{
      clientName: item.clientName || "",
      clientCnpj: item.clientCode || "",
      reason: item.description || ""
    }];
  }

  return [];
}

function filteredRequests() {
  const term = state.filters.search.toLocaleLowerCase("pt-BR");

  return state.requests.filter((item) => {
    const cancellationSearch = cancellationItemsFromRequest(item)
      .flatMap((entry) => [entry.clientName, entry.clientCnpj, entry.reason]);

    const haystack = [
      item.clientName,
      item.clientCode,
      item.title,
      item.description,
      item.contactName,
      item.contactRole,
      item.contactEmail,
      item.contactPhone,
      item.currentBehavior,
      item.expectedBehavior,
      item.justification,
      item.requesterName,
      item.requesterEmail,
      item.assigneeName,
      ...cancellationSearch
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR");

    return (!term || haystack.includes(term))
      && (state.filters.type === "all" || item.type === state.filters.type)
      && (state.filters.priority === "all" || item.priority === state.filters.priority)
      && (state.filters.requester === "all" || item.requesterUid === state.filters.requester);
  });
}

function requestAge(item) {
  return elapsedMs(item.createdAt, item.status === "concluida" ? item.completedAt : null);
}

function requestCardTitle(item) {
  if (item.type !== "cancelamento") return item.title || "Sem título";
  const entries = cancellationItemsFromRequest(item);
  if (entries.length > 1) return `Cancelamentos — ${entries.length} clientes`;
  return item.title || `Cancelamento — ${entries[0]?.clientName || "cliente"}`;
}

function requestCardClient(item) {
  if (item.type !== "cancelamento") {
    return {
      name: item.clientName || "Cliente não informado",
      code: item.clientCode || ""
    };
  }

  const entries = cancellationItemsFromRequest(item);
  const first = entries[0] || {};
  return {
    name: first.clientName || "Cliente não informado",
    code: entries.length > 1 ? `+${entries.length - 1} cliente${entries.length - 1 === 1 ? "" : "s"}` : first.clientCnpj || ""
  };
}

function requestCardDescription(item) {
  if (item.type !== "cancelamento") return item.description || "";
  const entries = cancellationItemsFromRequest(item);
  if (entries.length === 1) return entries[0]?.reason || "";
  return entries.map((entry) => entry.clientName).filter(Boolean).join(" · ");
}

function cardHtml(item, isOldest) {
  const age = requestAge(item);
  const ageHours = age / 3600000;
  const ageClass = item.status === "concluida"
    ? ""
    : ageHours >= 48
      ? "age-critical"
      : ageHours >= 24
        ? "age-warning"
        : "";
  const draggable = isAdmin() ? "true" : "false";
  const videoLink = normalizeUrl(item.videoLink || item.externalLink || "");
  const cardClient = requestCardClient(item);
  const title = requestCardTitle(item);
  const copyButton = isAdmin()
    ? `<button class="card-copy-button" type="button" data-copy-id="${escapeHtml(item.id)}" title="Copiar dados da solicitação">⧉ Copiar</button>`
    : "";
  const attachmentCount = Array.isArray(item.attachments) ? item.attachments.length : 0;

  return `
    <article class="request-card ${ageClass} ${isOldest ? "oldest" : ""}" data-id="${escapeHtml(item.id)}" draggable="${draggable}" tabindex="0" role="button" aria-label="Abrir solicitação ${escapeHtml(title)}">
      <div class="card-top">
        <div class="card-tags">
          <span class="tag ${item.type}">${TYPE_LABELS[item.type] || "Solicitação"}</span>
          ${item.type === "programacao" ? `<span class="tag ${item.priority}">${PRIORITY_LABELS[item.priority] || "Normal"}</span>` : ""}
          ${attachmentCount ? `<span class="tag attachment">📎 ${attachmentCount}</span>` : ""}
        </div>
        <span class="card-time ${ageHours >= 48 && item.status !== "concluida" ? "critical" : ""}" data-created-at="${timestampToDate(item.createdAt)?.toISOString() || ""}" data-completed-at="${timestampToDate(item.completedAt)?.toISOString() || ""}" data-status="${item.status}">◷ ${formatElapsed(age, true)}</span>
      </div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
      <p class="card-client"><strong>${escapeHtml(cardClient.name)}</strong>${cardClient.code ? ` · ${escapeHtml(cardClient.code)}` : ""}</p>
      <p class="card-description">${escapeHtml(requestCardDescription(item))}</p>
      <footer class="card-footer">
        <div class="card-person" title="Solicitado por ${escapeHtml(item.requesterName || item.requesterEmail || "")}">
          <span class="mini-avatar">${initials(item.requesterName || item.requesterEmail)}</span>
          <span>${escapeHtml(item.requesterName || item.requesterEmail || "Usuário")}</span>
        </div>
        <div class="card-actions">
          ${videoLink && item.type === "programacao" ? `<a class="card-link" href="${escapeHtml(videoLink)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Ver vídeo ↗</a>` : ""}
          ${copyButton}
        </div>
      </footer>
    </article>`;
}

function renderAll() {
  renderBoard();
  renderMetrics();
  updateElapsedLabels(false);
}

function renderBoard() {
  const filtered = filteredRequests();
  const openFiltered = filtered.filter((request) => request.status !== "concluida");
  const oldestId = [...openFiltered].sort((a, b) => requestAge(b) - requestAge(a))[0]?.id;
  let renderedCount = 0;

  VALID_STATUSES.forEach((status) => {
    const column = $(`[data-dropzone="${status}"]`);
    const items = filtered
      .filter((request) => request.status === status)
      .sort((a, b) => {
        if (status === "concluida") {
          return (timestampToDate(b.completedAt)?.getTime() || 0)
            - (timestampToDate(a.completedAt)?.getTime() || 0);
        }
        return requestAge(b) - requestAge(a);
      });

    renderedCount += items.length;
    $(`[data-count="${status}"]`).textContent = items.length;
    column.innerHTML = items.length
      ? items.map((item) => cardHtml(item, item.id === oldestId)).join("")
      : `<div class="column-empty">Nenhuma solicitação nesta etapa</div>`;
  });

  els.kanbanBoard.hidden = renderedCount === 0;
  els.emptyState.hidden = renderedCount !== 0;
  bindCardEvents();
}

function renderMetrics() {
  const open = state.requests.filter((request) => request.status !== "concluida");
  const done = state.requests.filter((request) => request.status === "concluida");
  const programming = state.requests.filter((request) => request.type === "programacao" && request.status !== "concluida");
  const oldest = [...open].sort((a, b) => requestAge(b) - requestAge(a))[0];

  els.metricOpen.textContent = open.length;
  els.metricDone.textContent = done.length;
  els.metricProgramming.textContent = programming.length;
  els.metricOldest.textContent = oldest ? formatElapsed(requestAge(oldest), true) : "—";
}

function renderLoadingCards() {
  VALID_STATUSES.forEach((status) => {
    const column = $(`[data-dropzone="${status}"]`);
    column.innerHTML = `<div class="loading-card"></div><div class="loading-card"></div>`;
  });
}

function updateElapsedLabels(updateMetrics = true) {
  $$('[data-created-at]').forEach((element) => {
    if (!element.dataset.createdAt) return;
    const end = element.dataset.status === "concluida" && element.dataset.completedAt
      ? new Date(element.dataset.completedAt)
      : null;
    element.textContent = `◷ ${formatElapsed(elapsedMs(new Date(element.dataset.createdAt), end), true)}`;
  });
  if (updateMetrics) renderMetrics();
}

function bindCardEvents() {
  $$(".request-card").forEach((card) => {
    const open = () => openRequestModal(card.dataset.id);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        open();
      }
    });

    if (isAdmin()) {
      card.addEventListener("dragstart", (event) => {
        state.draggedId = card.dataset.id;
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.dataset.id);
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        state.draggedId = null;
      });
    }
  });

  $$(".card-copy-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      copyRequestById(button.dataset.copyId);
    });
    button.addEventListener("keydown", (event) => event.stopPropagation());
  });
}

function setupDropzones() {
  $$('[data-dropzone]').forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      if (!isAdmin()) return;
      event.preventDefault();
      zone.classList.add("drag-over");
    });

    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));

    zone.addEventListener("drop", async (event) => {
      if (!isAdmin()) return;
      event.preventDefault();
      zone.classList.remove("drag-over");

      const id = event.dataTransfer.getData("text/plain") || state.draggedId;
      const item = state.requests.find((request) => request.id === id);
      const newStatus = zone.dataset.dropzone;
      if (!item || item.status === newStatus) return;

      try {
        const update = {
          status: newStatus,
          updatedAt: serverTimestamp(),
          updatedByUid: state.user.uid,
          updatedByName: state.profile.name || state.user.email
        };
        if (newStatus === "concluida") update.completedAt = serverTimestamp();
        else if (item.status === "concluida") update.completedAt = null;

        await updateDoc(doc(db, "requests", id), update);
        showToast(`Solicitação movida para ${STATUS_LABELS[newStatus]}.`);
      } catch (error) {
        console.error(error);
        showToast(firebaseErrorMessage(error), "error");
      }
    });
  });
}

function setAdminVisibility() {
  $$(".admin-only").forEach((element) => {
    element.hidden = !isAdmin();
  });
  els.requesterFilter.hidden = !isAdmin();
}

function renderUser() {
  const name = state.profile.name || state.user.email;
  els.userName.textContent = name;
  els.userRole.textContent = isAdmin() ? "Administrador" : "Solicitante";
  els.userAvatar.textContent = initials(name);
  els.welcomeMessage.textContent = isAdmin()
    ? "Gerencie, priorize e conclua as demandas da equipe."
    : "Registre e acompanhe suas solicitações.";
  setAdminVisibility();
}

function blankCancellationItem() {
  return { clientName: "", clientCnpj: "", reason: "" };
}

function cancellationItemHtml(item, index, editable) {
  return `
    <tr class="cancellation-list-row" data-cancellation-index="${index}">
      <td class="cancellation-row-number">${index + 1}</td>
      <td><strong>${escapeHtml(item.clientCnpj || "—")}</strong></td>
      <td><strong>${escapeHtml(item.clientName || "—")}</strong></td>
      <td class="cancellation-row-reason">${escapeHtml(item.reason || "—")}</td>
      ${editable ? `<td class="cancellation-row-action"><button class="remove-cancellation-item" type="button" data-index="${index}" aria-label="Remover cliente ${index + 1}">Remover</button></td>` : ""}
    </tr>`;
}

function updateCancellationListCount() {
  const total = state.modalCancellationItems.length;
  els.cancellationListCount.textContent = `${total} ${total === 1 ? "cliente" : "clientes"}`;
}

function renderCancellationItems(items = state.modalCancellationItems, editable = state.modalEditable) {
  state.modalCancellationItems = (Array.isArray(items) ? items : [])
    .slice(0, MAX_CANCELLATION_ITEMS)
    .map((item) => ({
      clientName: sanitizeText(item.clientName || ""),
      clientCnpj: sanitizeText(item.clientCnpj || ""),
      reason: sanitizeText(item.reason || "")
    }));

  if (!state.modalCancellationItems.length) {
    els.cancellationList.innerHTML = `
      <div class="cancellation-empty-state">
        <strong>A lista está vazia.</strong>
        <span>Preencha os três campos fixos acima e clique em “Adicionar cliente à lista”.</span>
      </div>`;
  } else {
    els.cancellationList.innerHTML = `
      <div class="cancellation-table-wrap">
        <table class="cancellation-table">
          <thead>
            <tr>
              <th>#</th>
              <th>CPF/CNPJ</th>
              <th>Razão Social</th>
              <th>Motivo</th>
              ${editable ? "<th>Ação</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${state.modalCancellationItems.map((item, index) => cancellationItemHtml(item, index, editable)).join("")}
          </tbody>
        </table>
      </div>`;
  }

  $$(".remove-cancellation-item", els.cancellationList).forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (Number.isNaN(index)) return;
      state.modalCancellationItems.splice(index, 1);
      renderCancellationItems(state.modalCancellationItems, state.modalEditable);
    });
  });

  els.cancellationEntry.hidden = !editable;
  els.addCancellationItem.disabled = !editable || state.modalCancellationItems.length >= MAX_CANCELLATION_ITEMS;
  updateCancellationListCount();
}

function getCancellationItemsFromForm() {
  return state.modalCancellationItems.map((item) => ({ ...item }));
}

function getCancellationDraft() {
  return {
    clientCnpj: sanitizeText(els.cancellationCnpjInput.value),
    clientName: sanitizeText(els.cancellationClientNameInput.value),
    reason: sanitizeText(els.cancellationReasonInput.value)
  };
}

function clearCancellationDraft() {
  els.cancellationCnpjInput.value = "";
  els.cancellationCnpjInput.setCustomValidity("");
  els.cancellationCnpjInput.classList.remove("input-invalid", "input-valid");
  els.cancellationCnpjInput.setAttribute("aria-invalid", "false");
  const messageElement = document.getElementById(els.cancellationCnpjInput.dataset.validationMessage);
  if (messageElement) {
    messageElement.textContent = "";
    messageElement.hidden = true;
  }
  els.cancellationClientNameInput.value = "";
  els.cancellationReasonInput.value = "";
}

function addCancellationItem() {
  if (!state.modalEditable) return;
  showFormError(els.requestError);

  if (state.modalCancellationItems.length >= MAX_CANCELLATION_ITEMS) {
    showToast(`É possível adicionar até ${MAX_CANCELLATION_ITEMS} clientes por solicitação.`, "warning");
    return;
  }

  const draft = getCancellationDraft();
  if (!draft.clientCnpj || !draft.clientName || !draft.reason) {
    showFormError(els.requestError, "Preencha CPF/CNPJ, Razão Social e Motivo antes de adicionar o cliente à lista.");
    if (!draft.clientCnpj) els.cancellationCnpjInput.focus();
    else if (!draft.clientName) els.cancellationClientNameInput.focus();
    else els.cancellationReasonInput.focus();
    return;
  }

  if (!setDocumentValidity(els.cancellationCnpjInput, { required: true, showMessage: true })) {
    showFormError(els.requestError, "Informe um CPF ou CNPJ válido antes de adicionar o cliente à lista.");
    els.cancellationCnpjInput.focus();
    return;
  }

  draft.clientCnpj = formatCpfCnpj(draft.clientCnpj);
  state.modalCancellationItems.push(draft);
  renderCancellationItems(state.modalCancellationItems, true);
  clearCancellationDraft();
  els.cancellationCnpjInput.focus();
  showToast("Cliente adicionado. Os campos foram limpos para o próximo cadastro.");
}

function setSectionInputsEnabled(section, enabled) {
  $$("input, textarea, select, button", section).forEach((control) => {
    if (control.classList.contains("remove-cancellation-item")) return;
    control.disabled = !enabled;
  });
}

function updateRequestTypeFields() {
  const isProgramming = els.requestType.value === "programacao";
  els.programmingFields.hidden = !isProgramming;
  els.cancellationFields.hidden = isProgramming;
  els.priorityField.hidden = !isProgramming;

  setSectionInputsEnabled(els.programmingFields, isProgramming && state.modalEditable);
  els.requestPriority.disabled = !isProgramming || !state.modalEditable;

  if (isProgramming) {
    setSectionInputsEnabled(els.cancellationFields, false);
    renderAttachmentList();
  } else {
    setSectionInputsEnabled(els.cancellationFields, state.modalEditable);
    renderCancellationItems(state.modalCancellationItems, state.modalEditable);
  }

  els.requestType.disabled = !state.modalEditable;
  els.requestStatus.disabled = !isAdmin();
  els.requestAssignee.disabled = !isAdmin();
}

function resetRequestForm() {
  els.requestForm.reset();
  setDocumentValidity(els.requestClientCode, { required: false, showMessage: false });
  els.requestClientCode.classList.remove("input-invalid", "input-valid");
  setPhoneValidity(els.requestContactPhone, { showMessage: false });
  els.requestContactPhone.classList.remove("input-invalid", "input-valid");
  state.modalEditable = true;
  els.requestId.value = "";
  els.requestType.value = "programacao";
  els.requestPriority.value = "normal";
  els.requestStatus.value = "nova";
  els.requestAssignee.value = "";
  els.requestModalTitle.textContent = "Nova solicitação";
  els.saveRequestButton.textContent = "Salvar solicitação";
  els.saveRequestButton.hidden = false;
  els.copyRequestButton.hidden = true;
  els.deleteRequestButton.hidden = true;
  els.requestAudit.hidden = true;
  state.modalCancellationItems = [];
  state.modalExistingAttachments = [];
  state.modalNewAttachments = [];
  state.modalRemovedAttachmentKeys = [];
  els.requestAttachments.value = "";
  clearCancellationDraft();
  renderCancellationItems([], true);
  renderAttachmentList();
  showFormError(els.requestError);
  updateRequestTypeFields();
}

function openNewRequestModal(type = "programacao") {
  resetRequestForm();
  els.requestType.value = VALID_TYPES.includes(type) ? type : "programacao";
  updateRequestTypeFields();
  els.requestDialog.showModal();
  window.setTimeout(() => {
    if (els.requestType.value === "programacao") els.requestClient.focus();
    else els.cancellationCnpjInput.focus();
  }, 50);
}

function canRequesterEdit(item) {
  return !isAdmin()
    && item.requesterUid === state.user.uid
    && item.status === "nova";
}

function openRequestModal(id) {
  const item = state.requests.find((request) => request.id === id);
  if (!item) return;

  resetRequestForm();
  const editable = isAdmin() || canRequesterEdit(item);
  state.modalEditable = editable;

  els.requestId.value = item.id;
  els.requestType.value = item.type || "programacao";
  els.requestPriority.value = item.priority || "normal";
  els.requestClient.value = item.clientName || "";
  els.requestClientCode.value = formatCpfCnpj(item.clientCode || "");
  els.requestContactName.value = item.contactName || "";
  els.requestContactRole.value = item.contactRole || "";
  els.requestContactEmail.value = item.contactEmail || "";
  els.requestContactPhone.value = formatPhone(item.contactPhone || "");
  els.requestTitle.value = item.title || "";
  els.requestDescription.value = item.type === "cancelamento" ? "" : item.description || "";
  els.requestCurrentBehavior.value = item.currentBehavior || "";
  els.requestExpectedBehavior.value = item.expectedBehavior || "";
  els.requestJustification.value = item.justification || "";
  els.requestLink.value = item.videoLink || item.externalLink || "";
  state.modalExistingAttachments = Array.isArray(item.attachments)
    ? item.attachments.map(normalizeAttachment)
    : [];
  state.modalNewAttachments = [];
  state.modalRemovedAttachmentKeys = [];
  renderAttachmentList();
  els.requestStatus.value = item.status || "nova";
  els.requestAssignee.value = item.assigneeUid || "";
  renderCancellationItems(
    item.type === "cancelamento" ? cancellationItemsFromRequest(item) : [],
    editable
  );

  els.requestModalTitle.textContent = "Detalhes da solicitação";
  els.saveRequestButton.textContent = "Salvar alterações";
  els.saveRequestButton.hidden = !editable;
  els.copyRequestButton.hidden = !isAdmin();
  els.deleteRequestButton.hidden = !isAdmin();
  els.requestAudit.hidden = false;
  els.requestAudit.innerHTML = `
    <strong>Solicitado por:</strong> ${escapeHtml(item.requesterName || item.requesterEmail || "—")}<br>
    <strong>Criado em:</strong> ${formatDateTime(item.createdAt)} · <strong>Tempo:</strong> ${formatElapsed(requestAge(item))}<br>
    <strong>Última atualização:</strong> ${formatDateTime(item.updatedAt)}${item.updatedByName ? ` por ${escapeHtml(item.updatedByName)}` : ""}
  `;

  updateRequestTypeFields();
  els.requestDialog.showModal();
}

function buildProgrammingPayload() {
  const externalLinkRaw = els.requestLink.value.trim();
  const videoLink = normalizeUrl(externalLinkRaw);
  if (externalLinkRaw && !videoLink) {
    return { error: "Informe um link de vídeo válido iniciado por http:// ou https://." };
  }

  const data = {
    clientName: sanitizeText(els.requestClient.value),
    clientCode: formatCpfCnpj(els.requestClientCode.value),
    contactName: sanitizeText(els.requestContactName.value),
    contactRole: sanitizeText(els.requestContactRole.value),
    contactEmail: sanitizeText(els.requestContactEmail.value),
    contactPhone: formatPhone(els.requestContactPhone.value),
    title: sanitizeText(els.requestTitle.value),
    description: sanitizeText(els.requestDescription.value),
    currentBehavior: sanitizeText(els.requestCurrentBehavior.value),
    expectedBehavior: sanitizeText(els.requestExpectedBehavior.value),
    justification: sanitizeText(els.requestJustification.value),
    videoLink,
    externalLink: videoLink,
    cancellationItems: []
  };

  if (data.clientCode && !setDocumentValidity(els.requestClientCode, { showMessage: true })) {
    els.requestClientCode.focus();
    return { error: "Informe um CPF ou CNPJ válido para o cliente." };
  }

  if (!setPhoneValidity(els.requestContactPhone, { showMessage: true })) {
    els.requestContactPhone.focus();
    return { error: "Informe um telefone fixo ou celular com DDD válido." };
  }

  if (!data.clientName
    || !data.contactName
    || !data.contactRole
    || !data.contactEmail
    || !data.contactPhone
    || !data.title
    || !data.description
    || !data.currentBehavior
    || !data.expectedBehavior
    || !data.justification) {
    return { error: "Preencha todos os campos obrigatórios da solicitação de programação." };
  }

  return { data };
}

function buildCancellationPayload() {
  const draft = getCancellationDraft();
  const hasDraftContent = draft.clientName || draft.clientCnpj || draft.reason;
  if (hasDraftContent) {
    return { error: "Há dados preenchidos que ainda não foram adicionados. Clique em Adicionar à lista antes de salvar." };
  }

  const cancellationItems = getCancellationItemsFromForm();
  if (!cancellationItems.length) {
    return { error: "Adicione pelo menos um cliente para cancelamento." };
  }

  const incompleteIndex = cancellationItems.findIndex((entry) => !entry.clientName || !entry.clientCnpj || !entry.reason);
  if (incompleteIndex >= 0) {
    return { error: `Preencha CPF/CNPJ, Razão Social e Motivo do cliente ${incompleteIndex + 1}.` };
  }

  const invalidDocumentIndex = cancellationItems.findIndex((entry) => !isValidCpfCnpj(entry.clientCnpj));
  if (invalidDocumentIndex >= 0) {
    return { error: `O CPF/CNPJ do cliente ${invalidDocumentIndex + 1} é inválido.` };
  }

  cancellationItems.forEach((entry) => {
    entry.clientCnpj = formatCpfCnpj(entry.clientCnpj);
  });

  const first = cancellationItems[0];
  const title = cancellationItems.length === 1
    ? `Cancelamento — ${first.clientName}`
    : `Cancelamentos — ${cancellationItems.length} clientes`;
  const description = cancellationItems
    .map((entry, index) => `${index + 1}. ${entry.clientName}: ${entry.reason}`)
    .join("\n")
    .slice(0, 3000);

  return {
    data: {
      priority: "normal",
      clientName: first.clientName,
      clientCode: first.clientCnpj,
      title: title.slice(0, 140),
      description: description || "Solicitação de cancelamento.",
      contactName: "",
      contactRole: "",
      contactEmail: "",
      contactPhone: "",
      currentBehavior: "",
      expectedBehavior: "",
      justification: "",
      videoLink: "",
      externalLink: "",
      cancellationItems
    }
  };
}

async function saveRequest(event) {
  event.preventDefault();
  showFormError(els.requestError);

  const id = els.requestId.value;
  const existing = state.requests.find((request) => request.id === id);
  const type = VALID_TYPES.includes(els.requestType.value)
    ? els.requestType.value
    : "programacao";
  const typeResult = type === "programacao"
    ? buildProgrammingPayload()
    : buildCancellationPayload();

  if (typeResult.error) {
    showFormError(els.requestError, typeResult.error);
    return;
  }

  if (type === "programacao" && totalModalAttachments() > MAX_ATTACHMENTS) {
    showFormError(els.requestError, `É possível anexar no máximo ${MAX_ATTACHMENTS} arquivos.`);
    return;
  }

  const requestDocument = id && existing
    ? doc(db, "requests", id)
    : doc(collection(db, "requests"));
  const requestId = requestDocument.id;
  const ownerUid = existing?.requesterUid || state.user.uid;
  const retainedAttachments = type === "programacao" ? retainedModalAttachments() : [];
  const attachmentsToRemove = type === "programacao"
    ? state.modalExistingAttachments.filter(
      (attachment) => state.modalRemovedAttachmentKeys.includes(attachmentKey(attachment))
    )
    : state.modalExistingAttachments;

  const payload = {
    type,
    priority: type === "programacao" && VALID_PRIORITIES.includes(els.requestPriority.value)
      ? els.requestPriority.value
      : "normal",
    ...typeResult.data,
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: state.profile.name || state.user.email
  };

  setButtonLoading(els.saveRequestButton, true, "Salvando...");

  try {
    if (id && existing && !isAdmin() && !canRequesterEdit(existing)) {
      throw { code: "permission-denied" };
    }

    const pendingAttachmentWrites = type === "programacao"
      ? await buildPendingAttachmentWrites(ownerUid, requestId)
      : [];
    payload.attachments = [
      ...retainedAttachments,
      ...pendingAttachmentWrites.map((write) => write.metadata)
    ];

    const batch = writeBatch(db);
    pendingAttachmentWrites.forEach((write) => batch.set(write.reference, write.data));
    attachmentsToRemove.forEach((attachment) => {
      const reference = firestoreAttachmentReference(attachment);
      if (reference) batch.delete(reference);
    });

    if (id && existing) {
      if (isAdmin()) {
        payload.status = VALID_STATUSES.includes(els.requestStatus.value)
          ? els.requestStatus.value
          : existing.status;
        const assignee = state.users.find((user) => user.uid === els.requestAssignee.value);
        payload.assigneeUid = assignee?.uid || "";
        payload.assigneeName = assignee?.name || assignee?.email || "";

        if (payload.status === "concluida" && existing.status !== "concluida") {
          payload.completedAt = serverTimestamp();
        }
        if (payload.status !== "concluida" && existing.status === "concluida") {
          payload.completedAt = null;
        }
      }

      batch.update(requestDocument, payload);
    } else {
      batch.set(requestDocument, {
        ...payload,
        status: "nova",
        requesterUid: state.user.uid,
        requesterName: state.profile.name || state.user.email,
        requesterEmail: state.user.email,
        assigneeUid: "",
        assigneeName: "",
        createdAt: serverTimestamp(),
        completedAt: null
      });
    }

    await batch.commit();
    showToast(id && existing
      ? "Solicitação atualizada com sucesso."
      : type === "cancelamento"
        ? "Lista de cancelamentos criada com sucesso."
        : "Solicitação criada com sucesso.");
    els.requestDialog.close();
  } catch (error) {
    console.error(error);
    showFormError(els.requestError, firebaseErrorMessage(error));
  } finally {
    setButtonLoading(els.saveRequestButton, false);
  }
}

function deleteRequest() {
  const id = els.requestId.value;
  const item = state.requests.find((request) => request.id === id);

  if (!isAdmin()) {
    showToast("Somente administradores podem excluir solicitações.", "error");
    return;
  }
  if (!item) return;

  els.deleteConfirmMessage.textContent = `A solicitação “${requestCardTitle(item)}” será removida permanentemente${item.attachments?.length ? ", incluindo seus anexos" : ""}.`;
  if (!els.deleteConfirmDialog.open) els.deleteConfirmDialog.showModal();
}

async function confirmDeleteRequest() {
  const id = els.requestId.value;
  const item = state.requests.find((request) => request.id === id);

  if (!isAdmin()) {
    closeModal(els.deleteConfirmDialog);
    showToast("Somente administradores podem excluir solicitações.", "error");
    return;
  }
  if (!item) return;

  setButtonLoading(els.confirmDeleteButton, true, "Excluindo...");
  try {
    const batch = writeBatch(db);
    (Array.isArray(item.attachments) ? item.attachments : []).forEach((attachment) => {
      const reference = firestoreAttachmentReference(normalizeAttachment(attachment));
      if (reference) batch.delete(reference);
    });
    batch.delete(doc(db, "requests", id));
    await batch.commit();
    closeModal(els.deleteConfirmDialog);
    closeModal(els.requestDialog);
    showToast("Solicitação excluída com sucesso.");
  } catch (error) {
    console.error(error);
    closeModal(els.deleteConfirmDialog);
    showFormError(els.requestError, firebaseErrorMessage(error));
  } finally {
    setButtonLoading(els.confirmDeleteButton, false);
  }
}

function programmingCopyText(item) {
  return `Título: ${item.title || ""}

=== Informações do Cliente ===
Razão Social: ${item.clientName || ""}
CPF/CNPJ: ${item.clientCode || ""}

=== Dados do Solicitante ===
Solicitante: ${item.contactName || ""}
Cargo: ${item.contactRole || ""}
Telefone: ${item.contactPhone || ""}
E-mail: ${item.contactEmail || ""}

=== Descrição da Demanda ===
${item.description || ""}

Comportamento atual (O que acontece hoje?):
${item.currentBehavior || ""}

Comportamento esperado (O que deveria acontecer?):
${item.expectedBehavior || ""}

Justificativa (Por que isso é importante? Qual o impacto/incômodo?):
${item.justification || ""}

Link Video: ${item.videoLink || item.externalLink || ""}`;
}

function cancellationCopyText(item) {
  const entries = cancellationItemsFromRequest(item);
  const blocks = entries.map((entry, index) => `Cliente ${index + 1}
Razão Social: ${entry.clientName || ""}
CPF/CNPJ: ${entry.clientCnpj || ""}
Motivo: ${entry.reason || ""}`);
  return `=== CHAMADOS PARA CANCELAMENTO ===\n\n${blocks.join("\n\n------------------------------\n\n")}`;
}

function requestCopyText(item) {
  return item.type === "cancelamento"
    ? cancellationCopyText(item)
    : programmingCopyText(item);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("copy-failed");
    }
    showToast("Dados copiados para a área de transferência.");
  } catch (error) {
    console.error(error);
    showToast("Não foi possível copiar automaticamente. Tente novamente.", "error");
  }
}

function copyRequestById(id) {
  if (!isAdmin()) return;
  const item = state.requests.find((request) => request.id === id);
  if (!item) return;
  copyText(requestCopyText(item));
}

function applyFilters() {
  state.filters.search = els.searchInput.value.trim();
  state.filters.type = els.typeFilter.value;
  state.filters.priority = els.priorityFilter.value;
  state.filters.requester = els.requesterFilter.value;
  renderBoard();
}

function clearFilters() {
  els.searchInput.value = "";
  els.typeFilter.value = "all";
  els.priorityFilter.value = "all";
  els.requesterFilter.value = "all";
  state.filters = { search: "", type: "all", priority: "all", requester: "all" };
  $$(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === "kanban");
  });
  renderBoard();
}

function closeModal(dialog) {
  if (dialog.open) dialog.close();
}

function showHelpSection(targetId = "help-overview") {
  $$(".help-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.helpTarget === targetId);
  });
  $$(".help-section").forEach((section) => {
    section.classList.toggle("active", section.id === targetId);
  });
  const content = $(".help-content", els.helpDialog);
  if (content) content.scrollTop = 0;
}

function openHelpDialog(targetId = "help-overview") {
  showHelpSection(targetId);
  if (!els.helpDialog.open) els.helpDialog.showModal();
  requestAnimationFrame(() => {
    const content = $(".help-content", els.helpDialog);
    if (content) content.scrollTop = 0;
  });
}

function setupEvents() {
  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(els.loginError);

    if (!isConfigReady()) {
      showFormError(els.loginError, "Configure o arquivo firebase-config.js antes de usar o painel.");
      return;
    }

    setButtonLoading(els.loginButton, true, "Entrando...");
    try {
      await setPersistence(
        auth,
        els.rememberEmail.checked ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(
        auth,
        els.loginEmail.value.trim(),
        els.loginPassword.value
      );
      if (els.rememberEmail.checked) {
        localStorage.setItem("painel-email", els.loginEmail.value.trim());
      } else {
        localStorage.removeItem("painel-email");
      }
    } catch (error) {
      console.error(error);
      showFormError(els.loginError, firebaseErrorMessage(error));
    } finally {
      setButtonLoading(els.loginButton, false);
    }
  });

  els.togglePassword.addEventListener("click", () => {
    const hidden = els.loginPassword.type === "password";
    els.loginPassword.type = hidden ? "text" : "password";
    els.togglePassword.textContent = hidden ? "🙈" : "👁";
    els.togglePassword.setAttribute("aria-label", hidden ? "Ocultar senha" : "Mostrar senha");
  });

  els.logoutButton.addEventListener("click", () => signOut(auth));
  els.newRequestButton.addEventListener("click", () => openNewRequestModal());
  els.helpButton.addEventListener("click", () => openHelpDialog());
  els.topHelpButton.addEventListener("click", () => openHelpDialog());
  $$(".help-tab").forEach((tab) => {
    tab.addEventListener("click", () => showHelpSection(tab.dataset.helpTarget));
  });
  $$(".close-help-modal").forEach((button) => {
    button.addEventListener("click", () => closeModal(els.helpDialog));
  });
  els.refreshButton.addEventListener("click", () => {
    renderAll();
    showToast("Painel atualizado.");
  });

  setupDocumentInput(els.requestClientCode, { required: false });
  setupDocumentInput(els.cancellationCnpjInput, { required: false });
  setupPhoneInput(els.requestContactPhone);

  els.requestForm.addEventListener("submit", saveRequest);
  els.requestType.addEventListener("change", updateRequestTypeFields);
  els.requestAttachments.addEventListener("change", handleAttachmentSelection);
  els.addCancellationItem.addEventListener("click", addCancellationItem);
  els.copyRequestButton.addEventListener("click", () => copyRequestById(els.requestId.value));
  els.deleteRequestButton.addEventListener("click", deleteRequest);
  els.confirmDeleteButton.addEventListener("click", confirmDeleteRequest);
  $$(".close-delete-confirm").forEach((button) => {
    button.addEventListener("click", () => closeModal(els.deleteConfirmDialog));
  });
  $$(".close-modal").forEach((button) => {
    button.addEventListener("click", () => closeModal(els.requestDialog));
  });

  [els.searchInput, els.typeFilter, els.priorityFilter, els.requesterFilter].forEach((control) => {
    control.addEventListener(control === els.searchInput ? "input" : "change", applyFilters);
  });
  els.clearFilters.addEventListener("click", clearFilters);

  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.view === "help") {
        openHelpDialog();
        els.sidebar.classList.remove("open");
        return;
      }
      $$(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (button.dataset.filterType) {
        els.typeFilter.value = button.dataset.filterType;
        state.filters.type = button.dataset.filterType;
      } else {
        els.typeFilter.value = "all";
        state.filters.type = "all";
      }
      renderBoard();
      els.sidebar.classList.remove("open");
    });
  });

  els.mobileMenuButton.addEventListener("click", () => els.sidebar.classList.toggle("open"));
  document.addEventListener("click", (event) => {
    if (window.innerWidth <= 900
      && els.sidebar.classList.contains("open")
      && !els.sidebar.contains(event.target)
      && event.target !== els.mobileMenuButton) {
      els.sidebar.classList.remove("open");
    }
  });

  els.forgotPassword.addEventListener("click", () => {
    els.resetEmail.value = els.loginEmail.value.trim();
    showFormError(els.resetError);
    els.resetDialog.showModal();
  });

  $$(".close-reset-modal").forEach((button) => {
    button.addEventListener("click", () => closeModal(els.resetDialog));
  });

  els.resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(els.resetError);
    try {
      await sendPasswordResetEmail(auth, els.resetEmail.value.trim());
      els.resetDialog.close();
      showToast("Link de redefinição enviado para o e-mail informado.");
    } catch (error) {
      console.error(error);
      showFormError(els.resetError, firebaseErrorMessage(error));
    }
  });

  els.requestDialog.addEventListener("click", (event) => {
    if (event.target === els.requestDialog) els.requestDialog.close();
  });
  els.resetDialog.addEventListener("click", (event) => {
    if (event.target === els.resetDialog) els.resetDialog.close();
  });
  els.helpDialog.addEventListener("click", (event) => {
    if (event.target === els.helpDialog) els.helpDialog.close();
  });

  setupDropzones();
}

async function handleAuthenticated(user) {
  try {
    const profile = await loadProfile(user);
    if (profile.active !== true) {
      await signOut(auth);
      showFormError(els.loginError, "Seu acesso está desativado. Procure o administrador.");
      return;
    }

    state.user = user;
    state.profile = profile;
    els.loginView.hidden = true;
    els.appView.hidden = false;
    renderUser();
    await loadUsers();
    subscribeRequests();

    if (state.elapsedTimer) clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(updateElapsedLabels, 60000);
  } catch (error) {
    console.error(error);
    await signOut(auth);
    const message = error.message === "profile-not-found"
      ? "Seu login existe, mas o perfil de acesso ainda não foi cadastrado no Firestore. Procure o administrador."
      : firebaseErrorMessage(error);
    showFormError(els.loginError, message);
  }
}

function handleSignedOut() {
  if (state.unsubscribeRequests) state.unsubscribeRequests();
  if (state.elapsedTimer) clearInterval(state.elapsedTimer);
  state.user = null;
  state.profile = null;
  state.requests = [];
  els.appView.hidden = true;
  els.loginView.hidden = false;
  els.loginPassword.value = "";
}

setupEvents();
const rememberedEmail = localStorage.getItem("painel-email");
if (rememberedEmail) {
  els.loginEmail.value = rememberedEmail;
  els.rememberEmail.checked = true;
}
if (!isConfigReady()) {
  showFormError(els.loginError, "Configure o arquivo firebase-config.js para conectar o painel ao Firebase.");
}
onAuthStateChanged(auth, (user) => user ? handleAuthenticated(user) : handleSignedOut());

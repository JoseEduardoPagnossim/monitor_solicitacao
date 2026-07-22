import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
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
  increment,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const STATUS_LABELS = {
  nova: "Nova",
  analise: "Em análise",
  aguardando: "Aguardando",
  bloqueio: "Bloqueio",
  concluida: "Concluída"
};

const TYPE_LABELS = {
  programacao: "Programação",
  cancelamento: "Cancelamento",
  tef_elgin: "TEF Elgin"
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
const INVITE_VALID_DAYS = 7;
const VALID_USER_ROLES = ["admin", "solicitante"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const state = {
  user: null,
  profile: null,
  requests: [],
  archivedRequests: [],
  users: [],
  invites: [],
  notifications: [],
  currentComments: [],
  unsubscribeRequests: null,
  unsubscribeProfile: null,
  unsubscribeNotifications: null,
  unsubscribeComments: null,
  elapsedTimer: null,
  currentView: "kanban",
  userFilters: { search: "", status: "all", role: "all" },
  inviteToken: new URLSearchParams(window.location.search).get("invite") || "",
  inviteData: null,
  inviteRegistrationInProgress: false,
  forcedLogoutMessage: "",
  filters: { search: "", type: "all", priority: "all", requester: "all" },
  draggedId: null,
  modalEditable: true,
  modalCancellationItems: [],
  modalExistingAttachments: [],
  modalNewAttachments: [],
  modalRemovedAttachmentKeys: [],
  modalArchived: false,
  archiveAction: null,
  archivedLoaded: false,
  archivedFilters: { search: "", type: "all" },
  indicatorFilters: { start: "", end: "", type: "all" }
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
  inviteRegistrationForm: $("#invite-registration-form"),
  inviteLoading: $("#invite-loading"),
  inviteRegistrationFields: $("#invite-registration-fields"),
  inviteRegistrationName: $("#invite-registration-name"),
  inviteRegistrationEmail: $("#invite-registration-email"),
  inviteRegistrationRole: $("#invite-registration-role"),
  inviteRegistrationPassword: $("#invite-registration-password"),
  inviteRegistrationConfirmPassword: $("#invite-registration-confirm-password"),
  inviteRegistrationButton: $("#invite-registration-button"),
  inviteRegistrationError: $("#invite-registration-error"),
  backToLoginButton: $("#back-to-login-button"),
  logoutButton: $("#logout-button"),
  changePasswordButton: $("#change-password-button"),
  changePasswordDialog: $("#change-password-dialog"),
  changePasswordForm: $("#change-password-form"),
  currentPassword: $("#current-password"),
  newPassword: $("#new-password"),
  confirmNewPassword: $("#confirm-new-password"),
  showChangePasswords: $("#show-change-passwords"),
  changePasswordError: $("#change-password-error"),
  saveNewPasswordButton: $("#save-new-password-button"),
  userName: $("#user-name"),
  userRole: $("#user-role"),
  userAvatar: $("#user-avatar"),
  welcomeMessage: $("#welcome-message"),
  newRequestButton: $("#new-request-button"),
  helpButton: $("#help-button"),
  topHelpButton: $("#top-help-button"),
  notificationButton: $("#notification-button"),
  notificationBadge: $("#notification-badge"),
  notificationPopover: $("#notification-popover"),
  notificationList: $("#notification-list"),
  closeNotificationsButton: $("#close-notifications-button"),
  markAllNotificationsRead: $("#mark-all-notifications-read"),
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
  kanbanView: $("#kanban-view"),
  usersView: $("#users-view"),
  indicatorsView: $("#indicators-view"),
  archivedView: $("#archived-view"),
  usersNavButton: $("#users-nav-button"),
  indicatorsNavButton: $("#indicators-nav-button"),
  archivedNavButton: $("#archived-nav-button"),
  refreshUsersButton: $("#refresh-users-button"),
  newUserInviteButton: $("#new-user-invite-button"),
  metricActiveUsers: $("#metric-active-users"),
  metricAdminUsers: $("#metric-admin-users"),
  metricPendingInvites: $("#metric-pending-invites"),
  metricInactiveUsers: $("#metric-inactive-users"),
  userSearchInput: $("#user-search-input"),
  userStatusFilter: $("#user-status-filter"),
  userRoleFilter: $("#user-role-filter"),
  usersTableBody: $("#users-table-body"),
  usersEmptyState: $("#users-empty-state"),
  userInviteDialog: $("#user-invite-dialog"),
  userInviteForm: $("#user-invite-form"),
  userInviteFormFields: $("#user-invite-form-fields"),
  userInviteResult: $("#user-invite-result"),
  userInviteName: $("#user-invite-name"),
  userInviteEmail: $("#user-invite-email"),
  userInviteRole: $("#user-invite-role"),
  userInviteError: $("#user-invite-error"),
  createUserInviteButton: $("#create-user-invite-button"),
  userInviteLink: $("#user-invite-link"),
  userInviteExpiration: $("#user-invite-expiration"),
  copyUserInviteLink: $("#copy-user-invite-link"),
  editUserDialog: $("#edit-user-dialog"),
  editUserForm: $("#edit-user-form"),
  editUserId: $("#edit-user-id"),
  editUserName: $("#edit-user-name"),
  editUserEmail: $("#edit-user-email"),
  editUserRole: $("#edit-user-role"),
  editUserSelfNote: $("#edit-user-self-note"),
  editUserError: $("#edit-user-error"),
  saveUserButton: $("#save-user-button"),
  userStatusDialog: $("#user-status-dialog"),
  userStatusDialogIcon: $("#user-status-dialog-icon"),
  userStatusDialogTitle: $("#user-status-dialog-title"),
  userStatusDialogMessage: $("#user-status-dialog-message"),
  userStatusDialogWarningTitle: $("#user-status-dialog-warning-title"),
  userStatusDialogWarningText: $("#user-status-dialog-warning-text"),
  userStatusTargetId: $("#user-status-target-id"),
  confirmUserStatusButton: $("#confirm-user-status-button"),
  refreshIndicatorsButton: $("#refresh-indicators-button"),
  indicatorStartDate: $("#indicator-start-date"),
  indicatorEndDate: $("#indicator-end-date"),
  indicatorTypeFilter: $("#indicator-type-filter"),
  indicatorClearFilter: $("#indicator-clear-filter"),
  indicatorCreated: $("#indicator-created"),
  indicatorCompleted: $("#indicator-completed"),
  indicatorAverageTime: $("#indicator-average-time"),
  indicatorBlocked: $("#indicator-blocked"),
  indicatorCompletionRate: $("#indicator-completion-rate"),
  indicatorArchived: $("#indicator-archived"),
  indicatorStatusBars: $("#indicator-status-bars"),
  indicatorTypeBars: $("#indicator-type-bars"),
  indicatorRequesterTable: $("#indicator-requester-table"),
  refreshArchivedButton: $("#refresh-archived-button"),
  archiveOldRequestsButton: $("#archive-old-requests-button"),
  archivedSearchInput: $("#archived-search-input"),
  archivedTypeFilter: $("#archived-type-filter"),
  archivedTableBody: $("#archived-table-body"),
  archivedEmptyState: $("#archived-empty-state"),
  requestDialog: $("#request-dialog"),
  requestForm: $("#request-form"),
  requestModalTitle: $("#request-modal-title"),
  requestDetailsTab: $("#request-details-tab"),
  requestCommentsTab: $("#request-comments-tab"),
  requestDetailsPanel: $("#request-details-panel"),
  requestCommentsPanel: $("#request-comments-panel"),
  requestCommentCount: $("#request-comment-count"),
  requestCommentsList: $("#request-comments-list"),
  commentComposer: $("#comment-composer"),
  requestCommentText: $("#request-comment-text"),
  requestCommentMention: $("#request-comment-mention"),
  commentMentionField: $("#comment-mention-field"),
  requestCommentError: $("#request-comment-error"),
  addRequestCommentButton: $("#add-request-comment-button"),
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
  tefFields: $("#tef-fields"),
  tefCnpj: $("#tef-cnpj"),
  tefOperatingSystem: $("#tef-operating-system"),
  tefRam: $("#tef-ram"),
  tefSystemUsed: $("#tef-system-used"),
  tefEstablishmentNumber: $("#tef-establishment-number"),
  tefPinpadLogicalNumber: $("#tef-pinpad-logical-number"),
  tefPinpadModel: $("#tef-pinpad-model"),
  tefAcquirer: $("#tef-acquirer"),
  tefOwnerName: $("#tef-owner-name"),
  tefOwnerCpf: $("#tef-owner-cpf"),
  tefContactPhone: $("#tef-contact-phone"),
  tefContactEmail: $("#tef-contact-email"),
  tefAgreedValue: $("#tef-agreed-value"),
  requestStatus: $("#request-status"),
  requestAssignee: $("#request-assignee"),
  requestAudit: $("#request-audit"),
  requestError: $("#request-error"),
  saveRequestButton: $("#save-request-button"),
  copyRequestButton: $("#copy-request-button"),
  archiveRequestButton: $("#archive-request-button"),
  deleteRequestButton: $("#delete-request-button"),
  archiveConfirmDialog: $("#archive-confirm-dialog"),
  archiveConfirmTitle: $("#archive-confirm-title"),
  archiveConfirmMessage: $("#archive-confirm-message"),
  confirmArchiveButton: $("#confirm-archive-button"),
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

function formatCpf(value = "") {
  const digits = documentDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCnpj(value = "") {
  const digits = documentDigits(value).slice(0, 14);
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

function setSpecificDocumentValidity(input, kind, { required = true, showMessage = false } = {}) {
  const value = input.value.trim();
  const valid = kind === "cpf" ? isValidCpf(value) : isValidCnpj(value);
  const label = kind === "cpf" ? "CPF" : "CNPJ";
  let message = "";

  if (!value && required) message = `Informe o ${label}.`;
  else if (value && !valid) message = `O ${label} não é válido.`;

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

function setupSpecificDocumentInput(input, kind, options = {}) {
  const formatter = kind === "cpf" ? formatCpf : formatCnpj;
  input.addEventListener("input", () => {
    input.value = formatter(input.value);
    setSpecificDocumentValidity(input, kind, { ...options, showMessage: false });
  });
  input.addEventListener("blur", () => {
    input.value = formatter(input.value);
    setSpecificDocumentValidity(input, kind, { ...options, showMessage: true });
  });
}

function clearFieldValidation(input) {
  input.setCustomValidity("");
  input.classList.remove("input-invalid", "input-valid");
  input.setAttribute("aria-invalid", "false");
  const messageElement = input.dataset.validationMessage
    ? document.getElementById(input.dataset.validationMessage)
    : null;
  if (messageElement) {
    messageElement.textContent = "";
    messageElement.hidden = true;
  }
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
    "auth/email-already-in-use": "Este e-mail já possui uma conta no Firebase.",
    "auth/weak-password": "A senha deve possuir pelo menos 6 caracteres.",
    "auth/wrong-password": "A senha atual está incorreta.",
    "auth/requires-recent-login": "Confirme novamente sua senha atual para continuar.",
    "invite-invalid": "Este convite não existe ou não está mais disponível.",
    "invite-expired": "Este convite expirou. Solicite um novo link ao administrador.",
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
    .map((documentSnapshot) => ({ uid: documentSnapshot.id, ...documentSnapshot.data() }));

  state.users.sort((a, b) => (a.name || a.email || "").localeCompare(
    b.name || b.email || "",
    "pt-BR"
  ));
  populateUserOptions();
  if (state.currentView === "users") renderUserManagement();
}

function populateUserOptions() {
  const allUsers = state.users
    .map((user) => `<option value="${escapeHtml(user.uid)}">${escapeHtml(user.name || user.email || "Usuário")}</option>`)
    .join("");
  const activeUsers = state.users
    .filter((user) => user.active !== false)
    .map((user) => `<option value="${escapeHtml(user.uid)}">${escapeHtml(user.name || user.email || "Usuário")}</option>`)
    .join("");

  els.requesterFilter.innerHTML = `<option value="all">Todos os solicitantes</option>${allUsers}`;
  els.requestAssignee.innerHTML = `<option value="">Não atribuído</option>${activeUsers}`;
}

function subscribeRequests() {
  if (state.unsubscribeRequests) state.unsubscribeRequests();
  renderLoadingCards();

  const base = collection(db, "requests");
  if (isAdmin()) {
    state.unsubscribeRequests = onSnapshot(base, (snapshot) => {
      state.requests = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      renderAll();
      if (state.currentView === "indicators") renderIndicators();
    }, (error) => {
      console.error(error);
      showToast(firebaseErrorMessage(error), "error");
    });
    return;
  }

  const sourceMaps = { requester: new Map(), assignee: new Map() };
  const sync = () => {
    const merged = new Map([...sourceMaps.requester, ...sourceMaps.assignee]);
    state.requests = [...merged.values()];
    renderAll();
  };
  const handleSnapshot = (source) => (snapshot) => {
    sourceMaps[source] = new Map(snapshot.docs.map((documentSnapshot) => [
      documentSnapshot.id,
      { id: documentSnapshot.id, ...documentSnapshot.data() }
    ]));
    sync();
  };
  const handleError = (error) => {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  };
  const unsubscribeRequester = onSnapshot(
    query(base, where("requesterUid", "==", state.user.uid)),
    handleSnapshot("requester"),
    handleError
  );
  const unsubscribeAssignee = onSnapshot(
    query(base, where("assigneeUid", "==", state.user.uid)),
    handleSnapshot("assignee"),
    handleError
  );
  state.unsubscribeRequests = () => {
    unsubscribeRequester();
    unsubscribeAssignee();
  };
}

function requestIsAccessible(item) {
  return Boolean(item) && (isAdmin()
    || item.requesterUid === state.user?.uid
    || item.assigneeUid === state.user?.uid);
}

function createCancellationItemId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `cancel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cancellationCrmTracking(item) {
  return item?.cancellationCrmStatus && typeof item.cancellationCrmStatus === "object"
    ? item.cancellationCrmStatus
    : {};
}

function cancellationItemsFromRequest(item) {
  const tracking = cancellationCrmTracking(item);

  if (Array.isArray(item.cancellationItems) && item.cancellationItems.length) {
    return item.cancellationItems.map((entry, index) => {
      const itemId = entry?.itemId || `legacy-${index}`;
      const crmEntry = tracking[itemId] || {};
      return {
        itemId,
        clientName: entry?.clientName || entry?.companyName || "",
        clientCnpj: entry?.clientCnpj || entry?.cnpj || "",
        reason: entry?.reason || entry?.motivo || "",
        crmCancelled: crmEntry.cancelled === true,
        crmCancelledAt: crmEntry.cancelledAt || null,
        crmCancelledByUid: crmEntry.cancelledByUid || "",
        crmCancelledByName: crmEntry.cancelledByName || ""
      };
    });
  }

  if (item.type === "cancelamento") {
    const itemId = "legacy-0";
    const crmEntry = tracking[itemId] || {};
    return [{
      itemId,
      clientName: item.clientName || "",
      clientCnpj: item.clientCode || "",
      reason: item.description || "",
      crmCancelled: crmEntry.cancelled === true,
      crmCancelledAt: crmEntry.cancelledAt || null,
      crmCancelledByUid: crmEntry.cancelledByUid || "",
      crmCancelledByName: crmEntry.cancelledByName || ""
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
      item.tefCnpj,
      item.tefOperatingSystem,
      item.tefRam,
      item.tefSystemUsed,
      item.tefEstablishmentNumber,
      item.tefPinpadLogicalNumber,
      item.tefPinpadModel,
      item.tefAcquirer,
      item.tefOwnerName,
      item.tefOwnerCpf,
      item.tefContactPhone,
      item.tefContactEmail,
      item.tefAgreedValue,
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
  if (item.type === "tef_elgin") return item.title || `TEF Elgin — ${item.tefCnpj || item.clientCode || "cliente"}`;
  if (item.type !== "cancelamento") return item.title || "Sem título";
  const entries = cancellationItemsFromRequest(item);
  if (entries.length > 1) return `Cancelamentos — ${entries.length} clientes`;
  const first = entries[0] || {};
  return item.title || `Cancelamento — ${first.clientName || first.clientCnpj || "cliente"}`;
}

function requestCardClient(item) {
  if (item.type === "tef_elgin") {
    return {
      name: item.tefCnpj || item.clientCode || "CNPJ não informado",
      code: item.tefSystemUsed || "TEF Elgin"
    };
  }
  if (item.type !== "cancelamento") {
    return {
      name: item.clientName || "Cliente não informado",
      code: item.clientCode || ""
    };
  }

  const entries = cancellationItemsFromRequest(item);
  const first = entries[0] || {};
  return {
    name: first.clientName || first.clientCnpj || "Cliente não informado",
    code: entries.length > 1 ? `+${entries.length - 1} cliente${entries.length - 1 === 1 ? "" : "s"}` : first.clientName ? first.clientCnpj || "" : ""
  };
}

function requestCardDescription(item) {
  if (item.type === "tef_elgin") {
    return [item.tefOperatingSystem, item.tefRam, item.tefAcquirer].filter(Boolean).join(" · ");
  }
  if (item.type !== "cancelamento") return item.description || "";
  const entries = cancellationItemsFromRequest(item);
  if (entries.length === 1) return entries[0]?.reason || "";
  return entries.map((entry) => entry.clientName || entry.clientCnpj).filter(Boolean).join(" · ");
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
  const commentCount = Number(item.commentCount || 0);
  const cancellationEntries = item.type === "cancelamento" ? cancellationItemsFromRequest(item) : [];
  const cancellationDone = cancellationEntries.filter((entry) => entry.crmCancelled === true).length;
  const crmProgressTag = cancellationEntries.length
    ? `<span class="tag crm-progress ${cancellationDone === cancellationEntries.length ? "complete" : ""}">CRM ${cancellationDone}/${cancellationEntries.length}</span>`
    : "";
  const cardDescription = requestCardDescription(item);
  const cardDescriptionHtml = item.type !== "programacao" && cardDescription
    ? `<p class="card-description">${escapeHtml(cardDescription)}</p>`
    : "";

  return `
    <article class="request-card ${ageClass} ${isOldest ? "oldest" : ""}" data-id="${escapeHtml(item.id)}" draggable="${draggable}" tabindex="0" role="button" aria-label="Abrir solicitação ${escapeHtml(title)}">
      <div class="card-top">
        <div class="card-tags">
          <span class="tag ${item.type}">${TYPE_LABELS[item.type] || "Solicitação"}</span>
          ${item.type === "programacao" ? `<span class="tag ${item.priority}">${PRIORITY_LABELS[item.priority] || "Normal"}</span>` : ""}
          ${attachmentCount ? `<span class="tag attachment">📎 ${attachmentCount}</span>` : ""}
          ${commentCount ? `<span class="tag comments">💬 ${commentCount}</span>` : ""}
          ${item.status === "bloqueio" ? `<span class="tag blocked">BLOQUEIO</span>` : ""}
          ${crmProgressTag}
        </div>
        <span class="card-time ${ageHours >= 48 && item.status !== "concluida" ? "critical" : ""}" data-created-at="${timestampToDate(item.createdAt)?.toISOString() || ""}" data-completed-at="${timestampToDate(item.completedAt)?.toISOString() || ""}" data-status="${item.status}">◷ ${formatElapsed(age, true)}</span>
      </div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
      <p class="card-client"><strong>${escapeHtml(cardClient.name)}</strong>${cardClient.code ? ` · ${escapeHtml(cardClient.code)}` : ""}</p>
      ${cardDescriptionHtml}
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
  return {
    itemId: createCancellationItemId(),
    clientName: "",
    clientCnpj: "",
    reason: "",
    crmCancelled: false,
    crmCancelledAt: null,
    crmCancelledByUid: "",
    crmCancelledByName: ""
  };
}

function cancellationCrmStatusHtml(item, index) {
  const checked = item.crmCancelled === true;
  const canToggle = isAdmin() && Boolean(els.requestId.value) && !state.modalArchived;
  const statusLabel = checked ? "Cancelado" : "Pendente";
  const metadata = checked && item.crmCancelledAt
    ? `<small class="crm-status-meta">${escapeHtml(item.crmCancelledByName || "Administrador")} · ${escapeHtml(formatDateTime(item.crmCancelledAt))}</small>`
    : "";

  if (!canToggle) {
    return `<span class="crm-status-badge ${checked ? "complete" : "pending"}">${checked ? "✓" : "○"} ${statusLabel}</span>${metadata}`;
  }

  return `
    <label class="crm-status-control ${checked ? "checked" : ""}">
      <input class="crm-cancellation-checkbox" type="checkbox" data-index="${index}" ${checked ? "checked" : ""}>
      <span>${checked ? "✓ Cancelado" : "Marcar como cancelado"}</span>
    </label>
    ${metadata}`;
}

function cancellationItemHtml(item, index, editable) {
  return `
    <tr class="cancellation-list-row ${item.crmCancelled === true ? "crm-cancelled" : ""}" data-cancellation-index="${index}">
      <td class="cancellation-row-number" data-label="#">${index + 1}</td>
      <td data-label="CPF/CNPJ"><strong>${escapeHtml(item.clientCnpj || "—")}</strong></td>
      <td data-label="Razão Social"><strong>${escapeHtml(item.clientName || "—")}</strong></td>
      <td class="cancellation-row-reason" data-label="Motivo">${escapeHtml(item.reason || "—")}</td>
      <td class="cancellation-row-crm" data-label="Cancelado no CRM">${cancellationCrmStatusHtml(item, index)}</td>
      ${editable ? `<td class="cancellation-row-action" data-label="Ação"><button class="remove-cancellation-item" type="button" data-index="${index}" aria-label="Remover cliente ${index + 1}">✕ Remover</button></td>` : ""}
    </tr>`;
}

function updateCancellationListCount() {
  const total = state.modalCancellationItems.length;
  els.cancellationListCount.textContent = `${total} ${total === 1 ? "cliente" : "clientes"}`;
}

function renderCancellationItems(items = state.modalCancellationItems, editable = state.modalEditable) {
  state.modalCancellationItems = (Array.isArray(items) ? items : [])
    .slice(0, MAX_CANCELLATION_ITEMS)
    .map((item, index) => ({
      itemId: sanitizeText(item.itemId || `legacy-${index}`),
      clientName: sanitizeText(item.clientName || ""),
      clientCnpj: sanitizeText(item.clientCnpj || ""),
      reason: sanitizeText(item.reason || ""),
      crmCancelled: item.crmCancelled === true,
      crmCancelledAt: item.crmCancelledAt || null,
      crmCancelledByUid: sanitizeText(item.crmCancelledByUid || ""),
      crmCancelledByName: sanitizeText(item.crmCancelledByName || "")
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
              <th>Cancelado no CRM</th>
              ${editable ? "<th>Ação</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${state.modalCancellationItems.map((item, index) => cancellationItemHtml(item, index, editable)).join("")}
          </tbody>
        </table>
      </div>`;
  }

  $$(".crm-cancellation-checkbox", els.cancellationList).forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const index = Number(checkbox.dataset.index);
      if (Number.isNaN(index)) return;
      toggleCancellationCrmStatus(index, checkbox.checked, checkbox);
    });
  });

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

async function toggleCancellationCrmStatus(index, checked, checkbox) {
  if (!isAdmin()) {
    checkbox.checked = !checked;
    showToast("Somente administradores podem atualizar o controle do CRM.", "error");
    return;
  }

  const requestId = els.requestId.value;
  const requestItem = state.requests.find((item) => item.id === requestId);
  if (!requestId || !requestItem || requestItem.type !== "cancelamento") {
    checkbox.checked = !checked;
    showToast("Salve a solicitação antes de controlar os cancelamentos no CRM.", "warning");
    return;
  }

  const previousItems = state.modalCancellationItems.map((item) => ({ ...item }));
  const targetItem = previousItems[index];
  if (!targetItem?.itemId) {
    checkbox.checked = !checked;
    showToast("Não foi possível identificar este cliente na lista.", "error");
    return;
  }

  const previousTracking = { ...cancellationCrmTracking(requestItem) };
  const updatedTracking = { ...previousTracking };
  const trackingDate = checked ? Timestamp.now() : null;

  if (checked) {
    updatedTracking[targetItem.itemId] = {
      cancelled: true,
      cancelledAt: trackingDate,
      cancelledByUid: state.user.uid,
      cancelledByName: state.profile.name || state.user.email
    };
  } else {
    delete updatedTracking[targetItem.itemId];
  }

  const updatedItems = previousItems.map((item, itemIndex) => itemIndex === index
    ? {
        ...item,
        crmCancelled: checked,
        crmCancelledAt: trackingDate,
        crmCancelledByUid: checked ? state.user.uid : "",
        crmCancelledByName: checked ? (state.profile.name || state.user.email) : ""
      }
    : item);

  checkbox.disabled = true;

  try {
    await updateDoc(doc(db, "requests", requestId), {
      cancellationCrmStatus: updatedTracking,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: state.profile.name || state.user.email
    });
    state.modalCancellationItems = updatedItems;
    requestItem.cancellationCrmStatus = updatedTracking;
    renderCancellationItems(updatedItems, state.modalEditable);
    renderAll();
    const done = updatedItems.filter((item) => item.crmCancelled === true).length;
    showToast(checked
      ? `Cancelamento marcado no CRM (${done}/${updatedItems.length}).`
      : `Cancelamento reaberto no controle do CRM (${done}/${updatedItems.length}).`);
  } catch (error) {
    console.error(error);
    checkbox.checked = !checked;
    checkbox.disabled = false;
    state.modalCancellationItems = previousItems;
    requestItem.cancellationCrmStatus = previousTracking;
    showToast(firebaseErrorMessage(error), "error");
  }
}

function getCancellationItemsFromForm() {
  return state.modalCancellationItems.map((item) => ({ ...item }));
}

function getCancellationDraft() {
  return {
    itemId: createCancellationItemId(),
    clientCnpj: sanitizeText(els.cancellationCnpjInput.value),
    clientName: sanitizeText(els.cancellationClientNameInput.value),
    reason: sanitizeText(els.cancellationReasonInput.value),
    crmCancelled: false,
    crmCancelledAt: null,
    crmCancelledByUid: "",
    crmCancelledByName: ""
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
  if ((!draft.clientCnpj && !draft.clientName) || !draft.reason) {
    showFormError(els.requestError, "Informe o CPF/CNPJ ou a Razão Social e preencha o Motivo antes de adicionar o cliente à lista.");
    if (!draft.clientCnpj && !draft.clientName) els.cancellationCnpjInput.focus();
    else els.cancellationReasonInput.focus();
    return;
  }

  if (draft.clientCnpj && !setDocumentValidity(els.cancellationCnpjInput, { required: false, showMessage: true })) {
    showFormError(els.requestError, "O CPF/CNPJ informado não é válido.");
    els.cancellationCnpjInput.focus();
    return;
  }

  draft.clientCnpj = draft.clientCnpj ? formatCpfCnpj(draft.clientCnpj) : "";
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
  const type = els.requestType.value;
  const isProgramming = type === "programacao";
  const isCancellation = type === "cancelamento";
  const isTef = type === "tef_elgin";

  els.requestDialog.classList.toggle("request-dialog-cancellation", isCancellation);

  els.programmingFields.hidden = !isProgramming;
  els.cancellationFields.hidden = !isCancellation;
  els.tefFields.hidden = !isTef;
  els.priorityField.hidden = !isProgramming;

  setSectionInputsEnabled(els.programmingFields, isProgramming && state.modalEditable);
  setSectionInputsEnabled(els.cancellationFields, isCancellation && state.modalEditable);
  setSectionInputsEnabled(els.tefFields, isTef && state.modalEditable);
  els.requestPriority.disabled = !isProgramming || !state.modalEditable;

  if (isProgramming) renderAttachmentList();
  if (isCancellation) renderCancellationItems(state.modalCancellationItems, state.modalEditable);

  const isExistingRequest = Boolean(els.requestId.value);
  els.requestType.disabled = !state.modalEditable || isExistingRequest;
  els.requestType.title = isExistingRequest
    ? "O tipo da solicitação não pode ser alterado após o primeiro salvamento."
    : "";
  els.requestStatus.disabled = !isAdmin() || state.modalArchived;
  els.requestAssignee.disabled = !isAdmin() || state.modalArchived;
}

function resetRequestForm() {
  if (state.unsubscribeComments) state.unsubscribeComments();
  state.unsubscribeComments = null;
  state.currentComments = [];
  state.modalArchived = false;
  els.requestForm.reset();
  clearFieldValidation(els.requestClientCode);
  clearFieldValidation(els.requestContactPhone);
  clearFieldValidation(els.tefCnpj);
  clearFieldValidation(els.tefOwnerCpf);
  clearFieldValidation(els.tefContactPhone);
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
  els.archiveRequestButton.hidden = true;
  els.deleteRequestButton.hidden = true;
  els.requestCommentsTab.disabled = true;
  els.requestCommentCount.textContent = "0";
  els.requestCommentText.value = "";
  els.requestCommentMention.innerHTML = '<option value="">Não enviar notificação</option>';
  showFormError(els.requestCommentError);
  switchRequestTab("details");
  renderRequestComments();
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
    else if (els.requestType.value === "cancelamento") els.cancellationCnpjInput.focus();
    else els.tefCnpj.focus();
  }, 50);
}

function canRequesterEdit(item) {
  return !isAdmin()
    && item.requesterUid === state.user.uid
    && item.status === "nova";
}

function openRequestModal(id, source = "active") {
  const archived = source === "archived";
  const item = archived
    ? state.archivedRequests.find((request) => request.id === id)
    : state.requests.find((request) => request.id === id);
  if (!item || (!archived && !requestIsAccessible(item))) return;

  resetRequestForm();
  state.modalArchived = archived;
  const crmTrackingStarted = item.type === "cancelamento"
    && Object.keys(cancellationCrmTracking(item)).length > 0;
  const editable = !archived && (isAdmin() || (canRequesterEdit(item) && !crmTrackingStarted));
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
  els.tefCnpj.value = formatCnpj(item.tefCnpj || (item.type === "tef_elgin" ? item.clientCode : ""));
  els.tefOperatingSystem.value = item.tefOperatingSystem || "";
  els.tefRam.value = item.tefRam || "";
  els.tefSystemUsed.value = item.tefSystemUsed || "";
  els.tefEstablishmentNumber.value = item.tefEstablishmentNumber || "";
  els.tefPinpadLogicalNumber.value = item.tefPinpadLogicalNumber || "";
  els.tefPinpadModel.value = item.tefPinpadModel || "";
  els.tefAcquirer.value = item.tefAcquirer || "";
  els.tefOwnerName.value = item.tefOwnerName || "";
  els.tefOwnerCpf.value = formatCpf(item.tefOwnerCpf || "");
  els.tefContactPhone.value = formatPhone(item.tefContactPhone || "");
  els.tefContactEmail.value = item.tefContactEmail || "";
  els.tefAgreedValue.value = item.tefAgreedValue || "";

  // Valores preenchidos por código não disparam eventos input/blur.
  // Recalcula a validade para evitar mensagens incorretas no primeiro salvamento.
  if (item.type === "programacao") {
    setSpecificDocumentValidity(els.requestClientCode, "cnpj", { required: true, showMessage: false });
    setPhoneValidity(els.requestContactPhone, { showMessage: false });
  } else {
    clearFieldValidation(els.requestClientCode);
    clearFieldValidation(els.requestContactPhone);
  }
  if (item.type === "tef_elgin") {
    setSpecificDocumentValidity(els.tefCnpj, "cnpj", { required: true, showMessage: false });
    setSpecificDocumentValidity(els.tefOwnerCpf, "cpf", { required: true, showMessage: false });
    setPhoneValidity(els.tefContactPhone, { showMessage: false });
  } else {
    clearFieldValidation(els.tefCnpj);
    clearFieldValidation(els.tefOwnerCpf);
    clearFieldValidation(els.tefContactPhone);
  }

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

  els.requestModalTitle.textContent = archived ? "Solicitação arquivada" : "Detalhes da solicitação";
  els.saveRequestButton.textContent = "Salvar alterações";
  els.saveRequestButton.hidden = !editable;
  els.copyRequestButton.hidden = !isAdmin();
  els.deleteRequestButton.hidden = !isAdmin() || archived;
  els.archiveRequestButton.hidden = !isAdmin() || (!archived && item.status !== "concluida");
  els.archiveRequestButton.textContent = archived ? "↶ Restaurar" : "▣ Arquivar";
  els.requestCommentsTab.disabled = false;
  els.commentComposer.hidden = archived;
  els.requestAudit.hidden = false;
  els.requestAudit.innerHTML = `
    <strong>Solicitado por:</strong> ${escapeHtml(item.requesterName || item.requesterEmail || "—")}<br>
    <strong>Criado em:</strong> ${formatDateTime(item.createdAt)} · <strong>Tempo:</strong> ${formatElapsed(requestAge(item))}<br>
    <strong>Última atualização:</strong> ${formatDateTime(item.updatedAt)}${item.updatedByName ? ` por ${escapeHtml(item.updatedByName)}` : ""}
    ${archived ? `<br><strong>Arquivado em:</strong> ${formatDateTime(item.archivedAt)}${item.archivedByName ? ` por ${escapeHtml(item.archivedByName)}` : ""}` : ""}
  `;

  populateCommentMentionOptions(item);
  updateRequestTypeFields();
  subscribeRequestComments(item.id, archived);
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
    clientCode: formatCnpj(els.requestClientCode.value),
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

  if (!setSpecificDocumentValidity(els.requestClientCode, "cnpj", { required: true, showMessage: true })) {
    els.requestClientCode.focus();
    return { error: "Informe um CNPJ válido para o cliente." };
  }

  if (!setPhoneValidity(els.requestContactPhone, { showMessage: true })) {
    els.requestContactPhone.focus();
    return { error: "Informe um telefone fixo ou celular com DDD válido." };
  }

  if (!data.clientName
    || !data.clientCode
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

  const cancellationItems = getCancellationItemsFromForm().map((entry) => ({
    itemId: entry.itemId || createCancellationItemId(),
    clientName: entry.clientName || "",
    clientCnpj: entry.clientCnpj || "",
    reason: entry.reason || ""
  }));
  if (!cancellationItems.length) {
    return { error: "Adicione pelo menos um cliente para cancelamento." };
  }

  const incompleteIndex = cancellationItems.findIndex((entry) => (!entry.clientName && !entry.clientCnpj) || !entry.reason);
  if (incompleteIndex >= 0) {
    return { error: `Informe CPF/CNPJ ou Razão Social e o Motivo do cliente ${incompleteIndex + 1}.` };
  }

  const invalidDocumentIndex = cancellationItems.findIndex((entry) => entry.clientCnpj && !isValidCpfCnpj(entry.clientCnpj));
  if (invalidDocumentIndex >= 0) {
    return { error: `O CPF/CNPJ do cliente ${invalidDocumentIndex + 1} é inválido.` };
  }

  cancellationItems.forEach((entry) => {
    entry.clientCnpj = entry.clientCnpj ? formatCpfCnpj(entry.clientCnpj) : "";
  });

  const first = cancellationItems[0];
  const firstIdentifier = first.clientName || first.clientCnpj;
  const title = cancellationItems.length === 1
    ? `Cancelamento — ${firstIdentifier}`
    : `Cancelamentos — ${cancellationItems.length} clientes`;
  const description = cancellationItems
    .map((entry, index) => `${index + 1}. ${entry.clientName || entry.clientCnpj}: ${entry.reason}`)
    .join("\n")
    .slice(0, 3000);

  return {
    data: {
      priority: "normal",
      clientName: first.clientName || first.clientCnpj,
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

function buildTefPayload() {
  const data = {
    tefCnpj: formatCnpj(els.tefCnpj.value),
    tefOperatingSystem: sanitizeText(els.tefOperatingSystem.value),
    tefRam: sanitizeText(els.tefRam.value),
    tefSystemUsed: sanitizeText(els.tefSystemUsed.value),
    tefEstablishmentNumber: sanitizeText(els.tefEstablishmentNumber.value),
    tefPinpadLogicalNumber: sanitizeText(els.tefPinpadLogicalNumber.value),
    tefPinpadModel: sanitizeText(els.tefPinpadModel.value),
    tefAcquirer: sanitizeText(els.tefAcquirer.value),
    tefOwnerName: sanitizeText(els.tefOwnerName.value),
    tefOwnerCpf: formatCpf(els.tefOwnerCpf.value),
    tefContactPhone: formatPhone(els.tefContactPhone.value),
    tefContactEmail: sanitizeText(els.tefContactEmail.value),
    tefAgreedValue: sanitizeText(els.tefAgreedValue.value)
  };

  if (!setSpecificDocumentValidity(els.tefCnpj, "cnpj", { required: true, showMessage: true })) {
    els.tefCnpj.focus();
    return { error: "Informe um CNPJ válido para a solicitação TEF." };
  }
  if (!setSpecificDocumentValidity(els.tefOwnerCpf, "cpf", { required: true, showMessage: true })) {
    els.tefOwnerCpf.focus();
    return { error: "Informe um CPF válido para o proprietário." };
  }
  if (!setPhoneValidity(els.tefContactPhone, { showMessage: true })) {
    els.tefContactPhone.focus();
    return { error: "Informe um telefone fixo ou celular com DDD válido." };
  }

  if (Object.values(data).some((value) => !value)) {
    return { error: "Preencha todos os campos obrigatórios da solicitação TEF Elgin." };
  }

  const title = `TEF Elgin — ${data.tefCnpj}`;
  const description = [
    `Sistema operacional: ${data.tefOperatingSystem}`,
    `Memória RAM: ${data.tefRam}`,
    `Sistema utilizado: ${data.tefSystemUsed}`,
    `Adquirente: ${data.tefAcquirer}`,
    `Proprietário: ${data.tefOwnerName}`
  ].join("\n");

  return {
    data: {
      priority: "normal",
      clientName: data.tefCnpj,
      clientCode: data.tefCnpj,
      contactName: data.tefOwnerName,
      contactRole: "Proprietário",
      contactEmail: data.tefContactEmail,
      contactPhone: data.tefContactPhone,
      title: title.slice(0, 140),
      description: description.slice(0, 3000),
      currentBehavior: "",
      expectedBehavior: "",
      justification: "",
      videoLink: "",
      externalLink: "",
      cancellationItems: [],
      ...data
    }
  };
}

async function saveRequest(event) {
  event.preventDefault();
  showFormError(els.requestError);

  const id = els.requestId.value;
  const existing = state.requests.find((request) => request.id === id);
  const selectedType = VALID_TYPES.includes(els.requestType.value)
    ? els.requestType.value
    : "programacao";
  const type = existing && VALID_TYPES.includes(existing.type)
    ? existing.type
    : selectedType;
  const typeResult = type === "programacao"
    ? buildProgrammingPayload()
    : type === "cancelamento"
      ? buildCancellationPayload()
      : buildTefPayload();

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

  if (type === "cancelamento") {
    const existingTracking = cancellationCrmTracking(existing);
    const validItemIds = new Set((typeResult.data.cancellationItems || []).map((entry) => entry.itemId));
    payload.cancellationCrmStatus = Object.fromEntries(
      Object.entries(existingTracking).filter(([itemId]) => validItemIds.has(itemId))
    );
  }

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
        : type === "tef_elgin"
          ? "Solicitação TEF Elgin criada com sucesso."
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
    const [commentSnapshots, notificationSnapshots] = await Promise.all([
      getDocs(query(collection(db, "requestComments"), where("requestId", "==", id))),
      getDocs(query(collection(db, "notifications"), where("requestId", "==", id)))
    ]);
    const batch = writeBatch(db);
    (Array.isArray(item.attachments) ? item.attachments : []).forEach((attachment) => {
      const reference = firestoreAttachmentReference(normalizeAttachment(attachment));
      if (reference) batch.delete(reference);
    });
    commentSnapshots.docs.forEach((snapshotDoc) => batch.delete(snapshotDoc.ref));
    notificationSnapshots.docs.forEach((snapshotDoc) => batch.delete(snapshotDoc.ref));
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
CNPJ: ${item.clientCode || ""}

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
Motivo: ${entry.reason || ""}
Status no CRM: ${entry.crmCancelled === true ? "Cancelado" : "Pendente"}`);
  return `=== CHAMADOS PARA CANCELAMENTO ===\n\n${blocks.join("\n\n------------------------------\n\n")}`;
}

function tefCopyText(item) {
  return `=== SOLICITAÇÃO TEF ELGIN ===

CNPJ: ${item.tefCnpj || item.clientCode || ""}
SISTEMA OPERACIONAL: ${item.tefOperatingSystem || ""}
MEMÓRIA RAM DA MÁQUINA: ${item.tefRam || ""}
SISTEMA UTILIZADO: ${item.tefSystemUsed || ""}
NÚMERO DO ESTABELECIMENTO: ${item.tefEstablishmentNumber || ""}
NÚMERO LÓGICO DO PINPAD (SAK): ${item.tefPinpadLogicalNumber || ""}
MODELO PINPAD (MÁQUINA DE CARTÃO TEF): ${item.tefPinpadModel || ""}
ADQUIRENTE: ${item.tefAcquirer || ""}
NOME COMPLETO DO PROPRIETÁRIO: ${item.tefOwnerName || ""}
CPF DO PROPRIETÁRIO: ${item.tefOwnerCpf || ""}
FONE PARA CONTATO: ${item.tefContactPhone || ""}
E-MAIL: ${item.tefContactEmail || ""}
VALOR COMBINADO: ${item.tefAgreedValue || ""}`;
}

function requestCopyText(item) {
  if (item.type === "cancelamento") return cancellationCopyText(item);
  if (item.type === "tef_elgin") return tefCopyText(item);
  return programmingCopyText(item);
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
  const item = state.requests.find((request) => request.id === id)
    || state.archivedRequests.find((request) => request.id === id);
  if (!item) return;
  copyText(requestCopyText(item));
}


function switchRequestTab(tab = "details") {
  const showComments = tab === "comments" && !els.requestCommentsTab.disabled;
  els.requestDetailsTab.classList.toggle("active", !showComments);
  els.requestCommentsTab.classList.toggle("active", showComments);
  els.requestDetailsTab.setAttribute("aria-selected", String(!showComments));
  els.requestCommentsTab.setAttribute("aria-selected", String(showComments));
  els.requestDetailsPanel.hidden = showComments;
  els.requestCommentsPanel.hidden = !showComments;
  els.requestDetailsPanel.classList.toggle("active", !showComments);
  els.requestCommentsPanel.classList.toggle("active", showComments);
}

function populateCommentMentionOptions(item) {
  const targetIds = [...new Set([item.requesterUid, item.assigneeUid].filter(Boolean))]
    .filter((uid) => uid !== state.user?.uid)
    .filter((uid) => {
      const user = state.users.find((entry) => entry.uid === uid);
      return !user || user.active !== false;
    });
  const options = targetIds.map((uid) => {
    const user = state.users.find((entry) => entry.uid === uid);
    const fallbackName = uid === item.requesterUid
      ? item.requesterName || item.requesterEmail
      : item.assigneeName;
    const name = user?.name || user?.email || fallbackName || "Técnico";
    return `<option value="${escapeHtml(uid)}">${escapeHtml(name)}</option>`;
  }).join("");
  els.requestCommentMention.innerHTML = `<option value="">Não enviar notificação</option>${options}`;
  els.commentMentionField.hidden = !isAdmin() || !targetIds.length || state.modalArchived;
}

function renderRequestComments() {
  const comments = [...state.currentComments].sort((a, b) =>
    (timestampToDate(a.createdAt)?.getTime() || 0) - (timestampToDate(b.createdAt)?.getTime() || 0));
  els.requestCommentCount.textContent = String(comments.length);

  if (!comments.length) {
    els.requestCommentsList.innerHTML = `<div class="comments-empty"><strong>Nenhum comentário interno.</strong><span>Os comentários aparecerão aqui em ordem cronológica.</span></div>`;
    return;
  }

  els.requestCommentsList.innerHTML = comments.map((comment) => `
    <article class="comment-item ${comment.authorUid === state.user?.uid ? "own" : ""}">
      <div class="comment-avatar">${escapeHtml(initials(comment.authorName || comment.authorEmail))}</div>
      <div class="comment-body">
        <header><strong>${escapeHtml(comment.authorName || comment.authorEmail || "Usuário")}</strong><span>${escapeHtml(formatDateTime(comment.createdAt))}</span></header>
        <p>${escapeHtml(comment.text || "").replaceAll("\n", "<br>")}</p>
        ${comment.mentionName ? `<div class="comment-mention">♢ Notificação enviada para <strong>${escapeHtml(comment.mentionName)}</strong></div>` : ""}
      </div>
    </article>`).join("");
  els.requestCommentsList.scrollTop = els.requestCommentsList.scrollHeight;
}

function subscribeRequestComments(requestId, archived = false) {
  if (state.unsubscribeComments) state.unsubscribeComments();
  state.currentComments = [];
  renderRequestComments();
  state.unsubscribeComments = onSnapshot(
    query(collection(db, "requestComments"), where("requestId", "==", requestId)),
    (snapshot) => {
      state.currentComments = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }));
      renderRequestComments();
    },
    (error) => {
      console.error(error);
      showFormError(els.requestCommentError, firebaseErrorMessage(error));
    }
  );
  els.commentComposer.hidden = archived;
}

async function addRequestComment() {
  const requestId = els.requestId.value;
  const item = state.requests.find((request) => request.id === requestId);
  const text = sanitizeText(els.requestCommentText.value);
  showFormError(els.requestCommentError);

  if (!item || state.modalArchived) {
    showFormError(els.requestCommentError, "Comentários não podem ser adicionados a uma solicitação arquivada.");
    return;
  }
  if (!requestIsAccessible(item)) {
    showFormError(els.requestCommentError, "Você não possui acesso a esta solicitação.");
    return;
  }
  if (!text) {
    showFormError(els.requestCommentError, "Escreva um comentário antes de enviar.");
    els.requestCommentText.focus();
    return;
  }

  const mentionUid = isAdmin() ? els.requestCommentMention.value : "";
  const mentionUser = mentionUid ? state.users.find((user) => user.uid === mentionUid && user.active !== false) : null;
  setButtonLoading(els.addRequestCommentButton, true, "Enviando...");

  try {
    const batch = writeBatch(db);
    const commentRef = doc(collection(db, "requestComments"));
    batch.set(commentRef, {
      requestId,
      requestTitle: requestCardTitle(item).slice(0, 140),
      text,
      authorUid: state.user.uid,
      authorName: state.profile.name || state.user.email,
      authorEmail: state.user.email,
      mentionUid: mentionUser?.uid || "",
      mentionName: mentionUser?.name || mentionUser?.email || "",
      createdAt: serverTimestamp()
    });
    batch.update(doc(db, "requests", requestId), {
      commentCount: increment(1),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: state.profile.name || state.user.email
    });

    if (mentionUser && mentionUser.uid !== state.user.uid) {
      const notificationRef = doc(collection(db, "notifications"));
      batch.set(notificationRef, {
        targetUid: mentionUser.uid,
        targetName: mentionUser.name || mentionUser.email || "Técnico",
        createdByUid: state.user.uid,
        createdByName: state.profile.name || state.user.email,
        requestId,
        requestTitle: requestCardTitle(item).slice(0, 140),
        message: text.slice(0, 300),
        type: "mention",
        read: false,
        createdAt: serverTimestamp(),
        readAt: null
      });
    }

    await batch.commit();
    els.requestCommentText.value = "";
    els.requestCommentMention.value = "";
    showToast(mentionUser ? "Comentário enviado e técnico notificado." : "Comentário interno enviado.");
  } catch (error) {
    console.error(error);
    showFormError(els.requestCommentError, firebaseErrorMessage(error));
  } finally {
    setButtonLoading(els.addRequestCommentButton, false);
  }
}

function subscribeNotifications() {
  if (state.unsubscribeNotifications) state.unsubscribeNotifications();
  state.unsubscribeNotifications = onSnapshot(
    query(collection(db, "notifications"), where("targetUid", "==", state.user.uid)),
    (snapshot) => {
      state.notifications = snapshot.docs
        .map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }))
        .sort((a, b) => (timestampToDate(b.createdAt)?.getTime() || 0) - (timestampToDate(a.createdAt)?.getTime() || 0));
      renderNotifications();
    },
    (error) => console.error("Falha ao carregar notificações", error)
  );
}

function renderNotifications() {
  const unread = state.notifications.filter((notification) => notification.read !== true).length;
  els.notificationBadge.textContent = String(unread);
  els.notificationBadge.hidden = unread === 0;
  els.markAllNotificationsRead.disabled = unread === 0;

  if (!state.notifications.length) {
    els.notificationList.innerHTML = `<div class="notification-empty"><strong>Nenhuma notificação.</strong><span>Menções e pendências aparecerão aqui.</span></div>`;
    return;
  }

  els.notificationList.innerHTML = state.notifications.slice(0, 30).map((notification) => `
    <button class="notification-item ${notification.read === true ? "" : "unread"}" type="button" data-notification-id="${escapeHtml(notification.id)}" data-request-id="${escapeHtml(notification.requestId || "")}">
      <span class="notification-dot"></span>
      <span class="notification-copy"><strong>${escapeHtml(notification.requestTitle || "Solicitação")}</strong><span>${escapeHtml(notification.createdByName || "Usuário")}: ${escapeHtml(notification.message || "Novo alinhamento interno.")}</span><small>${escapeHtml(formatDateTime(notification.createdAt))}</small></span>
    </button>`).join("");
}

function toggleNotifications(force) {
  const shouldOpen = typeof force === "boolean" ? force : els.notificationPopover.hidden;
  els.notificationPopover.hidden = !shouldOpen;
}

async function openNotification(notificationId, requestId) {
  const notification = state.notifications.find((item) => item.id === notificationId);
  try {
    if (notification && notification.read !== true) {
      await updateDoc(doc(db, "notifications", notificationId), { read: true, readAt: serverTimestamp() });
    }
  } catch (error) {
    console.error(error);
  }
  toggleNotifications(false);
  const active = state.requests.find((item) => item.id === requestId);
  if (active) {
    openRequestModal(requestId);
    switchRequestTab("comments");
    return;
  }
  if (isAdmin()) {
    await loadArchivedRequests();
    const archived = state.archivedRequests.find((item) => item.id === requestId);
    if (archived) {
      openRequestModal(requestId, "archived");
      switchRequestTab("comments");
      return;
    }
  }
  showToast("A solicitação desta notificação não está mais disponível no Kanban.", "warning");
}

async function markAllNotificationsAsRead() {
  const unread = state.notifications.filter((notification) => notification.read !== true);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.slice(0, 400).forEach((notification) => {
    batch.update(doc(db, "notifications", notification.id), { read: true, readAt: serverTimestamp() });
  });
  try {
    await batch.commit();
    showToast("Notificações marcadas como lidas.");
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  }
}

async function loadArchivedRequests(force = false) {
  if (!isAdmin()) return;
  if (state.archivedLoaded && !force) return;
  const snapshots = await getDocs(collection(db, "archivedRequests"));
  state.archivedRequests = snapshots.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }));
  state.archivedLoaded = true;
}

function archivedFilteredRequests() {
  const term = state.archivedFilters.search.toLocaleLowerCase("pt-BR");
  return state.archivedRequests.filter((item) => {
    const haystack = [item.title, item.clientName, item.clientCode, item.requesterName, item.requesterEmail]
      .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return (!term || haystack.includes(term))
      && (state.archivedFilters.type === "all" || item.type === state.archivedFilters.type);
  }).sort((a, b) => (timestampToDate(b.archivedAt)?.getTime() || 0) - (timestampToDate(a.archivedAt)?.getTime() || 0));
}

function renderArchivedRequests() {
  const items = archivedFilteredRequests();
  els.archivedTableBody.innerHTML = items.map((item) => `
    <tr>
      <td><div class="archived-title"><strong>${escapeHtml(requestCardTitle(item))}</strong><span>${escapeHtml(item.clientName || item.clientCode || "—")}</span></div></td>
      <td><span class="tag ${escapeHtml(item.type)}">${escapeHtml(TYPE_LABELS[item.type] || "Solicitação")}</span></td>
      <td>${escapeHtml(item.requesterName || item.requesterEmail || "—")}</td>
      <td>${escapeHtml(formatDateTime(item.completedAt))}</td>
      <td>${escapeHtml(formatDateTime(item.archivedAt))}</td>
      <td><div class="archived-actions"><button class="user-action-button primary" type="button" data-archive-action="view" data-id="${escapeHtml(item.id)}">Abrir</button><button class="user-action-button success" type="button" data-archive-action="restore" data-id="${escapeHtml(item.id)}">Restaurar</button></div></td>
    </tr>`).join("");
  els.archivedEmptyState.hidden = items.length > 0;
  $(".archived-table-wrap")?.toggleAttribute("hidden", items.length === 0);
}

function requestDataWithoutId(item) {
  const { id, ...data } = item;
  return data;
}

function openArchiveConfirmation(action, item) {
  if (!isAdmin() || !item) return;
  state.archiveAction = { action, id: item.id };
  const restoring = action === "restore";
  els.archiveConfirmTitle.textContent = restoring ? "Restaurar solicitação?" : "Arquivar solicitação?";
  els.archiveConfirmMessage.textContent = restoring
    ? `A solicitação “${requestCardTitle(item)}” voltará para o Kanban na etapa Concluída.`
    : `A solicitação “${requestCardTitle(item)}” sairá do Kanban e ficará disponível no histórico.`;
  els.confirmArchiveButton.textContent = restoring ? "Restaurar solicitação" : "Arquivar solicitação";
  if (!els.archiveConfirmDialog.open) els.archiveConfirmDialog.showModal();
}

async function archiveRequestDocument(item) {
  if (!isAdmin() || !item || item.status !== "concluida") throw { code: "permission-denied" };
  const batch = writeBatch(db);
  batch.set(doc(db, "archivedRequests", item.id), {
    ...requestDataWithoutId(item),
    archivedAt: serverTimestamp(),
    archivedByUid: state.user.uid,
    archivedByName: state.profile.name || state.user.email
  });
  batch.delete(doc(db, "requests", item.id));
  await batch.commit();
  state.archivedLoaded = false;
}

async function restoreArchivedRequest(item) {
  if (!isAdmin() || !item) throw { code: "permission-denied" };
  const data = requestDataWithoutId(item);
  delete data.archivedAt;
  delete data.archivedByUid;
  delete data.archivedByName;
  const batch = writeBatch(db);
  batch.set(doc(db, "requests", item.id), {
    ...data,
    status: "concluida",
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: state.profile.name || state.user.email
  });
  batch.delete(doc(db, "archivedRequests", item.id));
  await batch.commit();
  state.archivedLoaded = false;
}

async function confirmArchiveAction() {
  const action = state.archiveAction;
  if (!action || !isAdmin()) return;
  setButtonLoading(els.confirmArchiveButton, true, action.action === "restore" ? "Restaurando..." : "Arquivando...");
  try {
    if (action.action === "restore") {
      const item = state.archivedRequests.find((entry) => entry.id === action.id);
      await restoreArchivedRequest(item);
      showToast("Solicitação restaurada para o Kanban.");
    } else {
      const item = state.requests.find((entry) => entry.id === action.id);
      await archiveRequestDocument(item);
      showToast("Solicitação arquivada com sucesso.");
    }
    closeModal(els.archiveConfirmDialog);
    closeModal(els.requestDialog);
    if (state.currentView === "archived") {
      await loadArchivedRequests(true);
      renderArchivedRequests();
    }
    if (state.currentView === "indicators") renderIndicators();
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  } finally {
    state.archiveAction = null;
    setButtonLoading(els.confirmArchiveButton, false);
  }
}

async function archiveOldCompletedRequests() {
  if (!isAdmin()) return;
  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const eligible = state.requests.filter((item) => item.status === "concluida"
    && (timestampToDate(item.completedAt)?.getTime() || 0) <= cutoff);
  if (!eligible.length) {
    showToast("Não há solicitações concluídas há mais de 30 dias.", "warning");
    return;
  }
  setButtonLoading(els.archiveOldRequestsButton, true, "Arquivando...");
  try {
    for (const item of eligible) await archiveRequestDocument(item);
    await loadArchivedRequests(true);
    renderArchivedRequests();
    showToast(`${eligible.length} solicitação${eligible.length === 1 ? " foi arquivada" : " foram arquivadas"}.`);
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  } finally {
    setButtonLoading(els.archiveOldRequestsButton, false);
  }
}

function setIndicatorDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const iso = (date) => date.toISOString().slice(0, 10);
  els.indicatorStartDate.value = iso(start);
  els.indicatorEndDate.value = iso(end);
  state.indicatorFilters.start = els.indicatorStartDate.value;
  state.indicatorFilters.end = els.indicatorEndDate.value;
  state.indicatorFilters.type = els.indicatorTypeFilter.value;
}

function indicatorSourceRequests() {
  const start = state.indicatorFilters.start ? new Date(`${state.indicatorFilters.start}T00:00:00`) : null;
  const end = state.indicatorFilters.end ? new Date(`${state.indicatorFilters.end}T23:59:59.999`) : null;
  return [...state.requests, ...state.archivedRequests].filter((item) => {
    const created = timestampToDate(item.createdAt);
    return created
      && (!start || created >= start)
      && (!end || created <= end)
      && (state.indicatorFilters.type === "all" || item.type === state.indicatorFilters.type);
  });
}

function reportBarsHtml(entries, total) {
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return entries.map(([label, value, className = "blue"]) => `
    <div class="report-bar-row"><div class="report-bar-label"><span>${escapeHtml(label)}</span><strong>${value}</strong></div><div class="report-bar-track"><span class="${escapeHtml(className)}" style="width:${Math.round((value / max) * 100)}%"></span></div><small>${total ? Math.round((value / total) * 100) : 0}% do período</small></div>`).join("");
}

function renderIndicators() {
  if (!isAdmin()) return;
  const items = indicatorSourceRequests();
  const completed = items.filter((item) => item.status === "concluida" || Boolean(item.archivedAt));
  const blocked = items.filter((item) => item.status === "bloqueio");
  const durations = completed.map((item) => {
    const created = timestampToDate(item.createdAt);
    const completedAt = timestampToDate(item.completedAt);
    return created && completedAt ? Math.max(0, completedAt - created) : null;
  }).filter((value) => value !== null);
  const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;

  els.indicatorCreated.textContent = items.length;
  els.indicatorCompleted.textContent = completed.length;
  els.indicatorAverageTime.textContent = average === null ? "—" : formatElapsed(average, true);
  els.indicatorBlocked.textContent = blocked.length;
  els.indicatorCompletionRate.textContent = `${items.length ? Math.round((completed.length / items.length) * 100) : 0}%`;
  els.indicatorArchived.textContent = items.filter((item) => Boolean(item.archivedAt)).length;

  const statusEntries = VALID_STATUSES.map((status) => [
    STATUS_LABELS[status],
    items.filter((item) => item.status === status).length,
    status === "concluida" ? "green" : status === "bloqueio" ? "red" : status === "aguardando" ? "amber" : status === "analise" ? "purple" : "blue"
  ]);
  const typeEntries = VALID_TYPES.map((type) => [
    TYPE_LABELS[type],
    items.filter((item) => item.type === type).length,
    type === "cancelamento" ? "red" : type === "tef_elgin" ? "amber" : "blue"
  ]);
  els.indicatorStatusBars.innerHTML = reportBarsHtml(statusEntries, items.length);
  els.indicatorTypeBars.innerHTML = reportBarsHtml(typeEntries, items.length);

  const requesterMap = new Map();
  items.forEach((item) => {
    const key = item.requesterUid || item.requesterEmail || "sem-solicitante";
    if (!requesterMap.has(key)) requesterMap.set(key, { name: item.requesterName || item.requesterEmail || "Não identificado", total: 0, completed: 0, open: 0, blocked: 0 });
    const entry = requesterMap.get(key);
    entry.total += 1;
    if (item.status === "concluida" || item.archivedAt) entry.completed += 1;
    else entry.open += 1;
    if (item.status === "bloqueio") entry.blocked += 1;
  });
  const requesterRows = [...requesterMap.values()].sort((a, b) => b.total - a.total);
  els.indicatorRequesterTable.innerHTML = requesterRows.length
    ? requesterRows.map((entry) => `<tr><td><strong>${escapeHtml(entry.name)}</strong></td><td>${entry.total}</td><td>${entry.completed}</td><td>${entry.open}</td><td>${entry.blocked}</td></tr>`).join("")
    : `<tr><td colspan="5" class="report-empty-row">Nenhuma solicitação no período selecionado.</td></tr>`;
}

async function changeCurrentUserPassword(event) {
  event.preventDefault();
  showFormError(els.changePasswordError);

  const currentPassword = els.currentPassword.value;
  const newPassword = els.newPassword.value;
  const confirmation = els.confirmNewPassword.value;

  if (!currentPassword || !newPassword || !confirmation) {
    showFormError(els.changePasswordError, "Preencha todos os campos.");
    return;
  }
  if (newPassword.length < 6) {
    showFormError(els.changePasswordError, "A nova senha deve possuir pelo menos 6 caracteres.");
    return;
  }
  if (newPassword !== confirmation) {
    showFormError(els.changePasswordError, "A confirmação da nova senha não confere.");
    return;
  }
  if (currentPassword === newPassword) {
    showFormError(els.changePasswordError, "A nova senha precisa ser diferente da senha atual.");
    return;
  }
  if (!auth.currentUser?.email) {
    showFormError(els.changePasswordError, "Não foi possível identificar o usuário conectado.");
    return;
  }

  setButtonLoading(els.saveNewPasswordButton, true, "Alterando...");
  try {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPassword);
    els.changePasswordForm.reset();
    [els.currentPassword, els.newPassword, els.confirmNewPassword].forEach((input) => { input.type = "password"; });
    closeModal(els.changePasswordDialog);
    showToast("Senha alterada com sucesso.");
  } catch (error) {
    console.error(error);
    const message = ["auth/invalid-credential", "auth/wrong-password"].includes(error?.code)
      ? "A senha atual está incorreta."
      : firebaseErrorMessage(error);
    showFormError(els.changePasswordError, message);
  } finally {
    setButtonLoading(els.saveNewPasswordButton, false);
  }
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

function syncModalScrollLock() {
  const hasOpenDialog = Boolean(document.querySelector("dialog[open]"));
  document.documentElement.classList.toggle("modal-open", hasOpenDialog);
  document.body.classList.toggle("modal-open", hasOpenDialog);
}

function setupModalScrollLock() {
  const dialogs = Array.from(document.querySelectorAll("dialog"));
  const observer = new MutationObserver(syncModalScrollLock);

  dialogs.forEach((dialog) => {
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    dialog.addEventListener("close", syncModalScrollLock);
    dialog.addEventListener("cancel", () => requestAnimationFrame(syncModalScrollLock));
  });

  syncModalScrollLock();
}

function closeModal(dialog) {
  if (dialog.open) dialog.close();
  requestAnimationFrame(syncModalScrollLock);
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


function roleLabel(role) {
  return role === "admin" ? "Administrador" : "Solicitante";
}

function inviteStatus(invite) {
  const expiresAt = timestampToDate(invite.expiresAt);
  if (invite.status === "pending" && expiresAt && expiresAt.getTime() <= Date.now()) return "expired";
  return invite.status || "pending";
}

function generateInviteToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildInviteUrl(token) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", token);
  return url.toString();
}

function removeInviteFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  state.inviteToken = "";
  state.inviteData = null;
}

function showLoginCard() {
  els.loginForm.hidden = false;
  els.inviteRegistrationForm.hidden = true;
}

function showInviteCard() {
  els.loginForm.hidden = true;
  els.inviteRegistrationForm.hidden = false;
}

async function initializeInviteFlow() {
  if (!state.inviteToken || !isConfigReady()) return;
  showInviteCard();
  els.inviteLoading.hidden = false;
  els.inviteRegistrationFields.hidden = true;
  showFormError(els.inviteRegistrationError);

  try {
    const snapshot = await getDoc(doc(db, "userInvites", state.inviteToken));
    if (!snapshot.exists()) throw { code: "invite-invalid" };
    const invite = { id: snapshot.id, ...snapshot.data() };
    const expiresAt = timestampToDate(invite.expiresAt);
    if (invite.status !== "pending") throw { code: "invite-invalid" };
    if (!expiresAt || expiresAt.getTime() <= Date.now()) throw { code: "invite-expired" };

    state.inviteData = invite;
    els.inviteRegistrationName.value = invite.name || "";
    els.inviteRegistrationEmail.value = invite.email || "";
    els.inviteRegistrationRole.textContent = roleLabel(invite.role);
    els.inviteLoading.hidden = true;
    els.inviteRegistrationFields.hidden = false;
  } catch (error) {
    console.error(error);
    els.inviteLoading.hidden = true;
    showFormError(els.inviteRegistrationError, firebaseErrorMessage(error));
  }
}

async function registerFromInvite(event) {
  event.preventDefault();
  showFormError(els.inviteRegistrationError);
  const invite = state.inviteData;
  const password = els.inviteRegistrationPassword.value;
  const confirmation = els.inviteRegistrationConfirmPassword.value;

  if (!invite || invite.status !== "pending") {
    showFormError(els.inviteRegistrationError, "Este convite não está mais disponível.");
    return;
  }
  if (password.length < 6) {
    showFormError(els.inviteRegistrationError, "A senha deve possuir pelo menos 6 caracteres.");
    return;
  }
  if (password !== confirmation) {
    showFormError(els.inviteRegistrationError, "As senhas informadas não são iguais.");
    return;
  }

  setButtonLoading(els.inviteRegistrationButton, true, "Criando acesso...");
  state.inviteRegistrationInProgress = true;
  let createdUser = null;
  try {
    await setPersistence(auth, browserLocalPersistence);
    const credential = await createUserWithEmailAndPassword(auth, invite.email, password);
    createdUser = credential.user;
    const batch = writeBatch(db);
    batch.set(doc(db, "users", createdUser.uid), {
      name: invite.name,
      email: invite.email,
      role: invite.role,
      active: true,
      inviteToken: state.inviteToken,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.update(doc(db, "userInvites", state.inviteToken), {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      acceptedUid: createdUser.uid
    });
    await batch.commit();

    removeInviteFromUrl();
    state.inviteRegistrationInProgress = false;
    showToast("Acesso criado com sucesso.");
    await handleAuthenticated(createdUser);
  } catch (error) {
    console.error(error);
    if (createdUser) {
      try { await deleteUser(createdUser); } catch (cleanupError) { console.error(cleanupError); }
    }
    state.inviteRegistrationInProgress = false;
    showFormError(els.inviteRegistrationError, firebaseErrorMessage(error));
  } finally {
    setButtonLoading(els.inviteRegistrationButton, false);
  }
}

async function loadInvites() {
  if (!isAdmin()) {
    state.invites = [];
    return;
  }
  const snapshots = await getDocs(collection(db, "userInvites"));
  state.invites = snapshots.docs
    .map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
    .sort((a, b) => (timestampToDate(b.createdAt)?.getTime() || 0) - (timestampToDate(a.createdAt)?.getTime() || 0));
  if (state.currentView === "users") renderUserManagement();
}

async function refreshUserManagement(showMessage = false) {
  if (!isAdmin()) return;
  try {
    await Promise.all([loadUsers(), loadInvites()]);
    renderUserManagement();
    if (showMessage) showToast("Lista de usuários atualizada.");
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  }
}

function userManagementEntries() {
  const users = state.users.map((user) => ({ kind: "user", ...user }));
  const invites = state.invites
    .filter((invite) => inviteStatus(invite) === "pending")
    .map((invite) => ({ kind: "invite", ...invite }));
  const term = state.userFilters.search.toLocaleLowerCase("pt-BR");

  return [...users, ...invites].filter((entry) => {
    const status = entry.kind === "invite" ? "pending" : entry.active === false ? "inactive" : "active";
    const haystack = `${entry.name || ""} ${entry.email || ""}`.toLocaleLowerCase("pt-BR");
    return (!term || haystack.includes(term))
      && (state.userFilters.status === "all" || state.userFilters.status === status)
      && (state.userFilters.role === "all" || state.userFilters.role === entry.role);
  }).sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "", "pt-BR"));
}

function userRowHtml(entry) {
  if (entry.kind === "invite") {
    return `
      <tr>
        <td><div class="user-identity"><div class="user-list-avatar pending">✉</div><div><strong>${escapeHtml(entry.name || "Convite")}</strong><span>${escapeHtml(entry.email || "")}</span></div></div></td>
        <td><span class="user-role-badge ${escapeHtml(entry.role)}">${escapeHtml(roleLabel(entry.role))}</span></td>
        <td><span class="user-status-badge pending">● Convite pendente</span></td>
        <td><div class="user-date">Criado em ${escapeHtml(formatDateTime(entry.createdAt))}<br>Expira em ${escapeHtml(formatDateTime(entry.expiresAt))}</div></td>
        <td><div class="user-actions">
          <button class="user-action-button primary" type="button" data-user-action="copy-invite" data-id="${escapeHtml(entry.id)}">⧉ Copiar convite</button>
          <button class="user-action-button danger" type="button" data-user-action="cancel-invite" data-id="${escapeHtml(entry.id)}">Cancelar convite</button>
        </div></td>
      </tr>`;
  }

  const active = entry.active !== false;
  const isSelf = entry.uid === state.user?.uid;
  return `
    <tr>
      <td><div class="user-identity"><div class="user-list-avatar">${escapeHtml(initials(entry.name || entry.email))}</div><div><strong>${escapeHtml(entry.name || "Usuário")}${isSelf ? " (você)" : ""}</strong><span>${escapeHtml(entry.email || "")}</span></div></div></td>
      <td><span class="user-role-badge ${escapeHtml(entry.role)}">${escapeHtml(roleLabel(entry.role))}</span></td>
      <td><span class="user-status-badge ${active ? "active" : "inactive"}">● ${active ? "Ativo" : "Inativo"}</span></td>
      <td><div class="user-date">${escapeHtml(formatDateTime(entry.createdAt))}</div></td>
      <td><div class="user-actions">
        <button class="user-action-button" type="button" data-user-action="edit-user" data-id="${escapeHtml(entry.uid)}">Editar</button>
        <button class="user-action-button" type="button" data-user-action="reset-password" data-id="${escapeHtml(entry.uid)}">Redefinir senha</button>
        <button class="user-action-button ${active ? "danger" : "success"}" type="button" data-user-action="toggle-user" data-id="${escapeHtml(entry.uid)}" ${isSelf ? "disabled title=\"Você não pode desativar o próprio acesso\"" : ""}>${active ? "Desativar" : "Reativar"}</button>
      </div></td>
    </tr>`;
}

function renderUserManagement() {
  if (!isAdmin()) return;
  const activeUsers = state.users.filter((user) => user.active !== false);
  const inactiveUsers = state.users.filter((user) => user.active === false);
  const pendingInvites = state.invites.filter((invite) => inviteStatus(invite) === "pending");
  els.metricActiveUsers.textContent = activeUsers.length;
  els.metricAdminUsers.textContent = activeUsers.filter((user) => user.role === "admin").length;
  els.metricPendingInvites.textContent = pendingInvites.length;
  els.metricInactiveUsers.textContent = inactiveUsers.length;

  const entries = userManagementEntries();
  els.usersTableBody.innerHTML = entries.map(userRowHtml).join("");
  els.usersEmptyState.hidden = entries.length !== 0;
  els.usersTableBody.closest(".users-table-wrap").hidden = entries.length === 0;
}

async function switchAppView(view = "kanban") {
  if (["users", "indicators", "archived"].includes(view) && !isAdmin()) view = "kanban";
  state.currentView = view;
  els.kanbanView.hidden = view !== "kanban";
  els.usersView.hidden = view !== "users";
  els.indicatorsView.hidden = view !== "indicators";
  els.archivedView.hidden = view !== "archived";
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));

  if (view === "users") await refreshUserManagement();
  if (view === "indicators") {
    if (!els.indicatorStartDate.value) setIndicatorDefaultDates();
    try {
      await loadArchivedRequests();
      renderIndicators();
    } catch (error) {
      console.error(error);
      showToast(firebaseErrorMessage(error), "error");
    }
  }
  if (view === "archived") {
    try {
      await loadArchivedRequests();
      renderArchivedRequests();
    } catch (error) {
      console.error(error);
      showToast(firebaseErrorMessage(error), "error");
    }
  }
  els.sidebar.classList.remove("open");
}

function openUserInviteDialog() {
  if (!isAdmin()) return;
  els.userInviteForm.reset();
  els.userInviteRole.value = "solicitante";
  els.userInviteFormFields.hidden = false;
  els.userInviteResult.hidden = true;
  showFormError(els.userInviteError);
  els.userInviteDialog.showModal();
}

async function createUserInvite(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  showFormError(els.userInviteError);
  const name = sanitizeText(els.userInviteName.value);
  const email = els.userInviteEmail.value.trim().toLocaleLowerCase("pt-BR");
  const role = VALID_USER_ROLES.includes(els.userInviteRole.value) ? els.userInviteRole.value : "solicitante";

  if (!name || !email) {
    showFormError(els.userInviteError, "Preencha nome e e-mail.");
    return;
  }
  if (state.users.some((user) => (user.email || "").toLocaleLowerCase("pt-BR") === email)) {
    showFormError(els.userInviteError, "Já existe um usuário cadastrado com este e-mail.");
    return;
  }
  if (state.invites.some((invite) => inviteStatus(invite) === "pending" && (invite.email || "").toLocaleLowerCase("pt-BR") === email)) {
    showFormError(els.userInviteError, "Já existe um convite pendente para este e-mail.");
    return;
  }

  setButtonLoading(els.createUserInviteButton, true, "Gerando...");
  try {
    const token = generateInviteToken();
    const expirationDate = new Date(Date.now() + INVITE_VALID_DAYS * 86400000);
    await setDoc(doc(db, "userInvites", token), {
      name,
      email,
      role,
      status: "pending",
      createdAt: serverTimestamp(),
      createdByUid: state.user.uid,
      createdByName: state.profile.name || state.user.email,
      expiresAt: Timestamp.fromDate(expirationDate)
    });
    const link = buildInviteUrl(token);
    els.userInviteLink.value = link;
    els.userInviteExpiration.textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(expirationDate);
    els.userInviteFormFields.hidden = true;
    els.userInviteResult.hidden = false;
    await loadInvites();
  } catch (error) {
    console.error(error);
    showFormError(els.userInviteError, firebaseErrorMessage(error));
  } finally {
    setButtonLoading(els.createUserInviteButton, false);
  }
}

function openEditUserDialog(uid) {
  const user = state.users.find((entry) => entry.uid === uid);
  if (!isAdmin() || !user) return;
  const isSelf = uid === state.user.uid;
  els.editUserId.value = uid;
  els.editUserName.value = user.name || "";
  els.editUserEmail.value = user.email || "";
  els.editUserRole.value = user.role || "solicitante";
  els.editUserRole.disabled = isSelf;
  els.editUserSelfNote.hidden = !isSelf;
  showFormError(els.editUserError);
  els.editUserDialog.showModal();
}

async function saveUserProfile(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  showFormError(els.editUserError);
  const uid = els.editUserId.value;
  const user = state.users.find((entry) => entry.uid === uid);
  if (!user) return;
  const name = sanitizeText(els.editUserName.value);
  const role = uid === state.user.uid ? "admin" : els.editUserRole.value;
  if (!name || !VALID_USER_ROLES.includes(role)) {
    showFormError(els.editUserError, "Informe um nome e um perfil válidos.");
    return;
  }

  setButtonLoading(els.saveUserButton, true, "Salvando...");
  try {
    await updateDoc(doc(db, "users", uid), {
      name,
      role,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    });
    closeModal(els.editUserDialog);
    await loadUsers();
    showToast("Usuário atualizado com sucesso.");
  } catch (error) {
    console.error(error);
    showFormError(els.editUserError, firebaseErrorMessage(error));
  } finally {
    setButtonLoading(els.saveUserButton, false);
  }
}

function openUserStatusDialog(uid) {
  const user = state.users.find((entry) => entry.uid === uid);
  if (!isAdmin() || !user || uid === state.user.uid) return;
  const activating = user.active === false;
  els.userStatusTargetId.value = uid;
  els.userStatusDialogTitle.textContent = activating ? "Reativar usuário?" : "Desativar usuário?";
  els.userStatusDialogMessage.textContent = activating
    ? `${user.name || user.email} voltará a acessar o painel com a senha atual.`
    : `${user.name || user.email} perderá o acesso imediatamente.`;
  els.userStatusDialogWarningTitle.textContent = activating ? "O acesso será restaurado." : "O histórico será mantido.";
  els.userStatusDialogWarningText.textContent = activating
    ? "Caso tenha esquecido a senha, envie também um link de redefinição."
    : "Solicitações antigas e registros feitos por este usuário não serão apagados.";
  els.confirmUserStatusButton.textContent = activating ? "Reativar usuário" : "Desativar usuário";
  els.confirmUserStatusButton.classList.toggle("button-danger", !activating);
  els.confirmUserStatusButton.classList.toggle("button-primary", activating);
  els.userStatusDialogIcon.textContent = activating ? "✓" : "!";
  els.userStatusDialog.showModal();
}

async function confirmUserStatusChange() {
  if (!isAdmin()) return;
  const uid = els.userStatusTargetId.value;
  const user = state.users.find((entry) => entry.uid === uid);
  if (!user || uid === state.user.uid) return;
  const active = user.active === false;
  setButtonLoading(els.confirmUserStatusButton, true, active ? "Reativando..." : "Desativando...");
  try {
    await updateDoc(doc(db, "users", uid), {
      active,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    });
    closeModal(els.userStatusDialog);
    await loadUsers();
    showToast(active ? "Usuário reativado." : "Usuário desativado.");
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  } finally {
    setButtonLoading(els.confirmUserStatusButton, false);
  }
}

async function sendUserPasswordReset(uid) {
  const user = state.users.find((entry) => entry.uid === uid);
  if (!isAdmin() || !user?.email) return;
  try {
    auth.languageCode = "pt-BR";
    await sendPasswordResetEmail(auth, user.email);
    showToast(`Link de redefinição enviado para ${user.email}.`);
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  }
}

async function cancelInvite(id) {
  const invite = state.invites.find((entry) => entry.id === id);
  if (!isAdmin() || !invite) return;
  try {
    await updateDoc(doc(db, "userInvites", id), {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledByUid: state.user.uid
    });
    await loadInvites();
    showToast("Convite cancelado.");
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  }
}

function handleUserTableAction(event) {
  const button = event.target.closest("[data-user-action]");
  if (!button) return;
  const { userAction, id } = button.dataset;
  if (userAction === "edit-user") openEditUserDialog(id);
  if (userAction === "toggle-user") openUserStatusDialog(id);
  if (userAction === "reset-password") sendUserPasswordReset(id);
  if (userAction === "copy-invite") copyText(buildInviteUrl(id));
  if (userAction === "cancel-invite") cancelInvite(id);
}

function subscribeCurrentProfile() {
  if (state.unsubscribeProfile) state.unsubscribeProfile();
  if (!state.user) return;
  state.unsubscribeProfile = onSnapshot(doc(db, "users", state.user.uid), async (snapshot) => {
    if (!snapshot.exists() || snapshot.data().active !== true) {
      state.forcedLogoutMessage = "Seu acesso foi desativado por um administrador.";
      signOut(auth);
      return;
    }
    const previousRole = state.profile?.role;
    state.profile = { uid: snapshot.id, ...snapshot.data() };
    renderUser();
    if (previousRole && previousRole !== state.profile.role) {
      if (!isAdmin() && ["users", "indicators", "archived"].includes(state.currentView)) switchAppView("kanban");
      await loadUsers();
      subscribeRequests();
    }
  }, (error) => {
    console.error(error);
    state.forcedLogoutMessage = "Seu acesso não está mais disponível.";
    signOut(auth);
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

  els.inviteRegistrationForm.addEventListener("submit", registerFromInvite);
  els.backToLoginButton.addEventListener("click", () => {
    removeInviteFromUrl();
    showLoginCard();
    showFormError(els.inviteRegistrationError);
  });
  $(".toggle-invite-password").addEventListener("click", (event) => {
    const hidden = els.inviteRegistrationPassword.type === "password";
    els.inviteRegistrationPassword.type = hidden ? "text" : "password";
    els.inviteRegistrationConfirmPassword.type = hidden ? "text" : "password";
    event.currentTarget.textContent = hidden ? "🙈" : "👁";
  });

  els.togglePassword.addEventListener("click", () => {
    const hidden = els.loginPassword.type === "password";
    els.loginPassword.type = hidden ? "text" : "password";
    els.togglePassword.textContent = hidden ? "🙈" : "👁";
    els.togglePassword.setAttribute("aria-label", hidden ? "Ocultar senha" : "Mostrar senha");
  });

  els.logoutButton.addEventListener("click", () => signOut(auth));
  els.changePasswordButton.addEventListener("click", () => {
    els.changePasswordForm.reset();
    showFormError(els.changePasswordError);
    [els.currentPassword, els.newPassword, els.confirmNewPassword].forEach((input) => { input.type = "password"; });
    els.changePasswordDialog.showModal();
    window.setTimeout(() => els.currentPassword.focus(), 50);
  });
  els.changePasswordForm.addEventListener("submit", changeCurrentUserPassword);
  els.showChangePasswords.addEventListener("change", () => {
    const type = els.showChangePasswords.checked ? "text" : "password";
    [els.currentPassword, els.newPassword, els.confirmNewPassword].forEach((input) => { input.type = type; });
  });
  $$(".close-change-password-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.changePasswordDialog)));
  els.newRequestButton.addEventListener("click", () => openNewRequestModal());
  els.helpButton.addEventListener("click", () => openHelpDialog());
  els.topHelpButton.addEventListener("click", () => openHelpDialog());
  els.notificationButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleNotifications();
  });
  els.closeNotificationsButton.addEventListener("click", () => toggleNotifications(false));
  els.markAllNotificationsRead.addEventListener("click", markAllNotificationsAsRead);
  els.notificationList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-notification-id]");
    if (!button) return;
    openNotification(button.dataset.notificationId, button.dataset.requestId);
  });
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

  setupSpecificDocumentInput(els.requestClientCode, "cnpj", { required: true });
  setupDocumentInput(els.cancellationCnpjInput, { required: false });
  setupSpecificDocumentInput(els.tefCnpj, "cnpj", { required: true });
  setupSpecificDocumentInput(els.tefOwnerCpf, "cpf", { required: true });
  setupPhoneInput(els.requestContactPhone);
  setupPhoneInput(els.tefContactPhone);

  els.requestForm.addEventListener("submit", saveRequest);
  els.requestType.addEventListener("change", updateRequestTypeFields);
  els.requestAttachments.addEventListener("change", handleAttachmentSelection);
  els.addCancellationItem.addEventListener("click", addCancellationItem);
  els.copyRequestButton.addEventListener("click", () => copyRequestById(els.requestId.value));
  els.requestDetailsTab.addEventListener("click", () => switchRequestTab("details"));
  els.requestCommentsTab.addEventListener("click", () => switchRequestTab("comments"));
  els.addRequestCommentButton.addEventListener("click", addRequestComment);
  els.archiveRequestButton.addEventListener("click", () => {
    const item = state.modalArchived
      ? state.archivedRequests.find((entry) => entry.id === els.requestId.value)
      : state.requests.find((entry) => entry.id === els.requestId.value);
    openArchiveConfirmation(state.modalArchived ? "restore" : "archive", item);
  });
  els.confirmArchiveButton.addEventListener("click", confirmArchiveAction);
  $$(".close-archive-confirm").forEach((button) => button.addEventListener("click", () => closeModal(els.archiveConfirmDialog)));
  els.deleteRequestButton.addEventListener("click", deleteRequest);
  els.confirmDeleteButton.addEventListener("click", confirmDeleteRequest);
  $$(".close-delete-confirm").forEach((button) => button.addEventListener("click", () => closeModal(els.deleteConfirmDialog)));
  $$(".close-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.requestDialog)));

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
      if (["users", "indicators", "archived"].includes(button.dataset.view)) {
        switchAppView(button.dataset.view);
        return;
      }
      switchAppView("kanban");
      if (button.dataset.filterType) {
        els.typeFilter.value = button.dataset.filterType;
        state.filters.type = button.dataset.filterType;
      } else {
        els.typeFilter.value = "all";
        state.filters.type = "all";
      }
      $$(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderBoard();
    });
  });

  $$(".mobile-menu").forEach((button) => button.addEventListener("click", () => els.sidebar.classList.toggle("open")));
  document.addEventListener("click", (event) => {
    if (window.innerWidth <= 900
      && els.sidebar.classList.contains("open")
      && !els.sidebar.contains(event.target)
      && !event.target.closest(".mobile-menu")) {
      els.sidebar.classList.remove("open");
    }
    if (!els.notificationPopover.hidden
      && !els.notificationPopover.contains(event.target)
      && !els.notificationButton.contains(event.target)) {
      toggleNotifications(false);
    }
  });

  els.newUserInviteButton.addEventListener("click", openUserInviteDialog);
  els.refreshUsersButton.addEventListener("click", () => refreshUserManagement(true));
  els.userInviteForm.addEventListener("submit", createUserInvite);
  els.copyUserInviteLink.addEventListener("click", () => copyText(els.userInviteLink.value));
  $$(".close-user-invite-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.userInviteDialog)));
  els.editUserForm.addEventListener("submit", saveUserProfile);
  $$(".close-edit-user-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.editUserDialog)));
  els.confirmUserStatusButton.addEventListener("click", confirmUserStatusChange);
  $$(".close-user-status-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.userStatusDialog)));
  els.usersTableBody.addEventListener("click", handleUserTableAction);
  els.userSearchInput.addEventListener("input", () => {
    state.userFilters.search = els.userSearchInput.value.trim();
    renderUserManagement();
  });
  els.userStatusFilter.addEventListener("change", () => {
    state.userFilters.status = els.userStatusFilter.value;
    renderUserManagement();
  });
  els.userRoleFilter.addEventListener("change", () => {
    state.userFilters.role = els.userRoleFilter.value;
    renderUserManagement();
  });

  els.refreshIndicatorsButton.addEventListener("click", async () => {
    await loadArchivedRequests(true);
    renderIndicators();
    showToast("Indicadores atualizados.");
  });
  [els.indicatorStartDate, els.indicatorEndDate, els.indicatorTypeFilter].forEach((control) => {
    control.addEventListener("change", () => {
      state.indicatorFilters.start = els.indicatorStartDate.value;
      state.indicatorFilters.end = els.indicatorEndDate.value;
      state.indicatorFilters.type = els.indicatorTypeFilter.value;
      renderIndicators();
    });
  });
  els.indicatorClearFilter.addEventListener("click", () => {
    els.indicatorTypeFilter.value = "all";
    setIndicatorDefaultDates();
    renderIndicators();
  });
  els.refreshArchivedButton.addEventListener("click", async () => {
    await loadArchivedRequests(true);
    renderArchivedRequests();
    showToast("Histórico atualizado.");
  });
  els.archiveOldRequestsButton.addEventListener("click", archiveOldCompletedRequests);
  els.archivedSearchInput.addEventListener("input", () => {
    state.archivedFilters.search = els.archivedSearchInput.value.trim();
    renderArchivedRequests();
  });
  els.archivedTypeFilter.addEventListener("change", () => {
    state.archivedFilters.type = els.archivedTypeFilter.value;
    renderArchivedRequests();
  });
  els.archivedTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-archive-action]");
    if (!button) return;
    const item = state.archivedRequests.find((entry) => entry.id === button.dataset.id);
    if (button.dataset.archiveAction === "view") openRequestModal(button.dataset.id, "archived");
    if (button.dataset.archiveAction === "restore") openArchiveConfirmation("restore", item);
  });

  els.forgotPassword.addEventListener("click", () => {
    els.resetEmail.value = els.loginEmail.value.trim();
    showFormError(els.resetError);
    els.resetDialog.showModal();
  });
  $$(".close-reset-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.resetDialog)));
  els.resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(els.resetError);
    try {
      auth.languageCode = "pt-BR";
      await sendPasswordResetEmail(auth, els.resetEmail.value.trim());
      els.resetDialog.close();
      showToast("Link de redefinição enviado para o e-mail informado.");
    } catch (error) {
      console.error(error);
      showFormError(els.resetError, firebaseErrorMessage(error));
    }
  });

  [els.requestDialog, els.resetDialog, els.changePasswordDialog, els.helpDialog, els.userInviteDialog, els.editUserDialog, els.userStatusDialog, els.archiveConfirmDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  els.requestDialog.addEventListener("close", () => {
    if (state.unsubscribeComments) state.unsubscribeComments();
    state.unsubscribeComments = null;
    state.currentComments = [];
  });

  setupDropzones();
  setupModalScrollLock();
}

async function handleAuthenticated(user) {
  if (state.inviteRegistrationInProgress) return;
  try {
    const profile = await loadProfile(user);
    if (profile.active !== true) {
      state.forcedLogoutMessage = "Seu acesso está desativado. Procure o administrador.";
      await signOut(auth);
      return;
    }

    state.user = user;
    state.profile = profile;
    els.loginView.hidden = true;
    els.appView.hidden = false;
    showLoginCard();
    renderUser();
    await switchAppView("kanban");
    await loadUsers();
    subscribeRequests();
    subscribeNotifications();
    subscribeCurrentProfile();

    if (state.elapsedTimer) clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(updateElapsedLabels, 60000);
  } catch (error) {
    console.error(error);
    const message = error.message === "profile-not-found"
      ? "Seu login existe, mas o perfil de acesso ainda não foi cadastrado. Solicite um convite ao administrador."
      : firebaseErrorMessage(error);
    state.forcedLogoutMessage = message;
    await signOut(auth);
  }
}

function handleSignedOut() {
  if (state.unsubscribeRequests) state.unsubscribeRequests();
  if (state.unsubscribeProfile) state.unsubscribeProfile();
  if (state.unsubscribeNotifications) state.unsubscribeNotifications();
  if (state.unsubscribeComments) state.unsubscribeComments();
  if (state.elapsedTimer) clearInterval(state.elapsedTimer);
  state.unsubscribeRequests = null;
  state.unsubscribeProfile = null;
  state.unsubscribeNotifications = null;
  state.unsubscribeComments = null;
  state.user = null;
  state.profile = null;
  state.requests = [];
  state.archivedRequests = [];
  state.archivedLoaded = false;
  state.users = [];
  state.invites = [];
  state.notifications = [];
  state.currentComments = [];
  toggleNotifications(false);
  els.notificationList.innerHTML = "";
  els.notificationBadge.hidden = true;
  els.appView.hidden = true;
  els.loginView.hidden = false;
  els.loginPassword.value = "";

  if (state.inviteToken) {
    showInviteCard();
    initializeInviteFlow();
  } else {
    showLoginCard();
    if (state.forcedLogoutMessage) {
      showFormError(els.loginError, state.forcedLogoutMessage);
      state.forcedLogoutMessage = "";
    }
  }
}


async function loadAppVersion() {
  const card = document.getElementById("app-version-card");
  const versionLabel = document.getElementById("app-version-label");
  const detailsLabel = document.getElementById("app-version-details");
  if (!card || !versionLabel || !detailsLabel) return;

  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("version-file-unavailable");

    const info = await response.json();
    const release = String(info.release || "19").replace(/^v/i, "");
    const isLocal = !info.build || String(info.build).toLowerCase() === "local";
    const commit = info.commit && info.commit !== "local" ? String(info.commit).slice(0, 7) : "";

    versionLabel.textContent = `v${release}`;

    if (isLocal) {
      detailsLabel.textContent = "Ambiente local";
      card.title = `Versão v${release} - ambiente local`;
      return;
    }

    let publishedText = "";
    if (info.builtAt) {
      const publishedAt = new Date(info.builtAt);
      if (!Number.isNaN(publishedAt.getTime())) {
        publishedText = publishedAt.toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      }
    }

    detailsLabel.textContent = `Build ${info.build}${commit ? ` · ${commit}` : ""}`;
    card.title = [
      `Versão v${release}`,
      `Build ${info.build}`,
      commit ? `Commit ${commit}` : "",
      publishedText ? `Publicado em ${publishedText}` : ""
    ].filter(Boolean).join("\n");
  } catch (error) {
    console.warn("Não foi possível carregar os dados da versão.", error);
    versionLabel.textContent = "v19";
    detailsLabel.textContent = "Versão local";
    card.title = "Informações da versão indisponíveis";
  }
}

loadAppVersion();
setupEvents();
const rememberedEmail = localStorage.getItem("painel-email");
if (rememberedEmail) {
  els.loginEmail.value = rememberedEmail;
  els.rememberEmail.checked = true;
}
if (!isConfigReady()) {
  showFormError(els.loginError, "Configure o arquivo firebase-config.js para conectar o painel ao Firebase.");
}
if (state.inviteToken) showInviteCard();
onAuthStateChanged(auth, async (user) => {
  if (state.inviteToken && user && !state.inviteRegistrationInProgress) {
    await signOut(auth);
    return;
  }
  if (user) await handleAuthenticated(user);
  else handleSignedOut();
});

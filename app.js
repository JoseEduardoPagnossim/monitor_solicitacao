import {
  initializeApp,
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
  browserSessionPersistence,
  clearAuthSessionStorage,
  getLegalAcceptanceStatus,
  acceptLegalTerms,
  getMfaAssuranceLevel,
  listMfaFactors,
  enrollMfaTotp,
  challengeMfaFactor,
  verifyMfaFactor,
  unenrollMfaFactor,
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
} from "./supabase-compat.js";
import { supabaseConfig } from "./supabase-config.js";
import { securityConfig } from "./security-config.js";
import { legalPolicyConfig } from "./legal-config.js";
import { commitWithRetry, withTimeout } from "./save-flow.js";
import {
  DEFAULT_PROJECTS,
  DEFAULT_KANBAN_COLUMNS,
  STANDARD_FIELD_DEFINITIONS,
  mergeProjects,
  mergeKanbanColumns,
  normalizeProject,
  normalizeKanbanColumn,
  normalizeProjectField,
  projectAllowsCreation,
  projectVisibleToRole,
  projectForRequest,
  firstOpenColumn,
  completedColumnIds,
  pausedColumnIds,
  slugifyIdentifier,
  validateProjectDefinition,
  validateDynamicRequest,
  requestSearchText
} from "./project-system.js";

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

const SQUAD_LABELS = {
  squad_a: "Squad A",
  squad_b: "Squad B",
  squad_d: "Squad D",
  squad_e: "Squad E"
};

const VALID_TYPES = Object.keys(TYPE_LABELS);
const VALID_PRIORITIES = Object.keys(PRIORITY_LABELS);
const VALID_SQUADS = Object.keys(SQUAD_LABELS);
const MAX_CANCELLATION_ITEMS = 50;
const MAX_ATTACHMENTS = 2;
const MAX_IMAGE_SOURCE_SIZE = 5 * 1024 * 1024;
const MAX_STORED_ATTACHMENT_SIZE = 700 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "text/plain"]);
const INVITE_VALID_DAYS = 7;
const VALID_USER_ROLES = ["admin", "solicitante"];
const SESSION_INACTIVITY_MS = 3 * 60 * 60 * 1000;
const SESSION_WARNING_MS = 5 * 60 * 1000;
const AUTO_PAUSE_ALERT_MS = 24 * 60 * 60 * 1000;
const REQUEST_SAVE_TIMEOUT_MS = 20000;
const PASSWORD_POLICY = securityConfig.passwordPolicy || { minLength: 10 };
const SENSITIVE_AUTHORIZATION_MS = Math.max(1, Number(securityConfig.sensitiveAuthorizationMinutes || 10)) * 60 * 1000;
const BACKUP_RETENTION_DAYS = Math.max(1, Number(securityConfig.backupRetentionDays || 7));
const TURNSTILE_SITE_KEY = String(securityConfig.turnstileSiteKey || "").trim();
const CAPTCHA_ENABLED = Boolean(TURNSTILE_SITE_KEY);
const DEFAULT_COMMENT_TEMPLATES = [
  { id: "default-video", title: "Aguardando vídeo", text: "Aguardando o envio do vídeo com o cenário completo para prosseguir com a análise." },
  { id: "default-document", title: "Documento pendente", text: "É necessário enviar o documento ou dado solicitado para que a demanda possa seguir." },
  { id: "default-invalid-cnpj", title: "CNPJ inválido", text: "O CNPJ informado está inválido. Por favor, confirme o número correto para prosseguirmos." },
  { id: "default-analysis", title: "Em análise", text: "Solicitação recebida e encaminhada para análise. Avisaremos quando houver atualização." },
  { id: "default-tef", title: "Dados TEF pendentes", text: "Para prosseguir com o TEF, confirme o número do estabelecimento, o SAK e o modelo do PIN Pad." }
];

const app = initializeApp(supabaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const state = {
  user: null,
  profile: null,
  requests: [],
  projects: mergeProjects([]),
  kanbanColumns: mergeKanbanColumns([]),
  unsubscribeProjects: null,
  unsubscribeKanbanColumns: null,
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
  passwordRecoveryMode: false,
  filters: { search: "", type: "all", priority: "all", squad: "all", requester: "all" },
  draggedId: null,
  modalEditable: true,
  modalCancellationItems: [],
  modalExistingAttachments: [],
  modalNewAttachments: [],
  modalRemovedAttachmentKeys: [],
  modalArchived: false,
  archiveAction: null,
  archivedLoaded: false,
  archivedFilters: { search: "", type: "all", squad: "all" },
  indicatorFilters: { start: "", end: "", type: "all", squad: "all" },
  currentHistory: [],
  unsubscribeHistory: null,
  savedFilters: [],
  commentTemplates: [],
  bulkMode: false,
  bulkSelected: new Set(),
  accessLogs: [],
  deferredInstallPrompt: null,
  sessionWarningTimer: null,
  sessionExpireTimer: null,
  sessionCountdownTimer: null,
  sessionExpiresAt: null,
  lastActivityAt: Date.now(),
  automaticAlertRunning: false,
  requestSaveInProgress: false,
  pendingCreateRequestId: "",
  backupInProgress: false,
  sensitiveAuthorizationUntil: 0,
  sensitiveAuthorizationResolve: null,
  sensitiveAuthorizationReject: null,
  captchaTokens: { login: "", invite: "", reset: "", reauth: "", changePassword: "" },
  captchaWidgetIds: { login: null, invite: null, reset: null, reauth: null, changePassword: null },
  turnstileLoadPromise: null,
  mfaChallengeFactorId: "",
  mfaEnrollmentFactorId: "",
  mfaVerifiedFactorId: "",
  mfaStatusLoaded: false,
  mfaChallengeInProgress: false,
  legalStatus: null,
  legalRequiredMode: false,
  legalDocumentVerified: false,
  legalScrollReached: false,
  legalAcceptanceInProgress: false,
  projectFormFields: [],
  projectSaveInProgress: false,
  columnSaveInProgress: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  authBootstrap: $("#app-bootstrap"),
  loginView: $("#login-view"),
  appView: $("#app-view"),
  loginForm: $("#login-form"),
  loginEmail: $("#login-email"),
  loginPassword: $("#login-password"),
  loginButton: $("#login-button"),
  loginError: $("#login-error"),
  loginCaptcha: $("#login-captcha"),
  rememberEmail: $("#remember-email"),
  togglePassword: $("#toggle-password"),
  termsButton: $("#terms-button"),
  legalTermsDialog: $("#legal-terms-dialog"),
  legalTermsTitle: $("#legal-terms-title"),
  legalTermsVersion: $("#legal-terms-version"),
  legalTermsFrame: $("#legal-terms-frame"),
  legalTermsRequiredActions: $("#legal-terms-required-actions"),
  legalTermsReviewActions: $("#legal-terms-review-actions"),
  legalTermsScrollHint: $("#legal-terms-scroll-hint"),
  legalTermsRead: $("#legal-terms-read"),
  legalTermsConfidentiality: $("#legal-terms-confidentiality"),
  legalTermsMonitoring: $("#legal-terms-monitoring"),
  legalTermsError: $("#legal-terms-error"),
  acceptLegalTermsButton: $("#accept-legal-terms"),
  declineLegalTermsButton: $("#decline-legal-terms"),
  closeLegalTerms: $("#close-legal-terms"),
  closeLegalTermsReview: $("#close-legal-terms-review"),
  forgotPassword: $("#forgot-password"),
  inviteRegistrationForm: $("#invite-registration-form"),
  inviteLoading: $("#invite-loading"),
  inviteRegistrationFields: $("#invite-registration-fields"),
  inviteRegistrationName: $("#invite-registration-name"),
  inviteRegistrationEmail: $("#invite-registration-email"),
  inviteRegistrationRole: $("#invite-registration-role"),
  inviteRegistrationSquadWrap: $("#invite-registration-squad-wrap"),
  inviteRegistrationSquad: $("#invite-registration-squad"),
  inviteRegistrationPassword: $("#invite-registration-password"),
  inviteRegistrationConfirmPassword: $("#invite-registration-confirm-password"),
  inviteRegistrationButton: $("#invite-registration-button"),
  inviteRegistrationError: $("#invite-registration-error"),
  inviteCaptcha: $("#invite-captcha"),
  backToLoginButton: $("#back-to-login-button"),
  logoutButton: $("#logout-button"),
  changePasswordButton: $("#change-password-button"),
  reauthDialog: $("#reauth-dialog"),
  reauthForm: $("#reauth-form"),
  reauthReason: $("#reauth-reason"),
  reauthPassword: $("#reauth-password"),
  reauthCaptcha: $("#reauth-captcha"),
  reauthError: $("#reauth-error"),
  reauthConfirmButton: $("#reauth-confirm-button"),
  backupDialog: $("#backup-dialog"),
  backupForm: $("#backup-form"),
  backupPurpose: $("#backup-purpose"),
  backupAcknowledgement: $("#backup-acknowledgement"),
  backupDialogRetentionDays: $("#backup-dialog-retention-days"),
  backupError: $("#backup-error"),
  confirmBackupButton: $("#confirm-backup-button"),
  mfaEnrollmentDialog: $("#mfa-enrollment-dialog"),
  mfaEnrollmentForm: $("#mfa-enrollment-form"),
  mfaQrCode: $("#mfa-qr-code"),
  mfaSecretCode: $("#mfa-secret-code"),
  mfaEnrollmentCode: $("#mfa-enrollment-code"),
  mfaEnrollmentError: $("#mfa-enrollment-error"),
  verifyMfaEnrollmentButton: $("#verify-mfa-enrollment-button"),
  mfaChallengeDialog: $("#mfa-challenge-dialog"),
  mfaChallengeForm: $("#mfa-challenge-form"),
  mfaChallengeCode: $("#mfa-challenge-code"),
  mfaChallengeError: $("#mfa-challenge-error"),
  verifyMfaChallengeButton: $("#verify-mfa-challenge-button"),
  mfaChallengeLogout: $("#mfa-challenge-logout"),
  changePasswordDialog: $("#change-password-dialog"),
  changePasswordForm: $("#change-password-form"),
  changePasswordEyebrow: $("#change-password-eyebrow"),
  changePasswordTitle: $("#change-password-title"),
  changePasswordHelp: $("#change-password-help"),
  currentPasswordField: $("#current-password-field"),
  changePasswordClose: $("#change-password-close"),
  changePasswordCancel: $("#change-password-cancel"),
  currentPassword: $("#current-password"),
  newPassword: $("#new-password"),
  confirmNewPassword: $("#confirm-new-password"),
  showChangePasswords: $("#show-change-passwords"),
  changePasswordCaptcha: $("#change-password-captcha"),
  changePasswordError: $("#change-password-error"),
  saveNewPasswordButton: $("#save-new-password-button"),
  userName: $("#user-name"),
  userRole: $("#user-role"),
  userAvatar: $("#user-avatar"),
  welcomeMessage: $("#welcome-message"),
  newRequestButton: $("#new-request-button"),
  projectsView: $("#projects-view"),
  columnsView: $("#columns-view"),
  newProjectButton: $("#new-project-button"),
  refreshProjectsButton: $("#refresh-projects-button"),
  projectsTableBody: $("#projects-table-body"),
  projectsEmptyState: $("#projects-empty-state"),
  newColumnButton: $("#new-column-button"),
  refreshColumnsButton: $("#refresh-columns-button"),
  columnsAdminList: $("#columns-admin-list"),
  helpButton: $("#help-button"),
  topHelpButton: $("#top-help-button"),
  notificationButton: $("#notification-button"),
  notificationBadge: $("#notification-badge"),
  notificationPopover: $("#notification-popover"),
  notificationList: $("#notification-list"),
  closeNotificationsButton: $("#close-notifications-button"),
  markAllNotificationsRead: $("#mark-all-notifications-read"),
  themeToggleButton: $("#theme-toggle-button"),
  installAppButton: $("#install-app-button"),
  securityNavButton: $("#security-nav-button"),
  securityView: $("#security-view"),
  downloadBackupButton: $("#download-backup-button"),
  refreshAccessLogsButton: $("#refresh-access-logs-button"),
  accessLogTable: $("#access-log-table"),
  mfaStatusText: $("#mfa-status-text"),
  configureMfaButton: $("#configure-mfa-button"),
  removeMfaButton: $("#remove-mfa-button"),
  backupRetentionDays: $("#backup-retention-days"),
  captchaStatusLine: $("#captcha-status-line"),
  helpDialog: $("#help-dialog"),
  refreshButton: $("#refresh-button"),
  expandKanbanButton: $("#expand-kanban-button"),
  exitKanbanFocusButton: $("#exit-kanban-focus-button"),
  kanbanFocusHeader: $("#kanban-focus-header"),
  metricOpen: $("#metric-open"),
  metricOldest: $("#metric-oldest"),
  metricProgramming: $("#metric-programming"),
  metricDone: $("#metric-done"),
  searchInput: $("#search-input"),
  typeFilter: $("#type-filter"),
  priorityFilter: $("#priority-filter"),
  squadFilter: $("#squad-filter"),
  requesterFilter: $("#requester-filter"),
  clearFilters: $("#clear-filters"),
  savedFilterSelect: $("#saved-filter-select"),
  saveCurrentFilterButton: $("#save-current-filter-button"),
  deleteSavedFilterButton: $("#delete-saved-filter-button"),
  savedFilterDialog: $("#saved-filter-dialog"),
  savedFilterForm: $("#saved-filter-form"),
  savedFilterName: $("#saved-filter-name"),
  savedFilterError: $("#saved-filter-error"),
  confirmSaveFilterButton: $("#confirm-save-filter-button"),
  bulkModeButton: $("#bulk-mode-button"),
  bulkActionsBar: $("#bulk-actions-bar"),
  bulkSelectedCount: $("#bulk-selected-count"),
  bulkStatusSelect: $("#bulk-status-select"),
  bulkAssigneeSelect: $("#bulk-assignee-select"),
  bulkCrmButton: $("#bulk-crm-button"),
  bulkArchiveButton: $("#bulk-archive-button"),
  bulkClearButton: $("#bulk-clear-button"),
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
  userInviteSquadField: $("#user-invite-squad-field"),
  userInviteSquad: $("#user-invite-squad"),
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
  editUserSquadField: $("#edit-user-squad-field"),
  editUserSquad: $("#edit-user-squad"),
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
  indicatorSquadFilter: $("#indicator-squad-filter"),
  indicatorClearFilter: $("#indicator-clear-filter"),
  indicatorCreated: $("#indicator-created"),
  indicatorCompleted: $("#indicator-completed"),
  indicatorAverageTime: $("#indicator-average-time"),
  indicatorBlocked: $("#indicator-blocked"),
  indicatorCompletionRate: $("#indicator-completion-rate"),
  indicatorArchived: $("#indicator-archived"),
  indicatorPausedTime: $("#indicator-paused-time"),
  indicatorVolumeChange: $("#indicator-volume-change"),
  indicatorComparison: $("#indicator-comparison"),
  indicatorTypeTimeBars: $("#indicator-type-time-bars"),
  indicatorStatusBars: $("#indicator-status-bars"),
  indicatorTypeBars: $("#indicator-type-bars"),
  indicatorRequesterTable: $("#indicator-requester-table"),
  refreshArchivedButton: $("#refresh-archived-button"),
  archiveOldRequestsButton: $("#archive-old-requests-button"),
  archivedSearchInput: $("#archived-search-input"),
  archivedTypeFilter: $("#archived-type-filter"),
  archivedSquadFilter: $("#archived-squad-filter"),
  archivedTableBody: $("#archived-table-body"),
  archivedEmptyState: $("#archived-empty-state"),
  projectDialog: $("#project-dialog"),
  projectForm: $("#project-form"),
  projectDialogTitle: $("#project-dialog-title"),
  projectId: $("#project-id"),
  projectName: $("#project-name"),
  projectDescription: $("#project-description"),
  projectAudience: $("#project-audience"),
  projectStatus: $("#project-status"),
  projectOrder: $("#project-order"),
  projectFieldsBuilder: $("#project-fields-builder"),
  projectFormPreview: $("#project-form-preview"),
  projectFormError: $("#project-form-error"),
  addProjectFieldButton: $("#add-project-field-button"),
  saveProjectButton: $("#save-project-button"),
  columnDialog: $("#column-dialog"),
  columnForm: $("#column-form"),
  columnDialogTitle: $("#column-dialog-title"),
  columnId: $("#column-id"),
  columnName: $("#column-name"),
  columnOrder: $("#column-order"),
  columnPausesTimer: $("#column-pauses-timer"),
  columnCompleted: $("#column-completed"),
  columnColor: $("#column-color"),
  columnFormError: $("#column-form-error"),
  saveColumnButton: $("#save-column-button"),
  requestDialog: $("#request-dialog"),
  requestForm: $("#request-form"),
  requestModalTitle: $("#request-modal-title"),
  requestDetailsTab: $("#request-details-tab"),
  requestCommentsTab: $("#request-comments-tab"),
  requestHistoryTab: $("#request-history-tab"),
  requestDetailsPanel: $("#request-details-panel"),
  requestCommentsPanel: $("#request-comments-panel"),
  requestHistoryPanel: $("#request-history-panel"),
  requestHistoryCount: $("#request-history-count"),
  requestHistoryList: $("#request-history-list"),
  requestCommentCount: $("#request-comment-count"),
  requestCommentsList: $("#request-comments-list"),
  commentComposer: $("#comment-composer"),
  requestCommentText: $("#request-comment-text"),
  requestCommentMention: $("#request-comment-mention"),
  commentMentionField: $("#comment-mention-field"),
  requestCommentError: $("#request-comment-error"),
  addRequestCommentButton: $("#add-request-comment-button"),
  commentTemplateSelect: $("#comment-template-select"),
  manageCommentTemplatesButton: $("#manage-comment-templates-button"),
  commentTemplateDialog: $("#comment-template-dialog"),
  commentTemplateForm: $("#comment-template-form"),
  commentTemplateTitle: $("#comment-template-title"),
  commentTemplateText: $("#comment-template-text"),
  commentTemplateError: $("#comment-template-error"),
  addCommentTemplateButton: $("#add-comment-template-button"),
  commentTemplateList: $("#comment-template-list"),
  requestId: $("#request-id"),
  requestType: $("#request-type"),
  requestSquad: $("#request-squad"),
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
  customProjectFields: $("#custom-project-fields"),
  customProjectTitle: $("#custom-project-title"),
  customProjectDescription: $("#custom-project-description"),
  customStandardFields: $("#custom-standard-fields"),
  customFieldsContainer: $("#custom-fields-container"),
  tefCnpj: $("#tef-cnpj"),
  tefClientName: $("#tef-client-name"),
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
  tefUsesPix: $("#tef-uses-pix"),
  tefAdditionalInfoField: $("#tef-additional-info-field"),
  tefAdditionalInfo: $("#tef-additional-info"),
  tefAdditionalInfoCount: $("#tef-additional-info-count"),
  requestStatus: $("#request-status"),
  requestAssignee: $("#request-assignee"),
  requestAudit: $("#request-audit"),
  requestError: $("#request-error"),
  saveRequestButton: $("#save-request-button"),
  copyRequestButton: $("#copy-request-button"),
  archiveRequestButton: $("#archive-request-button"),
  deleteRequestButton: $("#delete-request-button"),
  archiveConfirmDialog: $("#archive-confirm-dialog"),
  sessionWarningDialog: $("#session-warning-dialog"),
  sessionCountdown: $("#session-countdown"),
  continueSessionButton: $("#continue-session-button"),
  logoutSessionButton: $("#logout-session-button"),
  archiveConfirmTitle: $("#archive-confirm-title"),
  archiveConfirmMessage: $("#archive-confirm-message"),
  confirmArchiveButton: $("#confirm-archive-button"),
  deleteConfirmDialog: $("#delete-confirm-dialog"),
  deleteConfirmMessage: $("#delete-confirm-message"),
  confirmDeleteButton: $("#confirm-delete-button"),
  resetDialog: $("#reset-dialog"),
  resetCaptcha: $("#reset-captcha"),
  resetForm: $("#reset-form"),
  resetEmail: $("#reset-email"),
  resetError: $("#reset-error"),
  sidebar: $(".sidebar"),
  mobileMenuButton: $("#mobile-menu-button"),
  toastContainer: $("#toast-container")
};

function isConfigReady() {
  return supabaseConfig.url
    && !supabaseConfig.url.includes("COLE_AQUI")
    && supabaseConfig.anonKey
    && !supabaseConfig.anonKey.includes("COLE_AQUI");
}

function isAdmin() {
  return state.profile?.role === "admin";
}

function isSolicitante() {
  return state.profile?.role === "solicitante";
}

function projectIdForRequest(item = {}) {
  return String(item.projectId || item.type || "programacao");
}

function projectById(projectId) {
  return state.projects.find((project) => project.id === projectId)
    || DEFAULT_PROJECTS.find((project) => project.id === projectId)
    || normalizeProject({ id: projectId, name: projectId || "Projeto", legacyType: "custom" });
}

function projectForItem(item = {}) {
  return projectForRequest(item, state.projects);
}

function projectDefinitionForRequest(item = {}) {
  const project = projectForItem(item);
  const snapshot = item?.projectFormSnapshot && typeof item.projectFormSnapshot === "object"
    ? item.projectFormSnapshot
    : null;
  if (!snapshot) return project;
  return normalizeProject({
    ...project,
    name: snapshot.projectName || project.name,
    standardFields: snapshot.standardFields && typeof snapshot.standardFields === "object"
      ? snapshot.standardFields
      : project.standardFields,
    customFields: Array.isArray(snapshot.customFields) ? snapshot.customFields : project.customFields
  });
}

function projectSnapshotForRequest(item = {}) {
  const project = projectDefinitionForRequest(item);
  return {
    projectName: project.name,
    standardFields: project.standardFields || {},
    customFields: project.customFields || []
  };
}

function projectLabel(itemOrId) {
  const id = typeof itemOrId === "string" ? itemOrId : projectIdForRequest(itemOrId || {});
  return projectById(id).name || TYPE_LABELS[id] || "Solicitação";
}

function projectLegacyType(projectOrId) {
  const project = typeof projectOrId === "string" ? projectById(projectOrId) : normalizeProject(projectOrId || {});
  return project.legacyType || (VALID_TYPES.includes(project.id) ? project.id : "custom");
}

function creatableProjects() {
  const role = state.profile?.role || "solicitante";
  return state.projects.filter((project) => projectAllowsCreation(project, role));
}

function filterableProjects() {
  if (isAdmin()) return [...state.projects];
  const role = state.profile?.role || "solicitante";
  const usedProjectIds = new Set([...state.requests, ...state.archivedRequests].map(projectIdForRequest));
  return state.projects.filter((project) => projectVisibleToRole(project, role) || usedProjectIds.has(project.id));
}

function activeKanbanColumns() {
  return mergeKanbanColumns(state.kanbanColumns).filter((column) => column.active !== false);
}

function columnById(columnId) {
  return mergeKanbanColumns(state.kanbanColumns).find((column) => column.id === columnId)
    || normalizeKanbanColumn({ id: columnId, name: STATUS_LABELS[columnId] || columnId || "Etapa" });
}

function statusLabel(status) {
  return columnById(status).name || STATUS_LABELS[status] || status || "Etapa";
}

function validStatusIds() {
  return activeKanbanColumns().map((column) => column.id);
}

function initialStatusId() {
  return firstOpenColumn(activeKanbanColumns()).id;
}

function isCompletedStatus(status) {
  return completedColumnIds(activeKanbanColumns()).has(status);
}

function isPausedStatus(status) {
  return pausedColumnIds(activeKanbanColumns()).has(status);
}

function completedStatusFallback() {
  return activeKanbanColumns().find((column) => column.completed)?.id || initialStatusId();
}

function projectTagClass(projectId) {
  const legacy = projectLegacyType(projectId);
  return legacy === "custom" ? "custom-project" : legacy;
}

function buildSelectOptions(items, selected = "", emptyLabel = "") {
  const empty = emptyLabel ? `<option value="">${escapeHtml(emptyLabel)}</option>` : "";
  return empty + items.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
}

function canCopyRequest(item) {
  if (!item) return false;
  return isAdmin() || (isSolicitante() && projectLegacyType(projectForItem(item)) === "programacao" && requestIsAccessible(item));
}

function squadVisibilityGroup(squad) {
  if (["squad_a", "squad_b"].includes(squad)) return ["squad_a", "squad_b"];
  if (["squad_d", "squad_e"].includes(squad)) return ["squad_d", "squad_e"];
  return [];
}

function userHasValidSquad(profile = state.profile) {
  return profile?.role === "admin" || VALID_SQUADS.includes(profile?.squad);
}

function canViewSquadProgramming(item) {
  if (!item || !isSolicitante() || projectLegacyType(projectForItem(item)) !== "programacao") return false;
  return squadVisibilityGroup(state.profile?.squad).includes(item.squad);
}

function requestIsParticipant(item) {
  return Boolean(item) && (item.requesterUid === state.user?.uid || item.assigneeUid === state.user?.uid);
}

function canViewProgrammingRequest(item) {
  return canViewSquadProgramming(item);
}

function canCommentOnRequest(item) {
  return Boolean(item) && (isAdmin() || requestIsParticipant(item));
}

function getToastHost() {
  return els.toastContainer;
}

function openToastLayer(host) {
  if (!host || typeof host.showPopover !== "function") return;
  try {
    if (!host.matches(":popover-open")) host.showPopover();
  } catch (error) {
    console.warn("Não foi possível abrir a camada de mensagens.", error);
  }
}

function closeToastLayerWhenEmpty(host) {
  if (!host || host.childElementCount > 0 || typeof host.hidePopover !== "function") return;
  try {
    if (host.matches(":popover-open")) host.hidePopover();
  } catch (error) {
    console.warn("Não foi possível fechar a camada de mensagens.", error);
  }
}

function showToast(message, type = "success") {
  const host = getToastHost();
  if (!host) return;

  openToastLayer(host);

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  host.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
    closeToastLayerWhenEmpty(host);
  }, 4200);
}

function showFormError(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

function setButtonLoading(button, loading, loadingText = "Salvando...") {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = loadingText;
    return;
  }
  button.disabled = false;
  button.innerHTML = button.dataset.originalText || button.innerHTML;
  delete button.dataset.originalText;
}


function passwordPolicyError(password = "") {
  const value = String(password || "");
  const minimum = Math.max(6, Number(PASSWORD_POLICY.minLength || 10));
  const requirements = [];
  if (value.length < minimum) requirements.push(`pelo menos ${minimum} caracteres`);
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(value)) requirements.push("uma letra maiúscula");
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(value)) requirements.push("uma letra minúscula");
  if (PASSWORD_POLICY.requireNumber && !/\d/.test(value)) requirements.push("um número");
  if (PASSWORD_POLICY.requireSymbol && !/[^A-Za-z0-9\s]/.test(value)) requirements.push("um símbolo");
  if (PASSWORD_POLICY.forbidWhitespace && /\s/.test(value)) requirements.push("nenhum espaço em branco");
  return requirements.length ? `A senha deve conter ${requirements.join(", ")}.` : "";
}

function captchaElement(kind) {
  return {
    login: els.loginCaptcha,
    invite: els.inviteCaptcha,
    reset: els.resetCaptcha,
    reauth: els.reauthCaptcha,
    changePassword: els.changePasswordCaptcha
  }[kind] || null;
}

function resetCaptcha(kind) {
  state.captchaTokens[kind] = "";
  const widgetId = state.captchaWidgetIds[kind];
  if (CAPTCHA_ENABLED && widgetId !== null && window.turnstile?.reset) {
    try { window.turnstile.reset(widgetId); } catch (error) { console.warn("Não foi possível reiniciar o CAPTCHA.", error); }
  }
}

function loadTurnstileScript() {
  if (!CAPTCHA_ENABLED) return Promise.resolve(null);
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (state.turnstileLoadPromise) return state.turnstileLoadPromise;

  state.turnstileLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-painel-turnstile="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile), { once: true });
      existing.addEventListener("error", () => reject(new Error("captcha-load-failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.painelTurnstile = "true";
    script.addEventListener("load", () => resolve(window.turnstile), { once: true });
    script.addEventListener("error", () => reject(new Error("captcha-load-failed")), { once: true });
    document.head.appendChild(script);
  });
  return state.turnstileLoadPromise;
}

async function ensureCaptchaWidget(kind) {
  if (!CAPTCHA_ENABLED) return;
  const element = captchaElement(kind);
  if (!element || state.captchaWidgetIds[kind] !== null) return;
  element.hidden = false;
  try {
    const turnstile = await loadTurnstileScript();
    if (!turnstile?.render) throw new Error("captcha-load-failed");
    state.captchaWidgetIds[kind] = turnstile.render(element, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      callback: (token) => { state.captchaTokens[kind] = token || ""; },
      "expired-callback": () => { state.captchaTokens[kind] = ""; },
      "error-callback": () => { state.captchaTokens[kind] = ""; }
    });
  } catch (error) {
    console.error(error);
    element.textContent = "Não foi possível carregar a verificação de segurança.";
  }
}

function requireCaptchaToken(kind, errorElement) {
  if (!CAPTCHA_ENABLED) return "";
  const token = state.captchaTokens[kind] || "";
  if (!token) showFormError(errorElement, "Conclua a verificação de segurança antes de continuar.");
  return token;
}

function updateSecurityControlStatus() {
  if (els.backupRetentionDays) els.backupRetentionDays.textContent = `${BACKUP_RETENTION_DAYS} dias`;
  if (els.backupDialogRetentionDays) els.backupDialogRetentionDays.textContent = `${BACKUP_RETENTION_DAYS} dias`;
  if (els.captchaStatusLine) {
    els.captchaStatusLine.innerHTML = CAPTCHA_ENABLED
      ? '<span class="security-control-ok">✓</span> CAPTCHA configurado para autenticação e confirmações de identidade.'
      : '<span class="security-control-info">i</span> CAPTCHA opcional ainda não configurado.';
  }
}

function runPostSaveTasks(tasks = []) {
  const validTasks = tasks.filter(Boolean);
  if (!validTasks.length) return;

  Promise.allSettled(validTasks).then((results) => {
    results.forEach((result) => {
      if (result.status === "rejected") {
        console.warn("Uma rotina complementar do salvamento não foi concluída.", result.reason);
      }
    });
  });
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

async function openStoredAttachment(attachment, button = null) {
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
    const safeExternalUrl = normalizeUrl(attachment.url);
    const openControl = attachment.storage === "firestore" && attachment.id
      ? `<button class="attachment-open-link" type="button" data-attachment-id="${escapeHtml(attachment.id)}">${escapeHtml(attachment.name)}</button>`
      : safeExternalUrl
        ? `<a href="${escapeHtml(safeExternalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(attachment.name)}</a>`
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
        <small>${formatFileSize(file.size)} · pronto para salvar no Supabase</small>
      </div>
      ${state.modalEditable ? `<button class="icon-button remove-attachment" type="button" data-attachment-source="new" data-attachment-index="${index}" title="Remover anexo" aria-label="Remover anexo">×</button>` : ""}
    </div>`).join("");

  els.attachmentList.innerHTML = existingHtml || pendingHtml
    ? `${existingHtml}${pendingHtml}<div class="attachment-counter">${totalModalAttachments()} de ${MAX_ATTACHMENTS} anexos</div>`
    : `<div class="attachment-empty">Nenhum anexo selecionado.</div>`;

  $$(".attachment-open-link", els.attachmentList).forEach((button) => {
    button.addEventListener("click", () => {
      const attachment = retainedExisting.find((item) => item.id === button.dataset.attachmentId);
      openStoredAttachment(attachment, button);
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
  const cleanName = String(fileName || "anexo")
    .replace(/[\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 170);
  const base = cleanName.replace(/\.[^.]+$/, "") || "anexo";
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
        return { name: replaceExtension(file.name, "png"), contentType: "image/png", size: pngBlob.size, blob: pngBlob, originalSize: file.size };
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
          name: replaceExtension(file.name, "jpg"),
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

async function detectedAttachmentContentType(file) {
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, MAX_STORED_ATTACHMENT_SIZE + 1)).arrayBuffer());
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (isJpeg) return "image/jpeg";
  if (isPng) return "image/png";

  if (bytes.includes(0)) return "";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "text/plain";
  } catch {
    return "";
  }
}

async function prepareAttachment(file) {
  const declaredType = normalizedAttachmentType(file);
  const detectedType = await detectedAttachmentContentType(file);
  if (!detectedType || declaredType !== detectedType) throw new Error("attachment-invalid-content");
  if (detectedType === "text/plain") {
    if (file.size > MAX_STORED_ATTACHMENT_SIZE) throw new Error("attachment-too-large");
    return { name: replaceExtension(file.name, "txt"), contentType: detectedType, size: file.size, blob: file, originalSize: file.size };
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
          : error.message === "attachment-invalid-content"
            ? `O conteúdo de “${file.name}” não corresponde ao formato informado ou não é seguro.`
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
    if (!attachment.firestoreId) attachment.firestoreId = doc(collection(db, "requestAttachments")).id;
    const attachmentReference = doc(db, "requestAttachments", attachment.firestoreId);
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
  if (error?.code === "operation-timeout" && error?.stage === "preparação dos anexos") {
    return "A preparação dos anexos demorou além do esperado. Remova o arquivo, selecione-o novamente e tente salvar.";
  }

  const messages = {
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/user-disabled": "Este usuário está desativado.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/missing-password": "Informe sua senha.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta no Supabase.",
    "auth/weak-password": "A senha não atende à política de segurança configurada.",
    "auth/wrong-password": "A senha atual está incorreta.",
    "auth/requires-recent-login": "Confirme novamente sua senha atual para continuar.",
    "invite-invalid": "Este convite não existe ou não está mais disponível.",
    "invite-expired": "Este convite expirou. Solicite um novo link ao administrador.",
    "permission-denied": "Você não possui permissão para executar esta ação.",
    "resource-exhausted": "O limite gratuito do serviço foi atingido. Tente novamente mais tarde.",
    "failed-precondition": "A operação não pôde ser concluída com a configuração atual do Supabase.",
    "unavailable": "O Supabase está temporariamente indisponível. Verifique a conexão e tente novamente.",
    "deadline-exceeded": "O Supabase demorou além do limite para responder. Tente novamente.",
    "aborted": "A gravação foi interrompida. Tente novamente.",
    "operation-timeout": "O Supabase demorou além do esperado para confirmar o salvamento. Verifique sua conexão e tente novamente; o formulário foi mantido aberto.",
    "auth/email-not-confirmed": "Confirme o e-mail antes de entrar ou desative a confirmação de e-mail no Supabase para este painel interno.",
    "auth/email-confirmation-required": "Desative a opção Confirm email no Supabase antes de usar os convites internos.",
    "legal-document-not-configured": "A política de uso ainda não foi configurada no Supabase.",
    "legal-document-outdated": "A política foi atualizada. Recarregue a página e leia a versão vigente.",
    "mfa-required": "Conclua a autenticação em duas etapas antes de aceitar o termo."
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
  if (els.bulkAssigneeSelect) els.bulkAssigneeSelect.innerHTML = `<option value="">Definir responsável...</option>${activeUsers}`;
}

function populateRequesterFilterForViewer() {
  if (isAdmin()) return;
  const selected = state.filters.requester || "all";
  const requesters = new Map();
  state.requests.forEach((item) => {
    if (!item.requesterUid) return;
    requesters.set(item.requesterUid, item.requesterName || item.requesterEmail || "Usuário");
  });
  const options = [...requesters.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
    .map(([uid, name]) => `<option value="${escapeHtml(uid)}">${escapeHtml(name)}</option>`)
    .join("");
  els.requesterFilter.innerHTML = `<option value="all">Todos os solicitantes</option>${options}`;
  if (selected !== "all" && requesters.has(selected)) {
    els.requesterFilter.value = selected;
  } else {
    state.filters.requester = "all";
    els.requesterFilter.value = "all";
  }
}

function populateProjectAndColumnControls() {
  const allProjects = filterableProjects();
  const currentTypeFilter = state.filters.type || "all";
  const currentArchivedType = state.archivedFilters.type || "all";
  const currentIndicatorType = state.indicatorFilters.type || "all";
  const currentRequestProject = els.requestType?.value || "";

  const filterOptions = allProjects
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"))
    .map((project) => {
      const suffix = project.status === "archived" ? " (arquivado)" : project.status === "draft" ? " (rascunho)" : "";
      return `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name + suffix)}</option>`;
    })
    .join("");
  if (els.typeFilter) els.typeFilter.innerHTML = `<option value="all">Todos os projetos</option>${filterOptions}`;
  if (els.archivedTypeFilter) els.archivedTypeFilter.innerHTML = `<option value="all">Todos os projetos</option>${filterOptions}`;
  if (els.indicatorTypeFilter) els.indicatorTypeFilter.innerHTML = `<option value="all">Todos os projetos</option>${filterOptions}`;

  if (els.typeFilter) els.typeFilter.value = allProjects.some((project) => project.id === currentTypeFilter) ? currentTypeFilter : "all";
  if (els.archivedTypeFilter) els.archivedTypeFilter.value = allProjects.some((project) => project.id === currentArchivedType) ? currentArchivedType : "all";
  if (els.indicatorTypeFilter) els.indicatorTypeFilter.value = allProjects.some((project) => project.id === currentIndicatorType) ? currentIndicatorType : "all";

  const requestProjects = creatableProjects();
  if (els.requestType) {
    els.requestType.innerHTML = `<option value="">Selecione o projeto</option>${requestProjects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("")}`;
    if (requestProjects.some((project) => project.id === currentRequestProject)) els.requestType.value = currentRequestProject;
  }

  const columns = activeKanbanColumns();
  const statusOptions = columns.map((column) => `<option value="${escapeHtml(column.id)}">${escapeHtml(column.name)}</option>`).join("");
  const currentRequestStatus = els.requestStatus?.value || initialStatusId();
  if (els.requestStatus) {
    els.requestStatus.innerHTML = statusOptions;
    els.requestStatus.value = columns.some((column) => column.id === currentRequestStatus) ? currentRequestStatus : initialStatusId();
  }
  const currentBulkStatus = els.bulkStatusSelect?.value || "";
  if (els.bulkStatusSelect) {
    els.bulkStatusSelect.innerHTML = `<option value="">Alterar coluna...</option>${statusOptions}`;
    els.bulkStatusSelect.value = columns.some((column) => column.id === currentBulkStatus) ? currentBulkStatus : "";
  }
}

function renderKanbanStructure() {
  const columns = activeKanbanColumns();
  els.kanbanBoard.style.setProperty("--kanban-column-count", String(Math.max(1, columns.length)));
  els.kanbanBoard.innerHTML = columns.map((column) => `
    <div class="kanban-column column-${escapeHtml(column.color)}" data-status="${escapeHtml(column.id)}">
      <header>
        <div><span class="status-dot ${escapeHtml(column.color)}"></span><h2>${escapeHtml(column.name)}</h2>${column.pausesTimer ? '<span class="column-rule-badge">⏸ pausa</span>' : ''}${column.completed ? '<span class="column-rule-badge done">✓ conclusão</span>' : ''}</div>
        <div class="column-header-actions"><label class="bulk-column-select" data-bulk-column-wrapper="${escapeHtml(column.id)}" hidden title="Selecionar todos os cards visíveis desta coluna"><input type="checkbox" data-bulk-column="${escapeHtml(column.id)}"><span>Todos</span></label><span class="column-count" data-count="${escapeHtml(column.id)}">0</span></div>
      </header>
      <div class="column-body" data-dropzone="${escapeHtml(column.id)}"></div>
    </div>`).join("");
  $$('[data-bulk-column]', els.kanbanBoard).forEach((input) => {
    input.addEventListener("change", () => setBulkColumnSelection(input.dataset.bulkColumn, input.checked));
  });
  setupDropzones();
}

function normalizeProjectDocuments(snapshot) {
  return snapshot.docs.map((documentSnapshot) => normalizeProject({ id: documentSnapshot.id, ...documentSnapshot.data() }));
}

function normalizeColumnDocuments(snapshot) {
  return snapshot.docs.map((documentSnapshot, index) => normalizeKanbanColumn({ id: documentSnapshot.id, ...documentSnapshot.data() }, index));
}

function refreshProjectConfigurationUi() {
  state.projects = mergeProjects(state.projects);
  state.kanbanColumns = mergeKanbanColumns(state.kanbanColumns);
  populateProjectAndColumnControls();
  renderKanbanStructure();
  if (isAdmin()) {
    renderProjectsAdmin();
    renderColumnsAdmin();
  }
  renderAll();
}

function subscribeProjectConfiguration() {
  if (state.unsubscribeProjects) state.unsubscribeProjects();
  if (state.unsubscribeKanbanColumns) state.unsubscribeKanbanColumns();

  state.unsubscribeProjects = onSnapshot(collection(db, "requestProjects"), (snapshot) => {
    state.projects = mergeProjects(normalizeProjectDocuments(snapshot));
    populateProjectAndColumnControls();
    if (isAdmin()) renderProjectsAdmin();
    renderAll();
  }, (error) => {
    console.error("Falha ao carregar projetos.", error);
    state.projects = mergeProjects([]);
    populateProjectAndColumnControls();
    renderAll();
  });

  state.unsubscribeKanbanColumns = onSnapshot(collection(db, "kanbanColumns"), (snapshot) => {
    state.kanbanColumns = mergeKanbanColumns(normalizeColumnDocuments(snapshot));
    populateProjectAndColumnControls();
    renderKanbanStructure();
    if (isAdmin()) renderColumnsAdmin();
    renderAll();
  }, (error) => {
    console.error("Falha ao carregar colunas.", error);
    state.kanbanColumns = mergeKanbanColumns([]);
    populateProjectAndColumnControls();
    renderKanbanStructure();
    renderAll();
  });
}

async function reloadProjectConfiguration() {
  const [projectSnapshot, columnSnapshot] = await Promise.all([
    getDocs(collection(db, "requestProjects")),
    getDocs(collection(db, "kanbanColumns"))
  ]);
  state.projects = mergeProjects(normalizeProjectDocuments(projectSnapshot));
  state.kanbanColumns = mergeKanbanColumns(normalizeColumnDocuments(columnSnapshot));
  refreshProjectConfigurationUi();
}

function audienceLabel(audience) {
  if (audience === "admin") return "Somente administradores";
  if (audience === "solicitante") return "Somente solicitantes";
  return "Todos os perfis";
}

function projectStatusLabel(status) {
  return status === "draft" ? "Rascunho" : status === "archived" ? "Arquivado" : "Publicado";
}

function renderProjectsAdmin() {
  if (!isAdmin() || !els.projectsTableBody) return;
  const projects = [...state.projects].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
  els.projectsTableBody.innerHTML = projects.map((project) => {
    const count = [...state.requests, ...state.archivedRequests].filter((item) => projectIdForRequest(item) === project.id).length;
    const fieldCount = Object.values(project.standardFields || {}).filter((config) => config?.enabled).length
      + project.customFields.filter((field) => field.active !== false).length;
    const statusClass = project.status === "published" ? "active" : project.status === "draft" ? "pending" : "inactive";
    return `<tr>
      <td><div class="config-item-title"><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.description || (project.legacyType === "custom" ? "Formulário configurável" : "Projeto padrão do sistema"))}</small></div></td>
      <td>${escapeHtml(audienceLabel(project.audience))}</td>
      <td>${fieldCount} campo${fieldCount === 1 ? "" : "s"}</td>
      <td><span class="user-status-badge ${statusClass}">● ${escapeHtml(projectStatusLabel(project.status))}</span></td>
      <td>${count}</td>
      <td><div class="config-actions"><button class="user-action-button primary" type="button" data-project-action="edit" data-project-id="${escapeHtml(project.id)}">Editar</button>${project.status !== "archived" ? `<button class="user-action-button danger" type="button" data-project-action="archive" data-project-id="${escapeHtml(project.id)}">Arquivar</button>` : `<button class="user-action-button success" type="button" data-project-action="publish" data-project-id="${escapeHtml(project.id)}">Reativar</button>`}</div></td>
    </tr>`;
  }).join("");
  els.projectsEmptyState.hidden = projects.length > 0;
}

function projectFieldBuilderRow(field, index) {
  return `<article class="project-field-builder-row" data-project-field-row="${escapeHtml(field.id)}">
    <div class="project-field-number">${index + 1}</div>
    <label class="field"><span>Nome do campo *</span><input type="text" maxlength="100" data-project-field-label value="${escapeHtml(field.label || "")}" placeholder="Ex.: Motivo da solicitação" required></label>
    <label class="field form-span-2"><span>Texto de orientação (placeholder)</span><textarea rows="3" maxlength="1000" data-project-field-placeholder placeholder="Descreva o que o solicitante deve informar.">${escapeHtml(field.placeholder || "")}</textarea></label>
    <label class="config-checkbox compact"><input type="checkbox" data-project-field-required ${field.required ? "checked" : ""}><span><strong>Obrigatório</strong><small>Impede o envio sem resposta.</small></span></label>
    <div class="field-row-actions"><button class="button button-secondary compact-button" type="button" data-project-field-move="up" title="Mover para cima">↑</button><button class="button button-secondary compact-button" type="button" data-project-field-move="down" title="Mover para baixo">↓</button><button class="button button-danger compact-button" type="button" data-project-field-remove>Remover</button></div>
  </article>`;
}

function readProjectFieldBuilder() {
  return $$('[data-project-field-row]', els.projectFieldsBuilder).map((row, index) => normalizeProjectField({
    id: row.dataset.projectFieldRow,
    label: $('[data-project-field-label]', row)?.value || "",
    placeholder: $('[data-project-field-placeholder]', row)?.value || "",
    required: $('[data-project-field-required]', row)?.checked === true,
    active: true,
    type: "long_text",
    maxLength: 1000,
    order: (index + 1) * 10
  }, index));
}

function renderProjectFieldsBuilder() {
  els.projectFieldsBuilder.innerHTML = state.projectFormFields.length
    ? state.projectFormFields.map(projectFieldBuilderRow).join("")
    : `<div class="config-builder-empty">Nenhum campo personalizado. Use “Adicionar campo” para criar uma caixa de até 1.000 caracteres.</div>`;
  updateProjectFormPreview();
}

function readStandardFieldConfiguration() {
  const config = {};
  Object.keys(STANDARD_FIELD_DEFINITIONS).forEach((key) => {
    const enabled = $(`[data-project-standard-enabled="${CSS.escape(key)}"]`)?.checked === true;
    const requiredInput = $(`[data-project-standard-required="${CSS.escape(key)}"]`);
    const required = enabled && requiredInput?.checked === true;
    config[key] = { enabled, required };
  });
  return config;
}

function syncStandardRequiredControls() {
  Object.keys(STANDARD_FIELD_DEFINITIONS).forEach((key) => {
    const enabled = $(`[data-project-standard-enabled="${CSS.escape(key)}"]`);
    const required = $(`[data-project-standard-required="${CSS.escape(key)}"]`);
    if (!enabled || !required) return;
    required.disabled = !enabled.checked;
    if (!enabled.checked) required.checked = false;
  });
  updateProjectFormPreview();
}

function updateProjectFormPreview() {
  if (!els.projectFormPreview) return;
  const standard = readStandardFieldConfiguration();
  const customFields = readProjectFieldBuilder();
  const standardHtml = Object.entries(STANDARD_FIELD_DEFINITIONS).map(([key, definition]) => {
    const config = standard[key];
    if (!config?.enabled) return "";
    return `<label class="field"><span>${escapeHtml(definition.label)}${config.required ? " *" : ""}</span><input type="text" disabled placeholder="${escapeHtml(definition.label)}"></label>`;
  }).join("");
  const customHtml = customFields.map((field) => `<label class="field form-span-2"><span>${escapeHtml(field.label || "Campo sem nome")}${field.required ? " *" : ""}</span><textarea rows="3" disabled placeholder="${escapeHtml(field.placeholder || "Digite as informações solicitadas.")}"></textarea></label>`).join("");
  els.projectFormPreview.innerHTML = standardHtml || customHtml
    ? `<div class="form-grid nested-grid">${standardHtml}${customHtml}</div>`
    : `<div class="config-builder-empty">Marque campos padrão ou adicione campos personalizados para visualizar o formulário.</div>`;
}

function openProjectDialog(projectId = "") {
  if (!isAdmin()) return;
  const existing = state.projects.find((project) => project.id === projectId);
  els.projectForm.reset();
  showFormError(els.projectFormError);
  els.projectId.value = existing?.id || "";
  els.projectDialogTitle.textContent = existing ? `Editar ${existing.name}` : "Novo projeto";
  els.projectName.value = existing?.name || "";
  els.projectDescription.value = existing?.description || "";
  els.projectAudience.value = existing?.audience || "all";
  els.projectStatus.value = existing?.status || "published";
  els.projectOrder.value = String(existing?.order || Math.max(100, ...state.projects.map((project) => Number(project.order || 0) + 10)));
  Object.keys(STANDARD_FIELD_DEFINITIONS).forEach((key) => {
    const enabled = $(`[data-project-standard-enabled="${CSS.escape(key)}"]`);
    const required = $(`[data-project-standard-required="${CSS.escape(key)}"]`);
    if (enabled) enabled.checked = existing?.standardFields?.[key]?.enabled === true;
    if (required) required.checked = existing?.standardFields?.[key]?.required === true;
  });
  state.projectFormFields = (existing?.customFields || []).filter((field) => field.active !== false).map((field, index) => normalizeProjectField(field, index));
  const isLegacy = existing && existing.legacyType !== "custom";
  $$('[data-project-standard-enabled], [data-project-standard-required]', els.projectDialog).forEach((input) => { input.disabled = Boolean(isLegacy); });
  els.addProjectFieldButton.disabled = Boolean(isLegacy);
  els.projectFieldsBuilder.dataset.locked = isLegacy ? "true" : "false";
  renderProjectFieldsBuilder();
  syncStandardRequiredControls();
  if (!els.projectDialog.open) els.projectDialog.showModal();
  window.setTimeout(() => els.projectName.focus(), 50);
}

function addProjectField() {
  if (els.projectFieldsBuilder.dataset.locked === "true") return;
  const id = `${slugifyIdentifier("campo", "field")}_${crypto.randomUUID().slice(0, 8)}`;
  state.projectFormFields = [...readProjectFieldBuilder(), normalizeProjectField({ id, label: "", placeholder: "", required: false, order: (state.projectFormFields.length + 1) * 10 })];
  renderProjectFieldsBuilder();
  window.setTimeout(() => $$('[data-project-field-label]', els.projectFieldsBuilder).at(-1)?.focus(), 0);
}

function handleProjectFieldBuilderClick(event) {
  const row = event.target.closest('[data-project-field-row]');
  if (!row || els.projectFieldsBuilder.dataset.locked === "true") return;
  const fields = readProjectFieldBuilder();
  const index = fields.findIndex((field) => field.id === row.dataset.projectFieldRow);
  if (index < 0) return;
  if (event.target.closest('[data-project-field-remove]')) fields.splice(index, 1);
  const direction = event.target.closest('[data-project-field-move]')?.dataset.projectFieldMove;
  if (direction === "up" && index > 0) [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
  if (direction === "down" && index < fields.length - 1) [fields[index + 1], fields[index]] = [fields[index], fields[index + 1]];
  state.projectFormFields = fields;
  renderProjectFieldsBuilder();
}

async function saveProjectDefinition(event) {
  event.preventDefault();
  if (!isAdmin() || state.projectSaveInProgress) return;
  showFormError(els.projectFormError);
  const existing = state.projects.find((project) => project.id === els.projectId.value);
  const baseId = existing?.id || slugifyIdentifier(els.projectName.value, "project");
  const projectId = existing?.id || `${baseId}_${crypto.randomUUID().slice(0, 8)}`;
  const legacyType = existing?.legacyType || "custom";
  const definition = {
    id: projectId,
    name: sanitizeText(els.projectName.value),
    description: sanitizeText(els.projectDescription.value),
    audience: els.projectAudience.value,
    status: els.projectStatus.value,
    active: els.projectStatus.value !== "archived",
    order: Number(els.projectOrder.value || 100),
    legacyType,
    standardFields: legacyType === "custom" ? readStandardFieldConfiguration() : existing?.standardFields || {},
    customFields: legacyType === "custom" ? readProjectFieldBuilder() : existing?.customFields || [],
    createdAt: existing?.createdAt || serverTimestamp(),
    createdByUid: existing?.createdByUid || state.user.uid,
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid
  };
  const validation = validateProjectDefinition(definition);
  if (!validation.valid) {
    showFormError(els.projectFormError, validation.errors[0]);
    return;
  }
  state.projectSaveInProgress = true;
  setButtonLoading(els.saveProjectButton, true, "Salvando...");
  try {
    const reference = doc(db, "requestProjects", projectId);
    if (existing) await updateDoc(reference, definition); else await setDoc(reference, definition);
    await logAccessEvent(existing ? "project_updated" : "project_created", `${definition.name} (${projectId}).`);
    closeModal(els.projectDialog);
    showToast(existing ? "Projeto atualizado com sucesso." : definition.status === "published" ? "Projeto criado e publicado com sucesso." : "Projeto salvo como rascunho.");
  } catch (error) {
    console.error(error);
    showFormError(els.projectFormError, firebaseErrorMessage(error));
  } finally {
    state.projectSaveInProgress = false;
    setButtonLoading(els.saveProjectButton, false);
  }
}

async function setProjectStatus(projectId, status) {
  if (!isAdmin()) return;
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) return;
  if (!window.confirm(`${status === "archived" ? "Arquivar" : "Reativar"} o projeto “${project.name}”?`)) return;
  try {
    await updateDoc(doc(db, "requestProjects", project.id), { status, active: status !== "archived", updatedAt: serverTimestamp(), updatedByUid: state.user.uid });
    await logAccessEvent(status === "archived" ? "project_archived" : "project_published", project.name);
    showToast(status === "archived" ? "Projeto arquivado. As solicitações antigas foram preservadas." : "Projeto reativado.");
  } catch (error) { showToast(firebaseErrorMessage(error), "error"); }
}

function handleProjectsTableClick(event) {
  const button = event.target.closest('[data-project-action]');
  if (!button) return;
  const action = button.dataset.projectAction;
  const projectId = button.dataset.projectId;
  if (action === "edit") openProjectDialog(projectId);
  if (action === "archive") setProjectStatus(projectId, "archived");
  if (action === "publish") setProjectStatus(projectId, "published");
}

function renderColumnsAdmin() {
  if (!isAdmin() || !els.columnsAdminList) return;
  const columns = mergeKanbanColumns(state.kanbanColumns);
  const activeColumns = columns.filter((column) => column.active !== false);
  els.columnsAdminList.innerHTML = columns.map((column) => {
    const index = activeColumns.findIndex((entry) => entry.id === column.id);
    const activeCount = state.requests.filter((item) => item.status === column.id).length;
    const archivedCount = state.archivedRequests.filter((item) => item.status === column.id).length;
    const count = activeCount + archivedCount;
    const inactive = column.active === false;
    return `<article class="column-admin-card${inactive ? " archived" : ""}" data-column-admin-id="${escapeHtml(column.id)}">
      <div class="column-admin-order"><strong>${inactive ? "—" : index + 1}</strong><div>${inactive ? "" : `<button type="button" data-column-action="up" data-column-id="${escapeHtml(column.id)}" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-column-action="down" data-column-id="${escapeHtml(column.id)}" ${index === activeColumns.length - 1 ? "disabled" : ""}>↓</button>`}</div></div>
      <span class="status-dot ${escapeHtml(column.color)}"></span>
      <div class="column-admin-copy"><strong>${escapeHtml(column.name)}</strong><span>${count} solicitação${count === 1 ? "" : "ões"} · ${inactive ? "arquivada" : `posição ${column.order}`}</span><div class="column-admin-rules">${column.pausesTimer ? '<span>⏸ Pausa o tempo</span>' : '<span>◷ Conta o tempo</span>'}${column.completed ? '<span>✓ Conclusão</span>' : ''}${inactive ? '<span>◌ Fora do Kanban</span>' : ''}</div></div>
      <div class="config-actions"><button class="user-action-button primary" type="button" data-column-action="edit" data-column-id="${escapeHtml(column.id)}">Editar</button>${inactive ? `<button class="user-action-button success" type="button" data-column-action="reactivate" data-column-id="${escapeHtml(column.id)}">Reativar</button>` : `<button class="user-action-button danger" type="button" data-column-action="archive" data-column-id="${escapeHtml(column.id)}" ${activeCount ? 'disabled title="Mova as solicitações ativas antes de arquivar"' : ''}>Arquivar</button>`}</div>
    </article>`;
  }).join("");
}

function openColumnDialog(columnId = "") {
  if (!isAdmin()) return;
  const existing = mergeKanbanColumns(state.kanbanColumns).find((column) => column.id === columnId);
  els.columnForm.reset();
  showFormError(els.columnFormError);
  els.columnId.value = existing?.id || "";
  els.columnDialogTitle.textContent = existing ? `Editar ${existing.name}` : "Nova coluna";
  els.columnName.value = existing?.name || "";
  els.columnOrder.value = String(existing?.order || (Math.max(0, ...activeKanbanColumns().map((column) => Number(column.order || 0))) + 10));
  els.columnPausesTimer.checked = existing?.pausesTimer === true;
  els.columnCompleted.checked = existing?.completed === true;
  els.columnColor.value = existing?.color || "blue";
  if (!els.columnDialog.open) els.columnDialog.showModal();
  window.setTimeout(() => els.columnName.focus(), 50);
}

async function saveKanbanColumn(event) {
  event.preventDefault();
  if (!isAdmin() || state.columnSaveInProgress) return;
  showFormError(els.columnFormError);
  const existing = mergeKanbanColumns(state.kanbanColumns).find((column) => column.id === els.columnId.value);
  const name = sanitizeText(els.columnName.value);
  if (name.length < 2) return showFormError(els.columnFormError, "Informe um nome de coluna com pelo menos 2 caracteres.");
  const otherOpenColumns = activeKanbanColumns().filter((column) => column.id !== existing?.id && !column.completed);
  if (els.columnCompleted.checked && !otherOpenColumns.length) {
    return showFormError(els.columnFormError, "Mantenha ao menos uma coluna ativa que não represente conclusão.");
  }
  const columnId = existing?.id || `${slugifyIdentifier(name, "column")}_${crypto.randomUUID().slice(0, 8)}`;
  const column = {
    id: columnId,
    name,
    order: Number(els.columnOrder.value || 100),
    pausesTimer: els.columnPausesTimer.checked,
    completed: els.columnCompleted.checked,
    color: els.columnColor.value,
    active: existing?.active !== false,
    createdAt: existing?.createdAt || serverTimestamp(),
    createdByUid: existing?.createdByUid || state.user.uid,
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid
  };
  state.columnSaveInProgress = true;
  setButtonLoading(els.saveColumnButton, true, "Salvando...");
  try {
    const reference = doc(db, "kanbanColumns", columnId);
    if (existing) await updateDoc(reference, column); else await setDoc(reference, column);
    await logAccessEvent(existing ? "kanban_column_updated" : "kanban_column_created", `${name} (${columnId}).`);
    closeModal(els.columnDialog);
    showToast(existing ? "Coluna atualizada." : "Nova coluna criada no Kanban.");
  } catch (error) {
    console.error(error);
    showFormError(els.columnFormError, firebaseErrorMessage(error));
  } finally {
    state.columnSaveInProgress = false;
    setButtonLoading(els.saveColumnButton, false);
  }
}

async function reorderKanbanColumn(columnId, direction) {
  const columns = activeKanbanColumns();
  const index = columns.findIndex((column) => column.id === columnId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= columns.length) return;
  const current = columns[index];
  const target = columns[targetIndex];
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "kanbanColumns", current.id), { order: target.order, updatedAt: serverTimestamp(), updatedByUid: state.user.uid });
    batch.update(doc(db, "kanbanColumns", target.id), { order: current.order, updatedAt: serverTimestamp(), updatedByUid: state.user.uid });
    await batch.commit();
    await logAccessEvent("kanban_columns_reordered", `${current.name} movida ${direction === "up" ? "para cima" : "para baixo"}.`);
  } catch (error) { showToast(firebaseErrorMessage(error), "error"); }
}

async function setKanbanColumnActive(columnId, active) {
  const column = mergeKanbanColumns(state.kanbanColumns).find((entry) => entry.id === columnId);
  if (!column) return;
  const activeCount = state.requests.filter((item) => item.status === column.id).length;
  if (!active && activeCount) return showToast("Mova todas as solicitações ativas desta coluna antes de arquivá-la.", "warning");
  if (!active && activeKanbanColumns().length <= 1) return showToast("O Kanban precisa manter ao menos uma coluna ativa.", "warning");
  if (!active && !column.completed && activeKanbanColumns().filter((entry) => entry.id !== column.id && !entry.completed).length === 0) {
    return showToast("O Kanban precisa manter ao menos uma coluna aberta para receber novas solicitações.", "warning");
  }
  if (!window.confirm(`${active ? "Reativar" : "Arquivar"} a coluna “${column.name}”?`)) return;
  try {
    await updateDoc(doc(db, "kanbanColumns", column.id), {
      active,
      archivedAt: active ? null : serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    });
    await logAccessEvent(active ? "kanban_column_reactivated" : "kanban_column_archived", column.name);
    showToast(active ? "Coluna reativada no Kanban." : "Coluna arquivada.");
  } catch (error) { showToast(firebaseErrorMessage(error), "error"); }
}

function handleColumnsAdminClick(event) {
  const button = event.target.closest('[data-column-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.columnAction;
  const columnId = button.dataset.columnId;
  if (action === "edit") openColumnDialog(columnId);
  if (action === "archive") setKanbanColumnActive(columnId, false);
  if (action === "reactivate") setKanbanColumnActive(columnId, true);
  if (["up", "down"].includes(action)) reorderKanbanColumn(columnId, action);
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
      checkAutomaticAlerts();
      if (state.currentView === "indicators") renderIndicators();
    }, (error) => {
      console.error(error);
      showToast(firebaseErrorMessage(error), "error");
    });
    return;
  }

  const allowedProgrammingSquads = squadVisibilityGroup(state.profile?.squad);
  const sourceMaps = { requester: new Map(), assignee: new Map() };
  allowedProgrammingSquads.forEach((squad) => { sourceMaps[`programming_${squad}`] = new Map(); });

  const sync = () => {
    const merged = new Map();
    Object.values(sourceMaps).forEach((source) => {
      source.forEach((value, key) => merged.set(key, value));
    });
    state.requests = [...merged.values()];
    populateRequesterFilterForViewer();
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

  const unsubscribers = [
    onSnapshot(query(base, where("requesterUid", "==", state.user.uid)), handleSnapshot("requester"), handleError),
    onSnapshot(query(base, where("assigneeUid", "==", state.user.uid)), handleSnapshot("assignee"), handleError)
  ];

  allowedProgrammingSquads.forEach((squad) => {
    const source = `programming_${squad}`;
    unsubscribers.push(onSnapshot(
      query(base, where("type", "==", "programacao"), where("squad", "==", squad)),
      handleSnapshot(source),
      handleError
    ));
  });

  state.unsubscribeRequests = () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

function requestIsAccessible(item) {
  return Boolean(item) && (isAdmin() || requestIsParticipant(item) || canViewProgrammingRequest(item));
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

  if (projectLegacyType(projectForItem(item)) === "cancelamento") {
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
      item.tefClientName,
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
      item.tefAdditionalInfo,
      item.requesterName,
      item.requesterEmail,
      item.assigneeName,
      SQUAD_LABELS[item.squad],
      projectLabel(item),
      requestSearchText(item, projectForItem(item)),
      ...(item.customFieldValues ? Object.values(item.customFieldValues) : []),
      ...cancellationSearch
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR");

    return (!term || haystack.includes(term))
      && (state.filters.type === "all" || projectIdForRequest(item) === state.filters.type)
      && (state.filters.priority === "all" || item.priority === state.filters.priority)
      && (state.filters.squad === "all"
        || (state.filters.squad === "none" ? !VALID_SQUADS.includes(item.squad) : item.squad === state.filters.squad))
      && (state.filters.requester === "all" || item.requesterUid === state.filters.requester);
  });
}

function requestPausedDuration(item, endAt = null) {
  let paused = Number(item?.pausedDurationMs || 0);
  if (item?.pauseStartedAt) {
    const started = timestampToDate(item.pauseStartedAt);
    const end = endAt ? timestampToDate(endAt) : new Date();
    if (started && end) paused += Math.max(0, end.getTime() - started.getTime());
  }
  return paused;
}

function requestAge(item) {
  const end = isCompletedStatus(item.status) ? item.completedAt : null;
  return Math.max(0, elapsedMs(item.createdAt, end) - requestPausedDuration(item, end));
}

function statusTransitionUpdate(item, newStatus) {
  const oldStatus = item?.status || initialStatusId();
  const oldPaused = isPausedStatus(oldStatus);
  const newPaused = isPausedStatus(newStatus);
  const update = { status: newStatus, lastStatusChangedAt: serverTimestamp() };
  if (!oldPaused && newPaused) { update.pauseStartedAt = serverTimestamp(); update.pauseAlert24SentAt = null; }
  if (oldPaused && !newPaused) {
    const started = timestampToDate(item.pauseStartedAt);
    const extra = started ? Math.max(0, Date.now() - started.getTime()) : 0;
    update.pausedDurationMs = Number(item.pausedDurationMs || 0) + extra;
    update.pauseStartedAt = null;
  }
  if (oldPaused && newPaused) update.pauseStartedAt = item.pauseStartedAt || serverTimestamp();
  if (isCompletedStatus(newStatus) && !isCompletedStatus(oldStatus)) update.completedAt = serverTimestamp();
  if (!isCompletedStatus(newStatus) && isCompletedStatus(oldStatus)) update.completedAt = null;
  return update;
}

function requestCardTitle(item) {
  const project = projectForItem(item);
  if (project.legacyType === "tef_elgin") return item.title || `TEF Elgin — ${item.tefCnpj || item.clientCode || "cliente"}`;
  if (project.legacyType === "cancelamento") {
    const entries = cancellationItemsFromRequest(item);
    if (entries.length > 1) return `${project.name} — ${entries.length} clientes`;
    const first = entries[0] || {};
    return item.title || `${project.name} — ${first.clientName || first.clientCnpj || "cliente"}`;
  }
  if (project.legacyType === "programacao") return item.title || "Sem título";
  return item.title || `${project.name} — ${item.companyName || item.document || "Solicitação"}`;
}

function requestCardClient(item) {
  const project = projectForItem(item);
  if (project.legacyType === "tef_elgin") {
    return {
      name: item.tefClientName || item.clientName || item.tefCnpj || item.clientCode || "Cliente não informado",
      code: item.tefCnpj || item.clientCode || "CNPJ não informado"
    };
  }
  if (project.legacyType === "cancelamento") {
    const entries = cancellationItemsFromRequest(item);
    const first = entries[0] || {};
    return {
      name: first.clientName || first.clientCnpj || "Cliente não informado",
      code: entries.length > 1 ? `+${entries.length - 1} cliente${entries.length - 1 === 1 ? "" : "s"}` : first.clientName ? first.clientCnpj || "" : ""
    };
  }
  if (project.legacyType === "custom") {
    return {
      name: item.companyName || item.clientName || project.name,
      code: item.document || item.clientCode || ""
    };
  }
  return {
    name: item.clientName || "Cliente não informado",
    code: item.clientCode || ""
  };
}

function requestCardDescription(item) {
  const project = projectForItem(item);
  if (project.legacyType === "tef_elgin") return [item.tefOperatingSystem, item.tefRam, item.tefAcquirer].filter(Boolean).join(" · ");
  if (project.legacyType === "cancelamento") {
    const entries = cancellationItemsFromRequest(item);
    if (entries.length === 1) return entries[0]?.reason || "";
    return entries.map((entry) => entry.clientName || entry.clientCnpj).filter(Boolean).join(" · ");
  }
  if (project.legacyType === "custom") {
    const firstValue = Object.values(item.customFieldValues || {}).find(Boolean);
    return item.description || firstValue || project.description || "";
  }
  return item.description || "";
}

function cardHtml(item, isOldest) {
  const age = requestAge(item);
  const ageHours = age / 3600000;
  const ageClass = isCompletedStatus(item.status)
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
  const copyButton = canCopyRequest(item)
    ? `<button class="card-copy-button" type="button" data-copy-id="${escapeHtml(item.id)}" title="Copiar dados da solicitação">⧉ Copiar</button>`
    : "";
  const attachmentCount = Array.isArray(item.attachments) ? item.attachments.length : 0;
  const commentCount = Number(item.commentCount || 0);
  const project = projectForItem(item);
  const legacyType = project.legacyType;
  const cancellationEntries = legacyType === "cancelamento" ? cancellationItemsFromRequest(item) : [];
  const cancellationDone = cancellationEntries.filter((entry) => entry.crmCancelled === true).length;
  const crmProgressTag = cancellationEntries.length
    ? `<span class="tag crm-progress ${cancellationDone === cancellationEntries.length ? "complete" : ""}">CRM ${cancellationDone}/${cancellationEntries.length}</span>`
    : "";
  const cardDescription = requestCardDescription(item);
  const cardDescriptionHtml = legacyType !== "programacao" && cardDescription
    ? `<p class="card-description">${escapeHtml(cardDescription)}</p>`
    : "";

  const paused = isPausedStatus(item.status);
  const bulkSelector = isAdmin() && state.bulkMode
    ? `<label class="bulk-card-check" title="Selecionar solicitação"><input type="checkbox" data-bulk-id="${escapeHtml(item.id)}" ${state.bulkSelected.has(item.id) ? "checked" : ""}><span>Selecionar</span></label>`
    : "";
  return `
    <article class="request-card ${ageClass} ${isOldest ? "oldest" : ""} ${state.bulkSelected.has(item.id) ? "bulk-selected" : ""}" data-id="${escapeHtml(item.id)}" draggable="${draggable}" tabindex="0" role="button" aria-label="Abrir solicitação ${escapeHtml(title)}">
      ${bulkSelector}
      <div class="card-top">
        <div class="card-tags">
          <span class="tag ${projectTagClass(project.id)}">${escapeHtml(project.name || "Solicitação")}</span>
          <span class="tag squad">${escapeHtml(SQUAD_LABELS[item.squad] || "Sem grupo")}</span>
          ${legacyType === "programacao" ? `<span class="tag ${item.priority}">${PRIORITY_LABELS[item.priority] || "Normal"}</span>` : ""}
          ${attachmentCount ? `<span class="tag attachment">📎 ${attachmentCount}</span>` : ""}
          ${commentCount ? `<span class="tag comments">💬 ${commentCount}</span>` : ""}
          ${paused ? `<span class="tag paused">⏸ ${escapeHtml(statusLabel(item.status).toUpperCase())}</span>` : ""}
          ${crmProgressTag}
        </div>
        <span class="card-time ${ageHours >= 48 && !isCompletedStatus(item.status) ? "critical" : ""}" data-created-at="${timestampToDate(item.createdAt)?.toISOString() || ""}" data-completed-at="${timestampToDate(item.completedAt)?.toISOString() || ""}" data-status="${item.status}" data-paused-ms="${Number(item.pausedDurationMs || 0)}" data-pause-started-at="${timestampToDate(item.pauseStartedAt)?.toISOString() || ""}">${paused ? "⏸" : "◷"} ${formatElapsed(age, true)}</span>
      </div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
      ${legacyType === "programacao"
        ? `<div class="program-card-client">
            <p class="card-client"><strong>${escapeHtml(cardClient.name)}</strong></p>
            <p class="card-cnpj"><span>CNPJ:</span> ${escapeHtml(cardClient.code || "Não informado")}</p>
          </div>`
        : `<p class="card-client"><strong>${escapeHtml(cardClient.name)}</strong>${cardClient.code ? ` · ${escapeHtml(cardClient.code)}` : ""}</p>`}
      ${cardDescriptionHtml}
      <footer class="card-footer">
        <div class="card-person" title="Solicitado por ${escapeHtml(item.requesterName || item.requesterEmail || "")}">
          <span class="mini-avatar">${escapeHtml(initials(item.requesterName || item.requesterEmail))}</span>
          <span>${escapeHtml(item.requesterName || item.requesterEmail || "Usuário")}</span>
        </div>
        <div class="card-actions">
          ${videoLink && legacyType === "programacao" ? `<a class="card-link" href="${escapeHtml(videoLink)}" target="_blank" rel="noopener noreferrer" >Ver vídeo ↗</a>` : ""}
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
  const openFiltered = filtered.filter((request) => !isCompletedStatus(request.status));
  const oldestId = [...openFiltered].sort((a, b) => requestAge(b) - requestAge(a))[0]?.id;
  let renderedCount = 0;

  activeKanbanColumns().forEach((columnConfig) => {
    const status = columnConfig.id;
    const column = $(`[data-dropzone="${CSS.escape(status)}"]`);
    const count = $(`[data-count="${CSS.escape(status)}"]`);
    if (!column || !count) return;
    const items = filtered
      .filter((request) => request.status === status)
      .sort((a, b) => {
        if (columnConfig.completed) {
          return (timestampToDate(b.completedAt)?.getTime() || 0)
            - (timestampToDate(a.completedAt)?.getTime() || 0);
        }
        return requestAge(b) - requestAge(a);
      });

    renderedCount += items.length;
    count.textContent = items.length;
    updateBulkColumnSelector(status, items);
    column.innerHTML = items.length
      ? items.map((item) => cardHtml(item, item.id === oldestId)).join("")
      : `<div class="column-empty">Nenhuma solicitação nesta etapa</div>`;
  });

  els.kanbanBoard.hidden = renderedCount === 0;
  els.emptyState.hidden = renderedCount !== 0;
  bindCardEvents();
}

function renderMetrics() {
  const open = state.requests.filter((request) => !isCompletedStatus(request.status));
  const done = state.requests.filter((request) => isCompletedStatus(request.status));
  const programming = new Set(state.requests.filter((request) => !isCompletedStatus(request.status)).map(projectIdForRequest)).size;
  const oldest = [...open].sort((a, b) => requestAge(b) - requestAge(a))[0];

  els.metricOpen.textContent = open.length;
  els.metricDone.textContent = done.length;
  els.metricProgramming.textContent = programming;
  els.metricOldest.textContent = oldest ? formatElapsed(requestAge(oldest), true) : "—";
}

function renderLoadingCards() {
  activeKanbanColumns().forEach(({ id: status }) => {
    const column = $(`[data-dropzone="${CSS.escape(status)}"]`);
    if (column) column.innerHTML = `<div class="loading-card"></div><div class="loading-card"></div>`;
  });
}

function updateElapsedLabels(updateMetrics = true) {
  $$('[data-created-at]').forEach((element) => {
    if (!element.dataset.createdAt) return;
    const end = isCompletedStatus(element.dataset.status) && element.dataset.completedAt ? new Date(element.dataset.completedAt) : null;
    let paused = Number(element.dataset.pausedMs || 0);
    if (element.dataset.pauseStartedAt) paused += Math.max(0, (end || new Date()).getTime() - new Date(element.dataset.pauseStartedAt).getTime());
    const activeElapsed = Math.max(0, elapsedMs(new Date(element.dataset.createdAt), end) - paused);
    const isPaused = isPausedStatus(element.dataset.status);
    element.textContent = `${isPaused ? "⏸" : "◷"} ${formatElapsed(activeElapsed, true)}`;
  });
  if (updateMetrics) renderMetrics();
}

function bindCardEvents() {
  $$(".request-card").forEach((card) => {
    const open = () => {
      if (state.bulkMode) {
        toggleBulkSelection(card.dataset.id);
        return;
      }
      openRequestModal(card.dataset.id);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        open();
      }
    });

    const bulkCheckbox = card.querySelector("[data-bulk-id]");
    bulkCheckbox?.addEventListener("click", (event) => event.stopPropagation());
    bulkCheckbox?.addEventListener("change", (event) => {
      event.stopPropagation();
      setBulkSelection(card.dataset.id, event.target.checked);
    });

    if (isAdmin() && !state.bulkMode) {
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

  $$(".card-link").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
    link.addEventListener("keydown", (event) => event.stopPropagation());
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
          ...statusTransitionUpdate(item, newStatus),
          updatedAt: serverTimestamp(),
          updatedByUid: state.user.uid,
          updatedByName: state.profile.name || state.user.email
        };
        await updateDoc(doc(db, "requests", id), update);
        await recordHistory(item, "status", `Status alterado de ${statusLabel(item.status)} para ${statusLabel(newStatus)}.`, { from: item.status, to: newStatus });
        await notifyStatusChange(item, newStatus);
        showToast(`Solicitação movida para ${statusLabel(newStatus)}.`);
      } catch (error) {
        console.error(error);
        showToast(firebaseErrorMessage(error), "error");
      }
    });
  });
}

function squadFilterOptionsForCurrentUser() {
  if (isAdmin()) {
    return [
      ["all", "Todos os grupos"],
      ...VALID_SQUADS.map((squad) => [squad, SQUAD_LABELS[squad]])
    ];
  }
  const allowed = squadVisibilityGroup(state.profile?.squad);
  const pairLabel = allowed.includes("squad_a") ? "Squads A e B" : "Squads D e E";
  return [["all", pairLabel], ...allowed.map((squad) => [squad, SQUAD_LABELS[squad]])];
}

function defaultSquadFilterValue() {
  if (isAdmin()) {
    const preferred = state.profile?.preferredSquadFilter;
    return preferred === "all" || VALID_SQUADS.includes(preferred) ? preferred : "all";
  }
  return VALID_SQUADS.includes(state.profile?.squad) ? state.profile.squad : "all";
}

function configureSquadFilter({ preserveSelection = false } = {}) {
  if (!els.squadFilter) return;
  const previous = preserveSelection ? els.squadFilter.value : "";
  const options = squadFilterOptionsForCurrentUser();
  els.squadFilter.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  const allowedValues = options.map(([value]) => value);
  const nextValue = allowedValues.includes(previous) ? previous : defaultSquadFilterValue();
  els.squadFilter.value = nextValue;
  state.filters.squad = nextValue;
}

async function persistAdminSquadPreference() {
  if (!isAdmin() || !state.user) return;
  const value = els.squadFilter.value;
  if (!(value === "all" || VALID_SQUADS.includes(value))) return;
  state.profile.preferredSquadFilter = value;
  try {
    await updateDoc(doc(db, "users", state.user.uid), {
      preferredSquadFilter: value,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Não foi possível salvar a preferência de grupo.", error);
  }
}

function updateUserSquadFieldVisibility(roleSelect, field, squadSelect) {
  const isRequester = roleSelect?.value === "solicitante";
  if (field) field.hidden = !isRequester;
  if (squadSelect) {
    squadSelect.required = isRequester;
    squadSelect.disabled = !isRequester;
    if (!isRequester) squadSelect.value = "";
  }
}

function setAdminVisibility() {
  const admin = isAdmin();
  const managedVisibility = new Set([
    els.bulkActionsBar,
    els.archiveRequestButton,
    els.deleteRequestButton,
    els.commentMentionField
  ]);

  $$(".admin-only").forEach((element) => {
    if (!admin) {
      element.hidden = true;
      return;
    }

    // Alguns componentes administrativos também dependem do estado atual
    // da interface. Eles não devem ser exibidos apenas porque o usuário é admin.
    if (managedVisibility.has(element)) return;
    element.hidden = false;
  });

  if (els.bulkActionsBar) els.bulkActionsBar.hidden = !(admin && state.bulkMode);
  els.requesterFilter.hidden = !admin;
}

function renderUser() {
  const name = state.profile.name || state.user.email;
  els.userName.textContent = name;
  els.userRole.textContent = isAdmin() ? "Administrador" : `Solicitante · ${SQUAD_LABELS[state.profile?.squad] || "Sem grupo"}`;
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
  if (!requestId || !requestItem || projectLegacyType(projectForItem(requestItem)) !== "cancelamento") {
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
    await recordHistory(requestItem, "crm", checked ? `Cliente marcado como cancelado no CRM: ${targetItem.clientName || targetItem.clientCnpj}.` : `Cliente reaberto no controle do CRM: ${targetItem.clientName || targetItem.clientCnpj}.`, { itemId: targetItem.itemId, cancelled: checked });
    showToast(checked ? `Cancelamento marcado no CRM (${done}/${updatedItems.length}).` : `Cancelamento reaberto no controle do CRM (${done}/${updatedItems.length}).`);
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

function updateTefPixFields() {
  const shouldShow = projectLegacyType(els.requestType.value) === "tef_elgin" && els.tefUsesPix.checked;
  els.tefAdditionalInfoField.hidden = !shouldShow;
  els.tefAdditionalInfo.disabled = !shouldShow || !state.modalEditable;
  els.tefAdditionalInfoCount.textContent = String(els.tefAdditionalInfo.value.length);
}

function dynamicInputId(prefix, key) {
  return `${prefix}-${String(key || "field").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function renderCustomProjectForm(project, item = null) {
  const values = item || {};
  const standardValues = {
    document: values.document || values.clientCode || "",
    companyName: values.companyName || values.clientName || "",
    phone: values.phone || values.contactPhone || "",
    email: values.email || values.contactEmail || ""
  };
  els.customProjectTitle.textContent = project.name;
  els.customProjectDescription.textContent = project.description || "Preencha os campos configurados para este projeto.";

  els.customStandardFields.innerHTML = Object.entries(STANDARD_FIELD_DEFINITIONS).map(([key, definition]) => {
    const config = project.standardFields?.[key];
    if (!config?.enabled) return "";
    const required = config.required === true;
    const id = dynamicInputId("custom-standard", key);
    const inputType = definition.type === "email" ? "email" : definition.type === "phone" ? "tel" : "text";
    const inputMode = ["document", "phone"].includes(definition.type) ? ' inputmode="numeric"' : "";
    const className = definition.type === "document" ? "dynamic-document-input" : definition.type === "phone" ? "dynamic-phone-input" : "";
    const placeholder = definition.type === "document" ? "CPF ou CNPJ" : definition.type === "phone" ? "(00) 00000-0000" : definition.type === "email" ? "nome@empresa.com.br" : "Razão social ou nome fantasia";
    return `<label class="field"><span>${escapeHtml(definition.label)}${required ? " *" : ""}</span><input id="${escapeHtml(id)}" data-custom-standard="${escapeHtml(key)}" class="${className}" type="${inputType}"${inputMode} maxlength="${definition.maxLength}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(standardValues[key] || "")}" ${required ? "required" : ""}></label>`;
  }).join("");

  const customValues = values.customFieldValues && typeof values.customFieldValues === "object" ? values.customFieldValues : {};
  els.customFieldsContainer.innerHTML = project.customFields
    .filter((field) => field.active !== false)
    .sort((a, b) => a.order - b.order)
    .map((field) => `<label class="field form-span-2"><span>${escapeHtml(field.label)}${field.required ? " *" : ""}</span><textarea data-custom-field="${escapeHtml(field.id)}" rows="5" maxlength="${field.maxLength || 1000}" placeholder="${escapeHtml(field.placeholder || "Digite as informações solicitadas.")}" ${field.required ? "required" : ""}>${escapeHtml(customValues[field.id] || "")}</textarea><small class="field-counter"><span data-custom-counter="${escapeHtml(field.id)}">${String(customValues[field.id] || "").length}</span>/${field.maxLength || 1000} caracteres</small></label>`).join("");

  $$("[data-custom-field]", els.customFieldsContainer).forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const counter = $(`[data-custom-counter="${CSS.escape(textarea.dataset.customField)}"]`, els.customFieldsContainer);
      if (counter) counter.textContent = String(textarea.value.length);
    });
  });
  $$(".dynamic-document-input", els.customStandardFields).forEach((input) => input.addEventListener("input", () => { input.value = formatCpfCnpj(input.value); }));
  $$(".dynamic-phone-input", els.customStandardFields).forEach((input) => input.addEventListener("input", () => { input.value = formatPhone(input.value); }));
  setSectionInputsEnabled(els.customProjectFields, state.modalEditable);
}

function collectDynamicProjectValues() {
  const standard = {};
  const custom = {};
  $$('[data-custom-standard]', els.customStandardFields).forEach((input) => { standard[input.dataset.customStandard] = input.value; });
  $$('[data-custom-field]', els.customFieldsContainer).forEach((input) => { custom[input.dataset.customField] = input.value; });
  return { standard, custom };
}

function buildCustomProjectPayload(project) {
  const result = validateDynamicRequest(project, collectDynamicProjectValues(), {
    isValidDocument: isValidCpfCnpj,
    isValidPhone,
    isValidEmail: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""))
  });
  if (!result.valid) return { error: result.errors[0] || "Revise os campos do projeto." };
  const standard = result.values.standard;
  const custom = result.values.custom;
  const firstCustom = project.customFields.find((field) => field.active !== false && custom[field.id]);
  const identifier = standard.companyName || standard.document || (firstCustom ? custom[firstCustom.id].slice(0, 80) : "Solicitação");
  const descriptionLines = [
    standard.document ? `CPF/CNPJ: ${formatCpfCnpj(standard.document)}` : "",
    standard.companyName ? `Razão Social: ${standard.companyName}` : "",
    standard.phone ? `Telefone: ${formatPhone(standard.phone)}` : "",
    standard.email ? `E-mail: ${standard.email}` : "",
    ...project.customFields
      .filter((field) => field.active !== false && custom[field.id])
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      .map((field) => `${field.label}: ${custom[field.id]}`)
  ].filter(Boolean);
  return {
    data: {
      priority: "normal",
      document: standard.document ? formatCpfCnpj(standard.document) : "",
      companyName: standard.companyName || "",
      phone: standard.phone ? formatPhone(standard.phone) : "",
      email: standard.email || "",
      clientName: standard.companyName || standard.document || project.name,
      clientCode: standard.document ? formatCpfCnpj(standard.document) : "",
      contactName: "",
      contactRole: "",
      contactEmail: standard.email || "",
      contactPhone: standard.phone ? formatPhone(standard.phone) : "",
      title: `${project.name} — ${identifier}`.slice(0, 140),
      description: descriptionLines.join("\n").slice(0, 3000),
      currentBehavior: "",
      expectedBehavior: "",
      justification: "",
      videoLink: "",
      externalLink: "",
      cancellationItems: [],
      customFieldValues: custom,
      projectFormSnapshot: {
        projectName: project.name,
        standardFields: project.standardFields || {},
        customFields: project.customFields.map((field) => ({ id: field.id, label: field.label, required: field.required, maxLength: field.maxLength, order: field.order }))
      }
    }
  };
}

function updateRequestTypeFields(item = null) {
  const projectId = els.requestType.value;
  const project = item ? projectDefinitionForRequest(item) : projectById(projectId);
  const legacyType = projectLegacyType(project);
  const isProgramming = legacyType === "programacao";
  const isCancellation = legacyType === "cancelamento";
  const isTef = legacyType === "tef_elgin";
  const isCustom = legacyType === "custom";

  els.requestDialog.classList.toggle("request-dialog-cancellation", isCancellation);
  els.programmingFields.hidden = !isProgramming;
  els.cancellationFields.hidden = !isCancellation;
  els.tefFields.hidden = !isTef;
  els.customProjectFields.hidden = !isCustom;
  els.priorityField.hidden = !isProgramming;

  setSectionInputsEnabled(els.programmingFields, isProgramming && state.modalEditable);
  setSectionInputsEnabled(els.cancellationFields, isCancellation && state.modalEditable);
  setSectionInputsEnabled(els.tefFields, isTef && state.modalEditable);
  setSectionInputsEnabled(els.customProjectFields, isCustom && state.modalEditable);
  els.requestPriority.disabled = !isProgramming || !state.modalEditable;
  els.requestSquad.disabled = !state.modalEditable || (!isAdmin() && isSolicitante());

  if (isProgramming) renderAttachmentList();
  if (isCancellation) renderCancellationItems(state.modalCancellationItems, state.modalEditable);
  if (isCustom) renderCustomProjectForm(project, item || null);
  updateTefPixFields();

  const isExistingRequest = Boolean(els.requestId.value);
  els.requestType.disabled = !state.modalEditable || isExistingRequest;
  els.requestType.title = isExistingRequest
    ? "O projeto da solicitação não pode ser alterado após o primeiro salvamento."
    : "";
  els.requestStatus.disabled = !isAdmin() || state.modalArchived;
  els.requestAssignee.disabled = !isAdmin() || state.modalArchived;
}

function resetRequestForm() {
  state.requestSaveInProgress = false;
  state.pendingCreateRequestId = "";
  setButtonLoading(els.saveRequestButton, false);
  if (state.unsubscribeComments) state.unsubscribeComments();
  if (state.unsubscribeHistory) state.unsubscribeHistory();
  state.unsubscribeComments = null;
  state.unsubscribeHistory = null;
  state.currentComments = [];
  state.currentHistory = [];
  state.modalArchived = false;
  els.requestForm.reset();
  clearFieldValidation(els.requestClientCode);
  clearFieldValidation(els.requestContactPhone);
  clearFieldValidation(els.tefCnpj);
  clearFieldValidation(els.tefOwnerCpf);
  clearFieldValidation(els.tefContactPhone);
  els.tefUsesPix.checked = false;
  els.tefAdditionalInfo.value = "";
  state.modalEditable = true;
  els.requestId.value = "";
  const defaultProject = creatableProjects()[0] || state.projects[0] || DEFAULT_PROJECTS[0];
  els.requestType.value = defaultProject?.id || "programacao";
  els.requestSquad.value = isSolicitante() && VALID_SQUADS.includes(state.profile?.squad) ? state.profile.squad : "";
  els.requestPriority.value = "normal";
  els.requestStatus.value = initialStatusId();
  els.requestAssignee.value = "";
  els.requestModalTitle.textContent = "Nova solicitação";
  els.saveRequestButton.textContent = "Salvar solicitação";
  els.saveRequestButton.hidden = false;
  els.copyRequestButton.hidden = true;
  els.archiveRequestButton.hidden = true;
  els.deleteRequestButton.hidden = true;
  els.requestCommentsTab.disabled = true;
  els.requestHistoryTab.disabled = true;
  els.requestCommentCount.textContent = "0";
  els.requestHistoryCount.textContent = "0";
  els.requestCommentText.value = "";
  els.requestCommentMention.innerHTML = '<option value="">Não enviar notificação</option>';
  showFormError(els.requestCommentError);
  switchRequestTab("details");
  renderRequestComments();
  renderRequestHistory();
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

function openNewRequestModal(projectId = "") {
  resetRequestForm();
  const projects = creatableProjects();
  const selected = projects.find((project) => project.id === projectId) || projects[0];
  if (!selected) {
    showToast("Nenhum projeto publicado está disponível para o seu perfil.", "warning");
    return;
  }
  els.requestType.value = selected.id;
  updateRequestTypeFields();
  els.requestDialog.showModal();
  window.setTimeout(() => {
    const legacyType = projectLegacyType(selected);
    if (legacyType === "programacao") els.requestClient.focus();
    else if (legacyType === "cancelamento") els.cancellationCnpjInput.focus();
    else if (legacyType === "tef_elgin") els.tefCnpj.focus();
    else $("input, textarea", els.customProjectFields)?.focus();
  }, 50);
}

function canRequesterEdit(item) {
  return !isAdmin()
    && item.requesterUid === state.user.uid
    && item.status === initialStatusId();
}

function openRequestModal(id, source = "active") {
  const archived = source === "archived";
  const item = archived
    ? state.archivedRequests.find((request) => request.id === id)
    : state.requests.find((request) => request.id === id);
  if (!item || (!archived && !requestIsAccessible(item))) return;

  resetRequestForm();
  state.modalArchived = archived;
  const itemProject = projectForItem(item);
  const itemLegacyType = itemProject.legacyType;
  const crmTrackingStarted = itemLegacyType === "cancelamento"
    && Object.keys(cancellationCrmTracking(item)).length > 0;
  const editable = !archived && (isAdmin() || (canRequesterEdit(item) && !crmTrackingStarted));
  state.modalEditable = editable;

  els.requestId.value = item.id;
  if (!state.projects.some((project) => project.id === projectIdForRequest(item))) state.projects = mergeProjects([...state.projects, itemProject]);
  populateProjectAndColumnControls();
  const currentProjectId = projectIdForRequest(item);
  if (![...els.requestType.options].some((option) => option.value === currentProjectId)) {
    const option = document.createElement("option");
    option.value = currentProjectId;
    option.textContent = itemProject.name || item.projectName || "Projeto arquivado";
    els.requestType.append(option);
  }
  els.requestType.value = currentProjectId;
  els.requestSquad.value = VALID_SQUADS.includes(item.squad) ? item.squad : "";
  els.requestPriority.value = item.priority || "normal";
  els.requestClient.value = item.clientName || "";
  els.requestClientCode.value = formatCpfCnpj(item.clientCode || "");
  els.requestContactName.value = item.contactName || "";
  els.requestContactRole.value = item.contactRole || "";
  els.requestContactEmail.value = item.contactEmail || "";
  els.requestContactPhone.value = formatPhone(item.contactPhone || "");
  els.requestTitle.value = item.title || "";
  els.requestDescription.value = itemLegacyType === "cancelamento" ? "" : item.description || "";
  els.requestCurrentBehavior.value = item.currentBehavior || "";
  els.requestExpectedBehavior.value = item.expectedBehavior || "";
  els.requestJustification.value = item.justification || "";
  els.requestLink.value = item.videoLink || item.externalLink || "";
  els.tefCnpj.value = formatCnpj(item.tefCnpj || (itemLegacyType === "tef_elgin" ? item.clientCode : ""));
  const legacyTefClientName = itemLegacyType === "tef_elgin"
    && item.clientName
    && item.clientName !== item.tefCnpj
    && item.clientName !== item.clientCode
      ? item.clientName
      : "";
  els.tefClientName.value = item.tefClientName || legacyTefClientName;
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
  els.tefUsesPix.checked = item.tefUsesPix === true;
  els.tefAdditionalInfo.value = item.tefAdditionalInfo || "";

  // Valores preenchidos por código não disparam eventos input/blur.
  // Recalcula a validade para evitar mensagens incorretas no primeiro salvamento.
  if (itemLegacyType === "programacao") {
    setSpecificDocumentValidity(els.requestClientCode, "cnpj", { required: true, showMessage: false });
    setPhoneValidity(els.requestContactPhone, { showMessage: false });
  } else {
    clearFieldValidation(els.requestClientCode);
    clearFieldValidation(els.requestContactPhone);
  }
  if (itemLegacyType === "tef_elgin") {
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
  els.requestStatus.value = validStatusIds().includes(item.status) ? item.status : initialStatusId();
  els.requestAssignee.value = item.assigneeUid || "";
  renderCancellationItems(
    itemLegacyType === "cancelamento" ? cancellationItemsFromRequest(item) : [],
    editable
  );

  els.requestModalTitle.textContent = archived ? "Solicitação arquivada" : "Detalhes da solicitação";
  els.saveRequestButton.textContent = "Salvar alterações";
  els.saveRequestButton.hidden = !editable;
  els.copyRequestButton.hidden = !canCopyRequest(item);
  els.deleteRequestButton.hidden = !isAdmin() || archived;
  els.archiveRequestButton.hidden = !isAdmin() || (!archived && !isCompletedStatus(item.status));
  els.archiveRequestButton.textContent = archived ? "↶ Restaurar" : "▣ Arquivar";
  els.requestCommentsTab.disabled = false;
  els.requestHistoryTab.disabled = false;
  els.commentComposer.hidden = archived || !canCommentOnRequest(item);
  els.requestAudit.hidden = false;
  els.requestAudit.innerHTML = `
    <strong>Grupo:</strong> ${escapeHtml(SQUAD_LABELS[item.squad] || "Sem grupo")}<br>
    <strong>Solicitado por:</strong> ${escapeHtml(item.requesterName || item.requesterEmail || "—")}<br>
    <strong>Criado em:</strong> ${formatDateTime(item.createdAt)} · <strong>Tempo ativo:</strong> ${formatElapsed(requestAge(item))} · <strong>Tempo pausado:</strong> ${formatElapsed(requestPausedDuration(item, isCompletedStatus(item.status) ? item.completedAt : null))}<br>
    <strong>Última atualização:</strong> ${formatDateTime(item.updatedAt)}${item.updatedByName ? ` por ${escapeHtml(item.updatedByName)}` : ""}
    ${archived ? `<br><strong>Arquivado em:</strong> ${formatDateTime(item.archivedAt)}${item.archivedByName ? ` por ${escapeHtml(item.archivedByName)}` : ""}` : ""}
  `;

  populateCommentMentionOptions(item);
  updateRequestTypeFields(item);
  subscribeRequestComments(item.id, archived);
  subscribeRequestHistory(item.id);
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
  const usesPix = els.tefUsesPix.checked;
  const data = {
    tefCnpj: formatCnpj(els.tefCnpj.value),
    tefClientName: sanitizeText(els.tefClientName.value),
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
    tefAgreedValue: sanitizeText(els.tefAgreedValue.value),
    tefUsesPix: usesPix,
    tefAdditionalInfo: usesPix ? sanitizeText(els.tefAdditionalInfo.value) : ""
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

  const requiredValues = [
    data.tefCnpj,
    data.tefClientName,
    data.tefOperatingSystem,
    data.tefRam,
    data.tefSystemUsed,
    data.tefEstablishmentNumber,
    data.tefPinpadLogicalNumber,
    data.tefPinpadModel,
    data.tefAcquirer,
    data.tefOwnerName,
    data.tefOwnerCpf,
    data.tefContactPhone,
    data.tefContactEmail,
    data.tefAgreedValue
  ];
  if (requiredValues.some((value) => !value)) {
    return { error: "Preencha todos os campos obrigatórios da solicitação TEF Elgin." };
  }

  const title = `TEF Elgin — ${data.tefClientName}`;
  const description = [
    `CNPJ: ${data.tefCnpj}`,
    `Sistema operacional: ${data.tefOperatingSystem}`,
    `Memória RAM: ${data.tefRam}`,
    `Sistema utilizado: ${data.tefSystemUsed}`,
    `Adquirente: ${data.tefAcquirer}`,
    `Proprietário: ${data.tefOwnerName}`,
    `Utiliza PIX: ${data.tefUsesPix ? "Sim" : "Não"}`,
    data.tefUsesPix && data.tefAdditionalInfo ? `Informações adicionais do PIX: ${data.tefAdditionalInfo}` : ""
  ].filter(Boolean).join("\n");

  return {
    data: {
      priority: "normal",
      clientName: data.tefClientName,
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
  if (state.requestSaveInProgress) return;
  showFormError(els.requestError);

  const id = els.requestId.value;
  const existing = state.requests.find((request) => request.id === id);
  const selectedProject = projectById(els.requestType.value);
  const project = existing ? projectDefinitionForRequest(existing) : selectedProject;
  if (!project?.id || !projectAllowsCreation(project, state.profile?.role || "solicitante") && !existing) {
    showFormError(els.requestError, "O projeto selecionado não está publicado para o seu perfil.");
    return;
  }
  const type = projectLegacyType(project);
  const typeResult = type === "programacao"
    ? buildProgrammingPayload()
    : type === "cancelamento"
      ? buildCancellationPayload()
      : type === "tef_elgin"
        ? buildTefPayload()
        : buildCustomProjectPayload(project);

  if (typeResult.error) {
    showFormError(els.requestError, typeResult.error);
    return;
  }

  const squad = VALID_SQUADS.includes(els.requestSquad.value) ? els.requestSquad.value : "";
  if (!squad) {
    showFormError(els.requestError, "Selecione o grupo de atendimento responsável pela solicitação.");
    els.requestSquad.focus();
    return;
  }

  if (type === "programacao" && totalModalAttachments() > MAX_ATTACHMENTS) {
    showFormError(els.requestError, `É possível anexar no máximo ${MAX_ATTACHMENTS} arquivos.`);
    return;
  }

  const pendingCreateId = !id && !existing ? state.pendingCreateRequestId : "";
  const requestDocument = id && existing
    ? doc(db, "requests", id)
    : pendingCreateId
      ? doc(db, "requests", pendingCreateId)
      : doc(collection(db, "requests"));
  const requestId = requestDocument.id;
  if (!id && !existing) state.pendingCreateRequestId = requestId;
  const ownerUid = existing?.requesterUid || state.user.uid;
  const retainedAttachments = type === "programacao" ? retainedModalAttachments() : [];
  const attachmentsToRemove = type === "programacao"
    ? state.modalExistingAttachments.filter(
      (attachment) => state.modalRemovedAttachmentKeys.includes(attachmentKey(attachment))
    )
    : state.modalExistingAttachments;

  const payload = {
    type,
    projectId: project.id,
    projectName: project.name,
    squad,
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

  state.requestSaveInProgress = true;
  setButtonLoading(els.saveRequestButton, true, "Salvando...");

  try {
    if (id && existing && !isAdmin() && !canRequesterEdit(existing)) {
      throw { code: "permission-denied" };
    }

    const pendingAttachmentWrites = type === "programacao"
      ? await withTimeout(
        () => buildPendingAttachmentWrites(ownerUid, requestId),
        15000,
        "preparação dos anexos"
      )
      : [];
    payload.attachments = [
      ...retainedAttachments,
      ...pendingAttachmentWrites.map((write) => write.metadata)
    ];

    if (id && existing && isAdmin()) {
      payload.status = validStatusIds().includes(els.requestStatus.value) ? els.requestStatus.value : existing.status;
      Object.assign(payload, statusTransitionUpdate(existing, payload.status));
      const assignee = state.users.find((user) => user.uid === els.requestAssignee.value);
      payload.assigneeUid = assignee?.uid || "";
      payload.assigneeName = assignee?.name || assignee?.email || "";
    }

    const commitRequestChanges = async () => {
      const batch = writeBatch(db);

      // A solicitação precisa existir antes do upload. As políticas do Storage
      // validam o requestId do caminho e recusam anexos órfãos.
      if (id && existing) {
        batch.update(requestDocument, payload);
      } else {
        batch.set(requestDocument, {
          ...payload,
          status: initialStatusId(),
          requesterUid: state.user.uid,
          requesterName: state.profile.name || state.user.email,
          requesterEmail: state.user.email,
          assigneeUid: "",
          assigneeName: "",
          createdAt: serverTimestamp(),
          completedAt: null,
          pausedDurationMs: 0,
          pauseStartedAt: null,
          lastStatusChangedAt: serverTimestamp()
        });
      }

      pendingAttachmentWrites.forEach((write) => batch.set(write.reference, write.data));
      attachmentsToRemove.forEach((attachment) => {
        const reference = firestoreAttachmentReference(attachment);
        if (reference) batch.delete(reference);
      });

      return batch.commit();
    };

    await commitWithRetry(commitRequestChanges, {
      timeoutMs: REQUEST_SAVE_TIMEOUT_MS,
      retries: 1,
      onAttempt: (attempt) => {
        setButtonLoading(
          els.saveRequestButton,
          true,
          attempt === 1 ? "Salvando..." : "Tentando novamente..."
        );
      },
      onRetry: () => {
        showFormError(
          els.requestError,
          "A confirmação do Supabase está demorando. O painel fará uma nova tentativa automática."
        );
      }
    });
    showFormError(els.requestError);

    const savedItem = {
      ...(existing || {}),
      id: requestId,
      ...payload,
      requesterUid: existing?.requesterUid || state.user.uid,
      requesterName: existing?.requesterName || state.profile.name || state.user.email
    };
    const postSaveTasks = [];

    if (existing) {
      const changes = describeRequestChanges(existing, payload);
      postSaveTasks.push(recordHistory(savedItem, "update", changes.summary, changes.details));
      if (isAdmin() && payload.assigneeUid && payload.assigneeUid !== existing.assigneeUid) {
        postSaveTasks.push(notifyAssignment(savedItem, payload.assigneeUid));
      }
      if (isAdmin() && payload.status && payload.status !== existing.status) {
        postSaveTasks.push(notifyStatusChange(savedItem, payload.status));
      }
    } else {
      postSaveTasks.push(recordHistory(savedItem, "create", "Solicitação criada.", { type, projectId: project.id, projectName: project.name }));
    }

    // Histórico e notificações são complementares. Eles não devem manter o
    // botão preso em “Salvando...” depois que a solicitação já foi gravada.
    runPostSaveTasks(postSaveTasks);
    state.pendingCreateRequestId = "";

    showToast(id && existing
      ? "Solicitação atualizada com sucesso."
      : type === "cancelamento"
        ? "Lista de cancelamentos criada com sucesso."
        : `Solicitação do projeto ${project.name} criada com sucesso.`);
    els.requestDialog.close();
  } catch (error) {
    console.error(error);
    showFormError(els.requestError, firebaseErrorMessage(error));
  } finally {
    state.requestSaveInProgress = false;
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
Grupo de atendimento: ${SQUAD_LABELS[item.squad] || "Sem grupo"}

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
  return `=== CHAMADOS PARA CANCELAMENTO ===\nGrupo de atendimento: ${SQUAD_LABELS[item.squad] || "Sem grupo"}\n\n${blocks.join("\n\n------------------------------\n\n")}`;
}

function tefCopyText(item) {
  return `=== SOLICITAÇÃO TEF ELGIN ===

GRUPO DE ATENDIMENTO: ${SQUAD_LABELS[item.squad] || "Sem grupo"}
RAZÃO SOCIAL: ${item.tefClientName || item.clientName || ""}
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
VALOR COMBINADO: ${item.tefAgreedValue || ""}
UTILIZA PIX: ${item.tefUsesPix === true ? "SIM" : "NÃO"}
INFORMAÇÕES ADICIONAIS DO PIX: ${item.tefUsesPix === true ? item.tefAdditionalInfo || "" : "Não se aplica"}`;
}

function customProjectCopyText(item) {
  const project = projectDefinitionForRequest(item);
  const snapshotFields = Array.isArray(item.projectFormSnapshot?.customFields)
    ? item.projectFormSnapshot.customFields
    : project.customFields || [];
  const values = item.customFieldValues && typeof item.customFieldValues === "object"
    ? item.customFieldValues
    : {};
  const standardLines = [
    item.document || item.clientCode ? `CPF/CNPJ: ${item.document || item.clientCode}` : "",
    item.companyName || item.clientName ? `Razão Social: ${item.companyName || item.clientName}` : "",
    item.phone || item.contactPhone ? `Telefone: ${item.phone || item.contactPhone}` : "",
    item.email || item.contactEmail ? `E-mail: ${item.email || item.contactEmail}` : ""
  ].filter(Boolean);
  const customLines = snapshotFields
    .filter((field) => field?.active !== false && values[field.id])
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((field) => `${field.label || "Campo"}: ${values[field.id]}`);
  return [
    `=== ${String(project.name || item.projectName || "PROJETO").toLocaleUpperCase("pt-BR")} ===`,
    `Grupo de atendimento: ${SQUAD_LABELS[item.squad] || "Sem grupo"}`,
    `Solicitante: ${item.requesterName || item.requesterEmail || ""}`,
    ...standardLines,
    ...customLines
  ].filter(Boolean).join("\n");
}

function requestCopyText(item) {
  const legacyType = projectLegacyType(projectForItem(item));
  if (legacyType === "cancelamento") return cancellationCopyText(item);
  if (legacyType === "tef_elgin") return tefCopyText(item);
  if (legacyType === "custom") return customProjectCopyText(item);
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
  const item = state.requests.find((request) => request.id === id)
    || state.archivedRequests.find((request) => request.id === id);
  if (!item || !canCopyRequest(item)) return;
  copyText(requestCopyText(item));
}


function switchRequestTab(tab = "details") {
  const showComments = tab === "comments" && !els.requestCommentsTab.disabled;
  const showHistory = tab === "history" && !els.requestHistoryTab.disabled;
  const showDetails = !showComments && !showHistory;
  els.requestDetailsTab.classList.toggle("active", showDetails);
  els.requestCommentsTab.classList.toggle("active", showComments);
  els.requestHistoryTab.classList.toggle("active", showHistory);
  els.requestDetailsTab.setAttribute("aria-selected", String(showDetails));
  els.requestCommentsTab.setAttribute("aria-selected", String(showComments));
  els.requestHistoryTab.setAttribute("aria-selected", String(showHistory));
  els.requestDetailsPanel.hidden = !showDetails;
  els.requestCommentsPanel.hidden = !showComments;
  els.requestHistoryPanel.hidden = !showHistory;
  els.requestDetailsPanel.classList.toggle("active", showDetails);
  els.requestCommentsPanel.classList.toggle("active", showComments);
  els.requestHistoryPanel.classList.toggle("active", showHistory);
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
    await recordHistory(item, "comment", mentionUser ? `Comentário adicionado e ${mentionUser.name || mentionUser.email} notificado.` : "Comentário interno adicionado.", { comment: text.slice(0, 300) });
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
    const haystack = [item.title, item.clientName, item.clientCode, item.requesterName, item.requesterEmail, SQUAD_LABELS[item.squad], projectLabel(item), requestSearchText(item, projectForItem(item))]
      .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return (!term || haystack.includes(term))
      && (state.archivedFilters.type === "all" || projectIdForRequest(item) === state.archivedFilters.type)
      && (state.archivedFilters.squad === "all"
        || (state.archivedFilters.squad === "none" ? !VALID_SQUADS.includes(item.squad) : item.squad === state.archivedFilters.squad));
  }).sort((a, b) => (timestampToDate(b.archivedAt)?.getTime() || 0) - (timestampToDate(a.archivedAt)?.getTime() || 0));
}

function renderArchivedRequests() {
  const items = archivedFilteredRequests();
  els.archivedTableBody.innerHTML = items.map((item) => `
    <tr>
      <td><div class="archived-title"><strong>${escapeHtml(requestCardTitle(item))}</strong><span>${escapeHtml(item.clientName || item.clientCode || "—")}</span></div></td>
      <td><span class="tag ${escapeHtml(projectTagClass(projectIdForRequest(item)))}">${escapeHtml(projectLabel(item) || "Solicitação")}</span></td>
      <td><span class="tag squad">${escapeHtml(SQUAD_LABELS[item.squad] || "Sem grupo")}</span></td>
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
  if (projectLegacyType(projectForItem(item)) === "tef_elgin") {
    data.tefClientName = data.tefClientName || data.clientName || data.tefCnpj || data.clientCode || "Cliente não informado";
    data.tefUsesPix = data.tefUsesPix === true;
    data.tefAdditionalInfo = data.tefUsesPix ? String(data.tefAdditionalInfo || "").slice(0, 1000) : "";
  }
  return data;
}

function openArchiveConfirmation(action, item) {
  if (!isAdmin() || !item) return;
  state.archiveAction = { action, id: item.id };
  const restoring = action === "restore";
  els.archiveConfirmTitle.textContent = restoring ? "Restaurar solicitação?" : "Arquivar solicitação?";
  els.archiveConfirmMessage.textContent = restoring
    ? `A solicitação “${requestCardTitle(item)}” voltará para o Kanban na etapa ${statusLabel(completedStatusFallback())}.`
    : `A solicitação “${requestCardTitle(item)}” sairá do Kanban e ficará disponível no histórico.`;
  els.confirmArchiveButton.textContent = restoring ? "Restaurar solicitação" : "Arquivar solicitação";
  if (!els.archiveConfirmDialog.open) els.archiveConfirmDialog.showModal();
}

async function archiveRequestDocument(item) {
  if (!isAdmin() || !item || !isCompletedStatus(item.status)) throw { code: "permission-denied" };
  const batch = writeBatch(db);
  batch.set(doc(db, "archivedRequests", item.id), {
    ...requestDataWithoutId(item),
    archivedAt: serverTimestamp(),
    archivedByUid: state.user.uid,
    archivedByName: state.profile.name || state.user.email
  });
  batch.delete(doc(db, "requests", item.id));
  await batch.commit();
  await recordHistory(item, "archive", "Solicitação arquivada.", {});
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
    status: completedStatusFallback(),
    columnId: completedStatusFallback(),
    restoredFromArchiveAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: state.profile.name || state.user.email
  });
  batch.delete(doc(db, "archivedRequests", item.id));
  await batch.commit();
  await recordHistory(item, "restore", "Solicitação restaurada para o Kanban.", {});
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
  const eligible = state.requests.filter((item) => isCompletedStatus(item.status)
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
  state.indicatorFilters.squad = els.indicatorSquadFilter.value;
}

function indicatorSourceRequests() {
  const start = state.indicatorFilters.start ? new Date(`${state.indicatorFilters.start}T00:00:00`) : null;
  const end = state.indicatorFilters.end ? new Date(`${state.indicatorFilters.end}T23:59:59.999`) : null;
  return [...state.requests, ...state.archivedRequests].filter((item) => {
    const created = timestampToDate(item.createdAt);
    return created
      && (!start || created >= start)
      && (!end || created <= end)
      && (state.indicatorFilters.type === "all" || projectIdForRequest(item) === state.indicatorFilters.type)
      && (state.indicatorFilters.squad === "all"
        || (state.indicatorFilters.squad === "none" ? !VALID_SQUADS.includes(item.squad) : item.squad === state.indicatorFilters.squad));
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
  const completed = items.filter((item) => isCompletedStatus(item.status) || Boolean(item.archivedAt));
  const blocked = items.filter((item) => isPausedStatus(item.status));
  const durations = completed.map(activeDurationForCompleted).filter((value) => value !== null);
  const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;

  els.indicatorCreated.textContent = items.length;
  els.indicatorCompleted.textContent = completed.length;
  els.indicatorAverageTime.textContent = average === null ? "—" : formatElapsed(average, true);
  els.indicatorBlocked.textContent = blocked.length;
  els.indicatorCompletionRate.textContent = `${items.length ? Math.round((completed.length / items.length) * 100) : 0}%`;
  els.indicatorArchived.textContent = items.filter((item) => Boolean(item.archivedAt)).length;

  const statusEntries = activeKanbanColumns().map((column) => [column.name, items.filter((item) => item.status === column.id).length, column.color]);
  const typeEntries = state.projects.filter((project) => project.status !== "archived").map((project) => [project.name, items.filter((item) => projectIdForRequest(item) === project.id).length, project.legacyType === "cancelamento" ? "red" : project.legacyType === "tef_elgin" ? "amber" : project.legacyType === "custom" ? "purple" : "blue"]);
  els.indicatorStatusBars.innerHTML = reportBarsHtml(statusEntries, items.length);
  els.indicatorTypeBars.innerHTML = reportBarsHtml(typeEntries, items.length);

  const requesterMap = new Map();
  items.forEach((item) => {
    const key = item.assigneeUid || item.requesterUid || item.requesterEmail || "sem-solicitante";
    if (!requesterMap.has(key)) requesterMap.set(key, { name: item.assigneeName || item.requesterName || item.requesterEmail || "Não identificado", total: 0, completed: 0, open: 0, blocked: 0, durations: [] });
    const entry = requesterMap.get(key);
    entry.total += 1;
    if (isCompletedStatus(item.status) || item.archivedAt) { entry.completed += 1; const duration = activeDurationForCompleted(item); if (duration !== null) entry.durations.push(duration); }
    else entry.open += 1;
    if (isPausedStatus(item.status)) entry.blocked += 1;
  });
  const requesterRows = [...requesterMap.values()].sort((a, b) => b.total - a.total);
  els.indicatorRequesterTable.innerHTML = requesterRows.length
    ? requesterRows.map((entry) => { const avg = entry.durations.length ? entry.durations.reduce((a,b)=>a+b,0)/entry.durations.length : null; return `<tr><td><strong>${escapeHtml(entry.name)}</strong></td><td>${entry.total}</td><td>${entry.completed}</td><td>${entry.open}</td><td>${entry.blocked}</td><td>${avg === null ? "—" : formatElapsed(avg, true)}</td></tr>`; }).join("")
    : `<tr><td colspan="6" class="report-empty-row">Nenhuma solicitação no período selecionado.</td></tr>`;
  renderExpandedIndicators(items, completed);
}
function configurePasswordDialog(recoveryMode = false) {
  state.passwordRecoveryMode = Boolean(recoveryMode);
  els.changePasswordDialog.dataset.recoveryMode = state.passwordRecoveryMode ? "true" : "false";
  els.changePasswordEyebrow.textContent = state.passwordRecoveryMode ? "RECUPERAÇÃO" : "MINHA CONTA";
  els.changePasswordTitle.textContent = state.passwordRecoveryMode ? "Criar nova senha" : "Alterar senha";
  els.changePasswordHelp.textContent = state.passwordRecoveryMode
    ? "Defina uma nova senha para concluir a recuperação da sua conta. Não é necessário informar a senha anterior."
    : "Confirme sua senha atual e defina uma nova senha. A alteração é feita imediatamente, sem envio de e-mail.";
  els.currentPasswordField.hidden = state.passwordRecoveryMode;
  els.currentPassword.required = !state.passwordRecoveryMode;
  if (els.changePasswordCaptcha) els.changePasswordCaptcha.hidden = state.passwordRecoveryMode || !CAPTCHA_ENABLED;
  els.changePasswordClose.hidden = state.passwordRecoveryMode;
  els.changePasswordCancel.hidden = state.passwordRecoveryMode;
  els.saveNewPasswordButton.textContent = state.passwordRecoveryMode ? "Salvar nova senha" : "Alterar senha";
}

function openPasswordDialog(recoveryMode = false) {
  els.changePasswordForm.reset();
  showFormError(els.changePasswordError);
  [els.currentPassword, els.newPassword, els.confirmNewPassword].forEach((input) => { input.type = "password"; });
  configurePasswordDialog(recoveryMode);
  if (!els.changePasswordDialog.open) els.changePasswordDialog.showModal();
  if (!recoveryMode) ensureCaptchaWidget("changePassword");
  window.setTimeout(() => (recoveryMode ? els.newPassword : els.currentPassword).focus(), 50);
}

async function changeCurrentUserPassword(event) {
  event.preventDefault();
  showFormError(els.changePasswordError);

  const recoveryMode = state.passwordRecoveryMode;
  const currentPassword = els.currentPassword.value;
  const newPassword = els.newPassword.value;
  const confirmation = els.confirmNewPassword.value;

  if ((!recoveryMode && !currentPassword) || !newPassword || !confirmation) {
    showFormError(els.changePasswordError, "Preencha todos os campos.");
    return;
  }
  const passwordError = passwordPolicyError(newPassword);
  if (passwordError) {
    showFormError(els.changePasswordError, passwordError);
    return;
  }
  if (newPassword !== confirmation) {
    showFormError(els.changePasswordError, "A confirmação da nova senha não confere.");
    return;
  }
  if (!recoveryMode && currentPassword === newPassword) {
    showFormError(els.changePasswordError, "A nova senha precisa ser diferente da senha atual.");
    return;
  }
  if (!auth.currentUser?.email) {
    showFormError(els.changePasswordError, "Não foi possível identificar o usuário conectado.");
    return;
  }

  const captchaToken = recoveryMode ? "" : requireCaptchaToken("changePassword", els.changePasswordError);
  if (!recoveryMode && CAPTCHA_ENABLED && !captchaToken) return;

  setButtonLoading(els.saveNewPasswordButton, true, recoveryMode ? "Salvando..." : "Alterando...");
  try {
    if (!recoveryMode) {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential, captchaToken);
    }
    const recoveredEmail = auth.currentUser.email;
    await updatePassword(auth.currentUser, newPassword);
    try {
      await logAccessEvent(
        recoveryMode ? "password_recovered" : "password_changed",
        recoveryMode ? "Senha redefinida pelo link de recuperação." : "Senha alterada pelo próprio usuário."
      );
    } catch (logError) {
      console.warn("Não foi possível registrar a alteração de senha.", logError);
    }
    els.changePasswordForm.reset();
    configurePasswordDialog(false);
    closeModal(els.changePasswordDialog);

    if (recoveryMode) {
      els.loginEmail.value = recoveredEmail;
      els.rememberEmail.checked = false;
      await secureSignOut({ log: false });
      showToast("Senha redefinida com sucesso. Entre novamente usando a nova senha.");
    } else {
      showToast("Senha alterada com sucesso.");
    }
  } catch (error) {
    console.error(error);
    const message = !recoveryMode && ["auth/invalid-credential", "auth/wrong-password"].includes(error?.code)
      ? "A senha atual está incorreta."
      : firebaseErrorMessage(error);
    showFormError(els.changePasswordError, message);
  } finally {
    if (!recoveryMode) resetCaptcha("changePassword");
    setButtonLoading(els.saveNewPasswordButton, false);
    els.saveNewPasswordButton.textContent = state.passwordRecoveryMode ? "Salvar nova senha" : "Alterar senha";
  }
}


function applyFilters() {
  state.filters.search = els.searchInput.value.trim();
  state.filters.type = els.typeFilter.value;
  state.filters.priority = els.priorityFilter.value;
  state.filters.squad = els.squadFilter.value;
  state.filters.requester = els.requesterFilter.value;
  renderBoard();
}

function clearFilters() {
  els.searchInput.value = "";
  els.typeFilter.value = "all";
  els.priorityFilter.value = "all";
  els.squadFilter.value = defaultSquadFilterValue();
  els.requesterFilter.value = "all";
  state.filters = { search: "", type: "all", priority: "all", squad: defaultSquadFilterValue(), requester: "all" };
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

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyLegalDocumentIntegrity() {
  const response = await fetch(`${legalPolicyConfig.contentUrl}?integrity=${encodeURIComponent(legalPolicyConfig.version)}`, {
    cache: "no-store",
    credentials: "same-origin"
  });
  if (!response.ok) throw new Error("legal-document-unavailable");
  const content = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", content);
  const actualHash = bytesToHex(digest);
  if (actualHash !== legalPolicyConfig.documentHash) {
    const error = new Error("legal-document-integrity-failed");
    error.code = "legal-document-integrity-failed";
    throw error;
  }
  state.legalDocumentVerified = true;
}

function updateLegalAcceptButton() {
  if (!els.acceptLegalTermsButton) return;
  const allChecked = els.legalTermsRead.checked
    && els.legalTermsConfidentiality.checked
    && els.legalTermsMonitoring.checked;
  els.acceptLegalTermsButton.disabled = !state.legalRequiredMode
    || !state.legalDocumentVerified
    || !state.legalScrollReached
    || !allChecked
    || state.legalAcceptanceInProgress;
}

function markLegalScrollReached() {
  if (state.legalScrollReached) return;
  state.legalScrollReached = true;
  [els.legalTermsRead, els.legalTermsConfidentiality, els.legalTermsMonitoring].forEach((input) => {
    input.disabled = false;
  });
  els.legalTermsScrollHint.textContent = "Leitura concluída. Confirme as declarações para aceitar.";
  els.legalTermsScrollHint.classList.add("ready");
  updateLegalAcceptButton();
}

function checkLegalDocumentScroll() {
  if (!state.legalRequiredMode || state.legalScrollReached) return;
  try {
    const documentElement = els.legalTermsFrame.contentDocument?.scrollingElement
      || els.legalTermsFrame.contentDocument?.documentElement;
    if (!documentElement) return;
    const remaining = documentElement.scrollHeight - documentElement.scrollTop - documentElement.clientHeight;
    if (remaining <= 28 || documentElement.scrollHeight <= documentElement.clientHeight + 28) {
      markLegalScrollReached();
    }
  } catch (error) {
    console.warn("Não foi possível acompanhar a leitura do termo.", error);
  }
}

async function prepareLegalTermsDialog({ required = false, status = null } = {}) {
  state.legalRequiredMode = required;
  state.legalStatus = status || state.legalStatus;
  state.legalDocumentVerified = false;
  state.legalScrollReached = !required;
  state.legalAcceptanceInProgress = false;
  els.legalTermsDialog.dataset.legalRequired = required ? "true" : "false";
  els.legalTermsTitle.textContent = legalPolicyConfig.title;
  els.legalTermsVersion.textContent = `Versão ${legalPolicyConfig.version} · vigência em ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${legalPolicyConfig.effectiveDate}T12:00:00`))}`;
  els.legalTermsRequiredActions.hidden = !required;
  els.legalTermsReviewActions.hidden = required;
  els.closeLegalTerms.hidden = required;
  showFormError(els.legalTermsError);
  [els.legalTermsRead, els.legalTermsConfidentiality, els.legalTermsMonitoring].forEach((input) => {
    input.checked = false;
    input.disabled = required;
  });
  els.legalTermsScrollHint.textContent = "Role o documento até o final para liberar o aceite.";
  els.legalTermsScrollHint.classList.remove("ready");
  updateLegalAcceptButton();

  const currentStatus = state.legalStatus || {};
  if (required && (
    currentStatus.version !== legalPolicyConfig.version
    || currentStatus.documentHash !== legalPolicyConfig.documentHash
  )) {
    const error = new Error("legal-document-outdated");
    error.code = "legal-document-outdated";
    throw error;
  }

  await verifyLegalDocumentIntegrity();
  els.legalTermsFrame.src = `${legalPolicyConfig.contentUrl}?v=${encodeURIComponent(legalPolicyConfig.version)}`;
}

async function openLegalTermsDialog({ required = false, status = null } = {}) {
  try {
    await prepareLegalTermsDialog({ required, status });
    if (!els.legalTermsDialog.open) els.legalTermsDialog.showModal();
    updateLegalAcceptButton();
  } catch (error) {
    console.error(error);
    if (required) throw error;
    showToast("Não foi possível abrir a política de uso.", "error");
  }
}

async function submitLegalAcceptance() {
  if (!state.legalRequiredMode || els.acceptLegalTermsButton.disabled || state.legalAcceptanceInProgress) return;
  state.legalAcceptanceInProgress = true;
  setButtonLoading(els.acceptLegalTermsButton, true, "Registrando aceite...");
  showFormError(els.legalTermsError);
  try {
    const result = await acceptLegalTerms(auth, {
      version: legalPolicyConfig.version,
      documentHash: legalPolicyConfig.documentHash,
      userAgent: navigator.userAgent
    });
    state.legalStatus = result;
    if (state.profile) {
      state.profile.termsAcceptedVersion = result.version;
      state.profile.termsAcceptedHash = result.documentHash;
      state.profile.termsAcceptedAt = result.acceptedAt;
    }
    closeModal(els.legalTermsDialog);
    showToast("Termo aceito e registrado com sucesso.");
    await handleAuthenticated(state.user, { skipMfaCheck: true, skipLegalCheck: true });
  } catch (error) {
    console.error(error);
    showFormError(els.legalTermsError, firebaseErrorMessage(error));
  } finally {
    state.legalAcceptanceInProgress = false;
    setButtonLoading(els.acceptLegalTermsButton, false);
    updateLegalAcceptButton();
  }
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
  ensureCaptchaWidget("login");
}

function showInviteCard() {
  els.loginForm.hidden = true;
  els.inviteRegistrationForm.hidden = false;
  ensureCaptchaWidget("invite");
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
    if (els.inviteRegistrationSquadWrap) els.inviteRegistrationSquadWrap.hidden = invite.role !== "solicitante";
    if (els.inviteRegistrationSquad) els.inviteRegistrationSquad.textContent = SQUAD_LABELS[invite.squad] || "—";
    els.inviteLoading.hidden = true;
    els.inviteRegistrationFields.hidden = false;
    await ensureCaptchaWidget("invite");
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
  const passwordError = passwordPolicyError(password);
  if (passwordError) {
    showFormError(els.inviteRegistrationError, passwordError);
    return;
  }
  if (password !== confirmation) {
    showFormError(els.inviteRegistrationError, "As senhas informadas não são iguais.");
    return;
  }

  const captchaToken = requireCaptchaToken("invite", els.inviteRegistrationError);
  if (CAPTCHA_ENABLED && !captchaToken) return;

  setButtonLoading(els.inviteRegistrationButton, true, "Criando acesso...");
  state.inviteRegistrationInProgress = true;
  let createdUser = null;
  try {
    await setPersistence(auth, browserLocalPersistence);
    const credential = await createUserWithEmailAndPassword(auth, invite.email, password, captchaToken);
    createdUser = credential.user;
    const batch = writeBatch(db);
    batch.set(doc(db, "users", createdUser.uid), {
      name: invite.name,
      email: invite.email,
      role: invite.role,
      squad: invite.role === "solicitante" ? invite.squad : "",
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
    resetCaptcha("invite");
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
        <td><span class="tag squad">${escapeHtml(entry.role === "admin" ? "Todos" : (SQUAD_LABELS[entry.squad] || "Sem grupo"))}</span></td>
        <td><span class="user-status-badge pending">● Convite pendente</span></td>
        <td><span class="user-status-badge pending">Aguardando cadastro</span></td>
        <td><div class="user-date">—</div></td>
        <td><div class="user-date">Criado em ${escapeHtml(formatDateTime(entry.createdAt))}<br>Expira em ${escapeHtml(formatDateTime(entry.expiresAt))}</div></td>
        <td><div class="user-actions"><button class="user-action-button primary" type="button" data-user-action="copy-invite" data-id="${escapeHtml(entry.id)}">⧉ Copiar convite</button><button class="user-action-button danger" type="button" data-user-action="cancel-invite" data-id="${escapeHtml(entry.id)}">Cancelar convite</button></div></td>
      </tr>`;
  }
  const active = entry.active !== false;
  const locked = entry.accessLocked === true;
  const isSelf = entry.uid === state.user?.uid;
  const statusText = !active ? "Inativo" : locked ? "Bloqueado" : "Ativo";
  const statusClass = !active ? "inactive" : locked ? "pending" : "active";
  const acceptedCurrentTerms = entry.termsAcceptedVersion === legalPolicyConfig.version
    && entry.termsAcceptedHash === legalPolicyConfig.documentHash;
  const termsStatusText = acceptedCurrentTerms ? "Aceito" : "Pendente";
  const termsStatusClass = acceptedCurrentTerms ? "active" : "pending";
  return `
    <tr>
      <td><div class="user-identity"><div class="user-list-avatar">${escapeHtml(initials(entry.name || entry.email))}</div><div><strong>${escapeHtml(entry.name || "Usuário")}${isSelf ? " (você)" : ""}</strong><span>${escapeHtml(entry.email || "")}</span></div></div></td>
      <td><span class="user-role-badge ${escapeHtml(entry.role)}">${escapeHtml(roleLabel(entry.role))}</span></td>
      <td><span class="tag squad">${escapeHtml(entry.role === "admin" ? "Todos" : (SQUAD_LABELS[entry.squad] || "Sem grupo"))}</span></td>
      <td><span class="user-status-badge ${statusClass}">● ${statusText}</span></td>
      <td><span class="user-status-badge ${termsStatusClass}" title="${acceptedCurrentTerms ? `Aceito em ${escapeHtml(formatDateTime(entry.termsAcceptedAt))}` : `Versão exigida: ${escapeHtml(legalPolicyConfig.version)}`}">${termsStatusText}</span></td>
      <td><div class="user-date">${escapeHtml(formatDateTime(entry.lastLoginAt))}<br><small>${Number(entry.loginCount || 0)} acesso(s)</small></div></td>
      <td><div class="user-date">${escapeHtml(formatDateTime(entry.createdAt))}</div></td>
      <td><div class="user-actions">
        <button class="user-action-button" type="button" data-user-action="edit-user" data-id="${escapeHtml(entry.uid)}">Editar</button>
        <button class="user-action-button" type="button" data-user-action="reset-password" data-id="${escapeHtml(entry.uid)}">Redefinir senha</button>
        <button class="user-action-button ${locked ? "success" : ""}" type="button" data-user-action="toggle-lock" data-id="${escapeHtml(entry.uid)}" ${isSelf ? "disabled" : ""}>${locked ? "Desbloquear" : "Bloquear"}</button>
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

function setKanbanFocusMode(active) {
  const enabled = Boolean(active) && state.currentView === "kanban";

  // A visualização ampliada é exclusiva para acompanhamento do Kanban.
  // Ao entrar nela, encerra ações em massa e remove qualquer seleção anterior.
  if (enabled && state.bulkMode) {
    state.bulkMode = false;
    state.bulkSelected.clear();
    updateBulkBar();
    renderBoard();
  }

  document.body.classList.toggle("kanban-focus-mode", enabled);
  if (els.kanbanFocusHeader) els.kanbanFocusHeader.hidden = !enabled;
  if (els.expandKanbanButton) els.expandKanbanButton.setAttribute("aria-pressed", String(enabled));
}


function closeSensitiveAuthorization(approved = false) {
  const resolve = state.sensitiveAuthorizationResolve;
  state.sensitiveAuthorizationResolve = null;
  state.sensitiveAuthorizationReject = null;
  els.reauthForm?.reset();
  showFormError(els.reauthError);
  if (els.reauthDialog?.open) closeModal(els.reauthDialog);
  resetCaptcha("reauth");
  if (resolve) resolve(Boolean(approved));
}

function ensureSensitiveAuthorization(reason = "Esta ação acessa informações sensíveis.") {
  if (!isAdmin() || !auth.currentUser?.email) return Promise.resolve(false);
  if (Date.now() < state.sensitiveAuthorizationUntil) return Promise.resolve(true);
  if (state.sensitiveAuthorizationResolve) return Promise.resolve(false);

  els.reauthReason.textContent = reason;
  els.reauthPassword.value = "";
  showFormError(els.reauthError);
  if (!els.reauthDialog.open) els.reauthDialog.showModal();
  ensureCaptchaWidget("reauth");
  window.setTimeout(() => els.reauthPassword.focus(), 50);
  return new Promise((resolve, reject) => {
    state.sensitiveAuthorizationResolve = resolve;
    state.sensitiveAuthorizationReject = reject;
  });
}

async function submitSensitiveAuthorization(event) {
  event.preventDefault();
  showFormError(els.reauthError);
  const password = els.reauthPassword.value;
  if (!password) {
    showFormError(els.reauthError, "Informe sua senha atual.");
    return;
  }
  const captchaToken = requireCaptchaToken("reauth", els.reauthError);
  if (CAPTCHA_ENABLED && !captchaToken) return;
  setButtonLoading(els.reauthConfirmButton, true, "Confirmando...");
  try {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
    await reauthenticateWithCredential(auth.currentUser, credential, captchaToken);
    state.sensitiveAuthorizationUntil = Date.now() + SENSITIVE_AUTHORIZATION_MS;
    await logAccessEvent("sensitive_reauthentication", "Identidade confirmada para uma ação administrativa sensível.");
    closeSensitiveAuthorization(true);
  } catch (error) {
    console.error(error);
    showFormError(els.reauthError, ["auth/invalid-credential", "auth/wrong-password"].includes(error?.code)
      ? "A senha atual está incorreta."
      : firebaseErrorMessage(error));
  } finally {
    resetCaptcha("reauth");
    setButtonLoading(els.reauthConfirmButton, false);
  }
}

function verifiedTotpFactor(factors) {
  const candidates = factors?.totp?.length
    ? factors.totp
    : (factors?.all || []).filter((factor) => factor.factor_type === "totp" || factor.factorType === "totp");
  return candidates.find((factor) => factor.status === "verified") || null;
}

async function refreshMfaStatus() {
  if (!state.user || !isAdmin()) return;
  try {
    const [factors, aal] = await Promise.all([listMfaFactors(auth), getMfaAssuranceLevel(auth)]);
    const verified = verifiedTotpFactor(factors);
    state.mfaVerifiedFactorId = verified?.id || "";
    state.mfaStatusLoaded = true;
    if (verified) {
      const currentLevel = aal?.currentLevel || aal?.current_level || "aal1";
      els.mfaStatusText.textContent = currentLevel === "aal2"
        ? "MFA ativo e validado nesta sessão."
        : "MFA ativo. Um código será solicitado para concluir o acesso.";
      els.configureMfaButton.hidden = true;
      els.removeMfaButton.hidden = false;
    } else {
      els.mfaStatusText.textContent = "MFA ainda não foi configurado nesta conta administrativa.";
      els.configureMfaButton.hidden = false;
      els.removeMfaButton.hidden = true;
    }
  } catch (error) {
    console.error(error);
    els.mfaStatusText.textContent = "Não foi possível consultar o estado do MFA.";
  }
}

async function ensureMfaChallengeBeforeApp() {
  if (!auth.currentUser) return false;
  try {
    const [factors, aal] = await Promise.all([listMfaFactors(auth), getMfaAssuranceLevel(auth)]);
    const verified = verifiedTotpFactor(factors);
    state.mfaVerifiedFactorId = verified?.id || "";
    const currentLevel = aal?.currentLevel || aal?.current_level || null;
    const nextLevel = aal?.nextLevel || aal?.next_level || null;
    if (!verified || currentLevel === "aal2" || nextLevel !== "aal2") return true;

    state.mfaChallengeFactorId = verified.id;
    finishAuthBootstrap();
    els.appView.hidden = true;
    els.loginView.hidden = false;
    showFormError(els.mfaChallengeError);
    els.mfaChallengeCode.value = "";
    if (!els.mfaChallengeDialog.open) els.mfaChallengeDialog.showModal();
    window.setTimeout(() => els.mfaChallengeCode.focus(), 50);
    return false;
  } catch (error) {
    console.error(error);
    state.forcedLogoutMessage = "Não foi possível validar o segundo fator de autenticação.";
    await secureSignOut({ log: false });
    return false;
  }
}

async function submitMfaChallenge(event) {
  event.preventDefault();
  if (state.mfaChallengeInProgress) return;
  const code = els.mfaChallengeCode.value.replace(/\D/g, "");
  if (code.length !== 6 || !state.mfaChallengeFactorId) {
    showFormError(els.mfaChallengeError, "Informe o código de seis dígitos do aplicativo autenticador.");
    return;
  }
  state.mfaChallengeInProgress = true;
  setButtonLoading(els.verifyMfaChallengeButton, true, "Verificando...");
  try {
    const challenge = await challengeMfaFactor(auth, state.mfaChallengeFactorId);
    await verifyMfaFactor(auth, state.mfaChallengeFactorId, challenge.id, code);
    closeModal(els.mfaChallengeDialog);
    state.mfaChallengeFactorId = "";
    await logAccessEvent("mfa_verified", "Segundo fator validado no acesso.");
    await handleAuthenticated(auth.currentUser, { skipMfaCheck: true });
  } catch (error) {
    console.error(error);
    showFormError(els.mfaChallengeError, "Código inválido ou expirado. Gere um novo código e tente novamente.");
    els.mfaChallengeCode.select();
  } finally {
    state.mfaChallengeInProgress = false;
    setButtonLoading(els.verifyMfaChallengeButton, false);
  }
}

async function openMfaEnrollment() {
  if (!isAdmin()) return;
  const authorized = await ensureSensitiveAuthorization("Confirme sua senha para vincular um aplicativo autenticador à sua conta.");
  if (!authorized) return;
  showFormError(els.mfaEnrollmentError);
  els.mfaEnrollmentForm.reset();
  setButtonLoading(els.configureMfaButton, true, "Preparando...");
  try {
    const enrollment = await enrollMfaTotp(auth, securityConfig.mfaFriendlyName || "Painel de Solicitações");
    state.mfaEnrollmentFactorId = enrollment.id;
    const totp = enrollment.totp || {};
    els.mfaQrCode.src = totp.qr_code || totp.qrCode || "";
    els.mfaSecretCode.textContent = totp.secret || "";
    if (!els.mfaEnrollmentDialog.open) els.mfaEnrollmentDialog.showModal();
    window.setTimeout(() => els.mfaEnrollmentCode.focus(), 50);
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  } finally {
    setButtonLoading(els.configureMfaButton, false);
  }
}

async function cancelMfaEnrollment() {
  const factorId = state.mfaEnrollmentFactorId;
  state.mfaEnrollmentFactorId = "";
  if (els.mfaEnrollmentDialog.open) closeModal(els.mfaEnrollmentDialog);
  if (factorId) {
    try { await unenrollMfaFactor(auth, factorId); } catch (error) { console.warn("Fator não confirmado não pôde ser removido.", error); }
  }
}

async function submitMfaEnrollment(event) {
  event.preventDefault();
  const factorId = state.mfaEnrollmentFactorId;
  const code = els.mfaEnrollmentCode.value.replace(/\D/g, "");
  if (!factorId || code.length !== 6) {
    showFormError(els.mfaEnrollmentError, "Informe o código de seis dígitos do aplicativo autenticador.");
    return;
  }
  setButtonLoading(els.verifyMfaEnrollmentButton, true, "Ativando...");
  try {
    const challenge = await challengeMfaFactor(auth, factorId);
    await verifyMfaFactor(auth, factorId, challenge.id, code);
    state.mfaEnrollmentFactorId = "";
    closeModal(els.mfaEnrollmentDialog);
    await logAccessEvent("mfa_enabled", "Autenticação em duas etapas ativada.");
    await refreshMfaStatus();
    showToast("Autenticação em duas etapas ativada com sucesso.");
  } catch (error) {
    console.error(error);
    showFormError(els.mfaEnrollmentError, "Código inválido ou expirado. Confira o aplicativo e tente novamente.");
  } finally {
    setButtonLoading(els.verifyMfaEnrollmentButton, false);
  }
}

async function removeMfa() {
  if (!isAdmin() || !state.mfaVerifiedFactorId) return;
  const authorized = await ensureSensitiveAuthorization("Confirme sua senha para remover a autenticação em duas etapas.");
  if (!authorized) return;
  if (!window.confirm("Remover o segundo fator desta conta? A sessão será encerrada após a alteração.")) return;
  setButtonLoading(els.removeMfaButton, true, "Removendo...");
  try {
    await unenrollMfaFactor(auth, state.mfaVerifiedFactorId);
    await logAccessEvent("mfa_disabled", "Autenticação em duas etapas removida.");
    state.forcedLogoutMessage = "MFA removido. Entre novamente para continuar.";
    await secureSignOut({ log: false });
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  } finally {
    setButtonLoading(els.removeMfaButton, false);
  }
}

async function switchAppView(view = "kanban") {
  if (["users", "indicators", "archived", "security", "projects", "columns"].includes(view) && !isAdmin()) view = "kanban";
  state.currentView = view;
  if (view !== "kanban") setKanbanFocusMode(false);
  els.kanbanView.hidden = view !== "kanban";
  els.usersView.hidden = view !== "users";
  els.indicatorsView.hidden = view !== "indicators";
  els.archivedView.hidden = view !== "archived";
  els.securityView.hidden = view !== "security";
  els.projectsView.hidden = view !== "projects";
  els.columnsView.hidden = view !== "columns";
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
  if (view === "projects") { await loadArchivedRequests(); renderProjectsAdmin(); }
  if (view === "columns") { await loadArchivedRequests(); renderColumnsAdmin(); }
  if (view === "security") await Promise.all([loadAccessLogs(), refreshMfaStatus()]);
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
  els.userInviteSquad.value = "";
  updateUserSquadFieldVisibility(els.userInviteRole, els.userInviteSquadField, els.userInviteSquad);
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
  const squad = role === "solicitante" && VALID_SQUADS.includes(els.userInviteSquad.value) ? els.userInviteSquad.value : "";

  if (!name || !email) {
    showFormError(els.userInviteError, "Preencha nome e e-mail.");
    return;
  }
  if (role === "solicitante" && !squad) {
    showFormError(els.userInviteError, "Selecione o grupo do solicitante.");
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

  const authorized = await ensureSensitiveAuthorization("Confirme sua senha para criar um novo acesso ao painel.");
  if (!authorized) return;

  setButtonLoading(els.createUserInviteButton, true, "Gerando...");
  try {
    const token = generateInviteToken();
    const expirationDate = new Date(Date.now() + INVITE_VALID_DAYS * 86400000);
    await setDoc(doc(db, "userInvites", token), {
      name,
      email,
      role,
      squad,
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
    await logAccessEvent("user_invite_created", `Convite criado para ${email} com perfil ${role}${squad ? ` e ${SQUAD_LABELS[squad]}` : ""}.`);
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
  els.editUserSquad.value = VALID_SQUADS.includes(user.squad) ? user.squad : "";
  els.editUserRole.disabled = isSelf;
  updateUserSquadFieldVisibility(els.editUserRole, els.editUserSquadField, els.editUserSquad);
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
  const squad = role === "solicitante" && VALID_SQUADS.includes(els.editUserSquad.value) ? els.editUserSquad.value : "";
  if (!name || !VALID_USER_ROLES.includes(role)) {
    showFormError(els.editUserError, "Informe um nome e um perfil válidos.");
    return;
  }
  if (role === "solicitante" && !squad) {
    showFormError(els.editUserError, "Selecione o grupo do solicitante.");
    return;
  }

  const authorized = await ensureSensitiveAuthorization("Confirme sua senha para alterar o perfil ou o grupo deste usuário.");
  if (!authorized) return;

  setButtonLoading(els.saveUserButton, true, "Salvando...");
  try {
    await updateDoc(doc(db, "users", uid), {
      name,
      role,
      squad,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    });
    closeModal(els.editUserDialog);
    await logAccessEvent("user_profile_updated", `Perfil de ${user.email || uid} atualizado para ${role}${squad ? ` / ${SQUAD_LABELS[squad]}` : ""}.`);
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
  const authorized = await ensureSensitiveAuthorization(`Confirme sua senha para ${active ? "reativar" : "desativar"} este usuário.`);
  if (!authorized) return;
  setButtonLoading(els.confirmUserStatusButton, true, active ? "Reativando..." : "Desativando...");
  try {
    await updateDoc(doc(db, "users", uid), {
      active,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    });
    closeModal(els.userStatusDialog);
    await logAccessEvent(active ? "user_reactivated" : "user_deactivated", `${user.email || uid} foi ${active ? "reativado" : "desativado"}.`);
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
  const authorized = await ensureSensitiveAuthorization("Confirme sua senha para iniciar a redefinição de senha deste usuário.");
  if (!authorized) return;
  if (CAPTCHA_ENABLED) {
    els.resetEmail.value = user.email;
    showFormError(els.resetError);
    els.resetDialog.showModal();
    await ensureCaptchaWidget("reset");
    showToast("Conclua a verificação de segurança para enviar o link.");
    return;
  }
  try {
    auth.languageCode = "pt-BR";
    await sendPasswordResetEmail(auth, user.email);
    await logAccessEvent("password_reset_sent", `Redefinição enviada para ${user.email}.`);
    showToast(`Link de redefinição enviado para ${user.email}.`);
  } catch (error) {
    console.error(error);
    showToast(firebaseErrorMessage(error), "error");
  }
}

async function cancelInvite(id) {
  const invite = state.invites.find((entry) => entry.id === id);
  if (!isAdmin() || !invite) return;
  const authorized = await ensureSensitiveAuthorization("Confirme sua senha para cancelar este convite de acesso.");
  if (!authorized) return;
  try {
    await updateDoc(doc(db, "userInvites", id), {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledByUid: state.user.uid
    });
    await logAccessEvent("user_invite_cancelled", `Convite cancelado para ${invite.email || id}.`);
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
  if (userAction === "toggle-lock") toggleUserAccessLock(id);
  if (userAction === "copy-invite") copyText(buildInviteUrl(id));
  if (userAction === "cancel-invite") cancelInvite(id);
}

function subscribeCurrentProfile() {
  if (state.unsubscribeProfile) state.unsubscribeProfile();
  if (!state.user) return;
  state.unsubscribeProfile = onSnapshot(doc(db, "users", state.user.uid), async (snapshot) => {
    if (!snapshot.exists() || snapshot.data().active !== true || snapshot.data().accessLocked === true) {
      state.forcedLogoutMessage = snapshot.data()?.accessLocked === true ? "Seu acesso foi temporariamente bloqueado por um administrador." : "Seu acesso foi desativado por um administrador.";
      secureSignOut({ log: false });
      return;
    }
    const previousRole = state.profile?.role;
    const previousSquad = state.profile?.squad;
    const previousPreference = state.profile?.preferredSquadFilter;
    state.profile = { uid: snapshot.id, ...snapshot.data() };
    if (!userHasValidSquad(state.profile)) {
      state.forcedLogoutMessage = "Seu grupo de atendimento ainda não foi atribuído. Procure um administrador.";
      secureSignOut({ log: false });
      return;
    }
    renderUser();
    const accessChanged = previousRole && (previousRole !== state.profile.role || previousSquad !== state.profile.squad);
    const preferenceChanged = isAdmin() && previousPreference !== state.profile.preferredSquadFilter;
    if (accessChanged || preferenceChanged) configureSquadFilter({ preserveSelection: !preferenceChanged });
    if (accessChanged) {
      if (!isAdmin() && ["users", "indicators", "archived", "security", "projects", "columns"].includes(state.currentView)) switchAppView("kanban");
      await loadUsers();
      subscribeRequests();
    }
  }, (error) => {
    console.error(error);
    state.forcedLogoutMessage = "Seu acesso não está mais disponível.";
    secureSignOut({ log: false });
  });
}


function historyEntryData(item, action, summary, details = {}) {
  return {
    requestId: item.id,
    requestTitle: requestCardTitle(item).slice(0, 140),
    requestType: projectIdForRequest(item),
    action,
    summary: sanitizeText(summary).slice(0, 500),
    details,
    actorUid: state.user?.uid || "",
    actorName: state.profile?.name || state.user?.email || "Sistema",
    actorEmail: state.user?.email || "",
    createdAt: serverTimestamp()
  };
}

async function recordHistory(item, action, summary, details = {}) {
  if (!item?.id || !state.user) return;
  try {
    await setDoc(doc(collection(db, "requestHistory")), historyEntryData(item, action, summary, details));
  } catch (error) {
    console.warn("Não foi possível registrar o histórico.", error);
  }
}

function renderRequestHistory() {
  const entries = [...state.currentHistory].sort((a, b) =>
    (timestampToDate(b.createdAt)?.getTime() || 0) - (timestampToDate(a.createdAt)?.getTime() || 0));
  els.requestHistoryCount.textContent = String(entries.length);
  if (!entries.length) {
    els.requestHistoryList.innerHTML = `<div class="comments-empty"><strong>Nenhuma alteração registrada.</strong><span>Novas ações aparecerão aqui automaticamente.</span></div>`;
    return;
  }
  const icons = { create: "+", update: "✎", status: "↔", comment: "💬", crm: "✓", archive: "▣", restore: "↶", bulk: "☑", attachment: "📎" };
  els.requestHistoryList.innerHTML = entries.map((entry) => `
    <article class="history-item">
      <div class="history-icon">${escapeHtml(icons[entry.action] || "•")}</div>
      <div class="history-copy"><header><strong>${escapeHtml(entry.actorName || "Sistema")}</strong><span>${escapeHtml(formatDateTime(entry.createdAt))}</span></header><p>${escapeHtml(entry.summary || "Alteração registrada.")}</p></div>
    </article>`).join("");
}

function subscribeRequestHistory(requestId) {
  if (state.unsubscribeHistory) state.unsubscribeHistory();
  state.currentHistory = [];
  renderRequestHistory();
  state.unsubscribeHistory = onSnapshot(
    query(collection(db, "requestHistory"), where("requestId", "==", requestId)),
    (snapshot) => {
      state.currentHistory = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }));
      renderRequestHistory();
    },
    (error) => console.warn("Histórico indisponível.", error)
  );
}

function describeRequestChanges(existing, payload) {
  const changes = [];
  const details = {};
  const fields = [
    ["title", "Título"], ["clientName", "Cliente"], ["clientCode", "CNPJ"],
    ["priority", "Prioridade"], ["squad", "Grupo de atendimento"], ["status", "Status"], ["assigneeUid", "Responsável"],
    ["description", "Descrição"], ["currentBehavior", "Comportamento atual"],
    ["expectedBehavior", "Comportamento esperado"], ["justification", "Justificativa"],
    ["tefClientName", "Razão Social do TEF"], ["tefUsesPix", "Uso de PIX"],
    ["tefAdditionalInfo", "Informações adicionais do PIX"]
  ];
  fields.forEach(([key, label]) => {
    if (!(key in payload)) return;
    const before = existing?.[key] ?? "";
    const after = payload?.[key] ?? "";
    if (String(before) !== String(after)) {
      changes.push(label);
      details[key] = { before: String(before).slice(0, 300), after: String(after).slice(0, 300) };
    }
  });

  if ("customFieldValues" in payload) {
    const beforeValues = existing?.customFieldValues || {};
    const afterValues = payload.customFieldValues || {};
    const schema = projectSnapshotForRequest(existing || payload);
    const customFields = Array.isArray(schema?.customFields) ? schema.customFields : [];
    const changedCustomFields = customFields.filter((field) => {
      const before = String(beforeValues[field.id] ?? "");
      const after = String(afterValues[field.id] ?? "");
      return before !== after;
    });
    if (changedCustomFields.length) {
      changes.push(`Campos do projeto (${changedCustomFields.map((field) => field.label).join(", ")})`);
      details.customFieldValues = Object.fromEntries(changedCustomFields.map((field) => [field.id, {
        label: field.label,
        before: String(beforeValues[field.id] ?? "").slice(0, 300),
        after: String(afterValues[field.id] ?? "").slice(0, 300)
      }]));
    }
  }
  return {
    summary: changes.length ? `Solicitação atualizada: ${changes.join(", ")}.` : "Solicitação salva sem alteração relevante nos campos principais.",
    details
  };
}

async function createInternalNotification(targetUid, item, message, type = "system") {
  if (!targetUid || targetUid === state.user?.uid || !item?.id) return;
  const target = state.users.find((user) => user.uid === targetUid);
  if (target?.active === false) return;
  await setDoc(doc(collection(db, "notifications")), {
    targetUid,
    targetName: target?.name || target?.email || "Usuário",
    createdByUid: state.user.uid,
    createdByName: state.profile.name || state.user.email,
    requestId: item.id,
    requestTitle: requestCardTitle(item).slice(0, 140),
    message: sanitizeText(message).slice(0, 300),
    type,
    read: false,
    createdAt: serverTimestamp(),
    readAt: null
  });
}

async function notifyAssignment(item, assigneeUid) {
  try { await createInternalNotification(assigneeUid, item, "Uma solicitação foi atribuída a você.", "assignment"); }
  catch (error) { console.warn("Notificação de atribuição não enviada.", error); }
}

async function notifyStatusChange(item, newStatus) {
  if (!item) return;
  const targets = [...new Set([item.requesterUid, item.assigneeUid].filter(Boolean))];
  const paused = isPausedStatus(newStatus);
  const message = paused
    ? `A solicitação foi movida para ${statusLabel(newStatus)} e a contagem de tempo foi pausada.`
    : `A etapa foi alterada para ${statusLabel(newStatus) || newStatus}.`;
  for (const targetUid of targets) {
    try { await createInternalNotification(targetUid, item, message, paused ? "paused" : "status"); }
    catch (error) { console.warn("Notificação de status não enviada.", error); }
  }
}

async function checkAutomaticAlerts() {
  if (!isAdmin() || state.automaticAlertRunning) return;
  state.automaticAlertRunning = true;
  try {
    for (const item of state.requests) {
      if (!isPausedStatus(item.status) || item.pauseAlert24SentAt || !item.pauseStartedAt) continue;
      const started = timestampToDate(item.pauseStartedAt);
      if (!started || Date.now() - started.getTime() < AUTO_PAUSE_ALERT_MS) continue;
      const targets = [...new Set([item.requesterUid, item.assigneeUid].filter(Boolean))];
      for (const targetUid of targets) {
        try { await createInternalNotification(targetUid, item, `A solicitação está com o tempo pausado em ${statusLabel(item.status)} há mais de 24 horas.`, "paused_24h"); }
        catch (error) { console.warn(error); }
      }
      await updateDoc(doc(db, "requests", item.id), { pauseAlert24SentAt: serverTimestamp() });
    }
  } catch (error) {
    console.warn("Falha ao verificar alertas automáticos.", error);
  } finally {
    state.automaticAlertRunning = false;
  }
}

async function loadSavedFilters() {
  if (!state.user) return;
  const snapshots = await getDocs(query(collection(db, "savedFilters"), where("ownerUid", "==", state.user.uid)));
  state.savedFilters = snapshots.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  renderSavedFilters();
}

function renderSavedFilters() {
  if (!els.savedFilterSelect) return;
  els.savedFilterSelect.innerHTML = `<option value="">Filtros salvos</option>${state.savedFilters.map((filter) => `<option value="${escapeHtml(filter.id)}">${escapeHtml(filter.name)}</option>`).join("")}`;
}

function applySavedFilter(id) {
  const filter = state.savedFilters.find((item) => item.id === id);
  if (!filter) return;
  const values = filter.filters || {};
  els.searchInput.value = values.search || "";
  els.typeFilter.value = values.type || "all";
  els.priorityFilter.value = values.priority || "all";
  const allowedSquadValues = [...els.squadFilter.options].map((option) => option.value);
  els.squadFilter.value = allowedSquadValues.includes(values.squad) ? values.squad : defaultSquadFilterValue();
  els.requesterFilter.value = values.requester || "all";
  applyFilters();
  persistAdminSquadPreference();
  showToast(`Filtro “${filter.name}” aplicado.`);
}

async function saveCurrentFilter(event) {
  event.preventDefault();
  showFormError(els.savedFilterError);
  const name = sanitizeText(els.savedFilterName.value);
  if (!name) return showFormError(els.savedFilterError, "Informe um nome para o filtro.");
  setButtonLoading(els.confirmSaveFilterButton, true, "Salvando...");
  try {
    await setDoc(doc(collection(db, "savedFilters")), {
      ownerUid: state.user.uid,
      name,
      filters: { ...state.filters },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    closeModal(els.savedFilterDialog);
    await loadSavedFilters();
    showToast("Filtro salvo.");
  } catch (error) {
    showFormError(els.savedFilterError, firebaseErrorMessage(error));
  } finally { setButtonLoading(els.confirmSaveFilterButton, false); }
}


async function deleteSelectedSavedFilter() {
  const id = els.savedFilterSelect.value;
  if (!id) return showToast("Selecione um filtro salvo.", "warning");
  try {
    await deleteDoc(doc(db, "savedFilters", id));
    await loadSavedFilters();
    showToast("Filtro excluído.");
  } catch (error) { showToast(firebaseErrorMessage(error), "error"); }
}

async function loadCommentTemplates() {
  let custom = [];
  try {
    const snapshots = await getDocs(collection(db, "commentTemplates"));
    custom = snapshots.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data(), custom: true }));
  } catch (error) { console.warn("Modelos personalizados indisponíveis.", error); }
  state.commentTemplates = [...DEFAULT_COMMENT_TEMPLATES, ...custom].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  renderCommentTemplates();
}

function renderCommentTemplates() {
  if (!els.commentTemplateSelect) return;
  els.commentTemplateSelect.innerHTML = `<option value="">Selecione um modelo (opcional)</option>${state.commentTemplates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.title)}</option>`).join("")}`;
  if (els.commentTemplateList) {
    const custom = state.commentTemplates.filter((item) => item.custom);
    els.commentTemplateList.innerHTML = custom.length ? custom.map((template) => `<div class="template-item"><div><strong>${escapeHtml(template.title)}</strong><p>${escapeHtml(template.text)}</p></div><button class="user-action-button danger" type="button" data-template-delete="${escapeHtml(template.id)}">Excluir</button></div>`).join("") : `<div class="comments-empty"><strong>Nenhum modelo personalizado.</strong><span>Os modelos padrão já estão disponíveis para todos.</span></div>`;
  }
}

async function addCommentTemplate(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const title = sanitizeText(els.commentTemplateTitle.value);
  const text = sanitizeText(els.commentTemplateText.value);
  showFormError(els.commentTemplateError);
  if (!title || !text) return showFormError(els.commentTemplateError, "Preencha o título e o texto.");
  setButtonLoading(els.addCommentTemplateButton, true, "Adicionando...");
  try {
    await setDoc(doc(collection(db, "commentTemplates")), { title, text, createdByUid: state.user.uid, createdByName: state.profile.name || state.user.email, createdAt: serverTimestamp() });
    els.commentTemplateForm.reset();
    await loadCommentTemplates();
    showToast("Modelo adicionado.");
  } catch (error) { showFormError(els.commentTemplateError, firebaseErrorMessage(error)); }
  finally { setButtonLoading(els.addCommentTemplateButton, false); }
}

async function deleteCommentTemplate(id) {
  if (!isAdmin()) return;
  try { await deleteDoc(doc(db, "commentTemplates", id)); await loadCommentTemplates(); showToast("Modelo excluído."); }
  catch (error) { showToast(firebaseErrorMessage(error), "error"); }
}

function updateBulkColumnSelector(status, items = null) {
  const wrapper = document.querySelector(`[data-bulk-column-wrapper="${CSS.escape(status)}"]`);
  const input = document.querySelector(`[data-bulk-column="${CSS.escape(status)}"]`);
  if (!wrapper || !input) return;
  wrapper.hidden = !(isAdmin() && state.bulkMode);
  if (wrapper.hidden) {
    input.checked = false;
    input.indeterminate = false;
    input.disabled = true;
    return;
  }
  const visibleItems = items || filteredRequests().filter((item) => item.status === status);
  const selectedCount = visibleItems.filter((item) => state.bulkSelected.has(item.id)).length;
  input.disabled = visibleItems.length === 0;
  input.checked = visibleItems.length > 0 && selectedCount === visibleItems.length;
  input.indeterminate = selectedCount > 0 && selectedCount < visibleItems.length;
}

function setBulkColumnSelection(status, selected) {
  if (!isAdmin() || !state.bulkMode || !validStatusIds().includes(status)) return;
  const visibleItems = filteredRequests().filter((item) => item.status === status);
  visibleItems.forEach((item) => {
    if (selected) state.bulkSelected.add(item.id);
    else state.bulkSelected.delete(item.id);
  });
  updateBulkBar();
  renderBoard();
}

function updateBulkBar() {
  const enabled = isAdmin() && state.bulkMode;
  if (!enabled && state.bulkMode) {
    state.bulkMode = false;
    state.bulkSelected.clear();
  }
  if (els.bulkActionsBar) els.bulkActionsBar.hidden = !enabled;
  if (els.bulkSelectedCount) els.bulkSelectedCount.textContent = String(state.bulkSelected.size);
  els.bulkModeButton?.classList.toggle("active", enabled);
  els.bulkModeButton?.setAttribute("aria-pressed", String(enabled));
}

function setBulkMode(active) {
  if (!isAdmin()) return;
  state.bulkMode = Boolean(active);
  if (!state.bulkMode) state.bulkSelected.clear();
  updateBulkBar();
  renderBoard();
}

function setBulkSelection(id, selected) {
  if (selected) state.bulkSelected.add(id); else state.bulkSelected.delete(id);
  updateBulkBar();
  const card = document.querySelector(`.request-card[data-id="${CSS.escape(id)}"]`);
  card?.classList.toggle("bulk-selected", selected);
  const item = state.requests.find((entry) => entry.id === id);
  if (item) updateBulkColumnSelector(item.status);
}

function toggleBulkSelection(id) { setBulkSelection(id, !state.bulkSelected.has(id)); const input = document.querySelector(`[data-bulk-id="${CSS.escape(id)}"]`); if (input) input.checked = state.bulkSelected.has(id); }

function selectedBulkItems() { return state.requests.filter((item) => state.bulkSelected.has(item.id)); }

async function applyBulkStatus() {
  const newStatus = els.bulkStatusSelect.value;
  const items = selectedBulkItems();
  if (!validStatusIds().includes(newStatus) || !items.length) return;
  setButtonLoading(els.bulkStatusSelect, true, "Atualizando...");
  try {
    for (const item of items) {
      await updateDoc(doc(db, "requests", item.id), { ...statusTransitionUpdate(item, newStatus), updatedAt: serverTimestamp(), updatedByUid: state.user.uid, updatedByName: state.profile.name || state.user.email });
      await recordHistory(item, "bulk", `Status alterado em massa para ${statusLabel(newStatus)}.`, { to: newStatus });
      await notifyStatusChange(item, newStatus);
    }
    showToast(`${items.length} solicitação(ões) atualizada(s).`);
    els.bulkStatusSelect.value = "";
    setBulkMode(false);
  } catch (error) { showToast(firebaseErrorMessage(error), "error"); }
  finally { setButtonLoading(els.bulkStatusSelect, false); }
}

async function applyBulkAssignee() {
  const uid = els.bulkAssigneeSelect.value;
  const user = state.users.find((entry) => entry.uid === uid && entry.active !== false);
  const items = selectedBulkItems();
  if (!user || !items.length) return;
  try {
    for (const item of items) {
      await updateDoc(doc(db, "requests", item.id), { assigneeUid: user.uid, assigneeName: user.name || user.email, updatedAt: serverTimestamp(), updatedByUid: state.user.uid, updatedByName: state.profile.name || state.user.email });
      await recordHistory(item, "bulk", `Responsável definido em massa: ${user.name || user.email}.`, { assigneeUid: user.uid });
      await notifyAssignment(item, user.uid);
    }
    showToast(`${items.length} solicitação(ões) atribuída(s).`);
    els.bulkAssigneeSelect.value = "";
    setBulkMode(false);
  } catch (error) { showToast(firebaseErrorMessage(error), "error"); }
}

async function bulkMarkCrm() {
  const items = selectedBulkItems().filter((item) => projectLegacyType(projectForItem(item)) === "cancelamento");
  if (!items.length) return showToast("Selecione solicitações de cancelamento.", "warning");
  try {
    for (const item of items) {
      const tracking = {};
      cancellationItemsFromRequest(item).forEach((entry) => { tracking[entry.itemId] = { cancelled: true, cancelledAt: Timestamp.now(), cancelledByUid: state.user.uid, cancelledByName: state.profile.name || state.user.email }; });
      await updateDoc(doc(db, "requests", item.id), { cancellationCrmStatus: tracking, updatedAt: serverTimestamp(), updatedByUid: state.user.uid, updatedByName: state.profile.name || state.user.email });
      await recordHistory(item, "bulk", "Todos os clientes foram marcados como cancelados no CRM em uma ação em massa.", {});
    }
    showToast(`CRM atualizado em ${items.length} solicitação(ões).`);
    setBulkMode(false);
  } catch (error) { showToast(firebaseErrorMessage(error), "error"); }
}

async function bulkArchive() {
  const items = selectedBulkItems().filter((item) => isCompletedStatus(item.status));
  if (!items.length) return showToast("Selecione solicitações concluídas.", "warning");
  try { for (const item of items) await archiveRequestDocument(item); showToast(`${items.length} solicitação(ões) arquivada(s).`); setBulkMode(false); }
  catch (error) { showToast(firebaseErrorMessage(error), "error"); }
}

function previousIndicatorItems() {
  const start = state.indicatorFilters.start ? new Date(`${state.indicatorFilters.start}T00:00:00`) : null;
  const end = state.indicatorFilters.end ? new Date(`${state.indicatorFilters.end}T23:59:59.999`) : null;
  if (!start || !end) return [];
  const length = end.getTime() - start.getTime() + 1;
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - length + 1);
  return [...state.requests, ...state.archivedRequests].filter((item) => {
    const created = timestampToDate(item.createdAt);
    return created && created >= previousStart && created <= previousEnd
      && (state.indicatorFilters.type === "all" || projectIdForRequest(item) === state.indicatorFilters.type)
      && (state.indicatorFilters.squad === "all"
        || (state.indicatorFilters.squad === "none" ? !VALID_SQUADS.includes(item.squad) : item.squad === state.indicatorFilters.squad));
  });
}

function activeDurationForCompleted(item) {
  const created = timestampToDate(item.createdAt);
  const completed = timestampToDate(item.completedAt);
  return created && completed ? Math.max(0, completed.getTime() - created.getTime() - requestPausedDuration(item, completed)) : null;
}

function percentageChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function renderExpandedIndicators(items, completed) {
  const previous = previousIndicatorItems();
  const previousCompleted = previous.filter((item) => isCompletedStatus(item.status) || item.archivedAt);
  const change = percentageChange(items.length, previous.length);
  els.indicatorVolumeChange.textContent = `${change > 0 ? "+" : ""}${change}%`;
  const totalPaused = items.reduce((sum, item) => sum + requestPausedDuration(item, isCompletedStatus(item.status) ? item.completedAt : null), 0);
  els.indicatorPausedTime.textContent = formatElapsed(totalPaused, true);
  els.indicatorComparison.innerHTML = [
    ["Criadas", items.length, previous.length],
    ["Concluídas", completed.length, previousCompleted.length],
    ["Taxa de conclusão", items.length ? Math.round(completed.length / items.length * 100) : 0, previous.length ? Math.round(previousCompleted.length / previous.length * 100) : 0]
  ].map(([label, current, old]) => `<div class="comparison-row"><span>${label}</span><strong>${current}</strong><small>${percentageChange(current, old) >= 0 ? "+" : ""}${percentageChange(current, old)}% vs. período anterior</small></div>`).join("");
  const typeTimes = state.projects.filter((project) => project.status !== "archived").map((project) => {
    const durations = completed.filter((item) => projectIdForRequest(item) === project.id).map(activeDurationForCompleted).filter((value) => value !== null);
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    return [project.name, avg, project.legacyType === "cancelamento" ? "red" : project.legacyType === "tef_elgin" ? "amber" : project.legacyType === "custom" ? "purple" : "blue"];
  });
  const maxTypeTime = Math.max(1, ...typeTimes.map(([, value]) => value));
  els.indicatorTypeTimeBars.innerHTML = typeTimes.map(([label, value, className]) => `<div class="report-bar-row"><div class="report-bar-label"><span>${escapeHtml(label)}</span><strong>${value ? formatElapsed(value, true) : "—"}</strong></div><div class="report-bar-track"><span class="${className}" style="width:${Math.round((value / maxTypeTime) * 100)}%"></span></div></div>`).join("");
}

function bytesToBase64(bytes) {
  const array = bytes.toUint8Array ? bytes.toUint8Array() : bytes;
  let binary = "";
  for (let i = 0; i < array.length; i += 0x8000) binary += String.fromCharCode(...array.subarray(i, i + 0x8000));
  return btoa(binary);
}

function serializeBackupValue(value) {
  if (value instanceof Timestamp || value?.toDate) return { __type: "timestamp", value: timestampToDate(value)?.toISOString() };
  if (value instanceof Bytes) return { __type: "bytes", value: bytesToBase64(value) };
  if (Array.isArray(value)) return value.map(serializeBackupValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeBackupValue(entry)]));
  return value;
}

function openBackupDialog() {
  if (!isAdmin()) return;
  els.backupForm.reset();
  showFormError(els.backupError);
  if (!els.backupDialog.open) els.backupDialog.showModal();
  window.setTimeout(() => els.backupPurpose.focus(), 50);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function downloadBackup(purpose) {
  if (!isAdmin() || state.backupInProgress) return;
  state.backupInProgress = true;
  setButtonLoading(els.confirmBackupButton, true, "Gerando...");
  try {
    await logAccessEvent("backup_requested", `Finalidade: ${purpose}`);
    const names = ["requests", "archivedRequests", "requestComments", "requestHistory", "requestAttachments", "requestProjects", "kanbanColumns", "users", "userInvites", "notifications", "savedFilters", "commentTemplates", "accessLogs"];
    const data = {};
    for (const name of names) {
      try {
        const snapshots = await getDocs(collection(db, name));
        data[name] = snapshots.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...serializeBackupValue(snapshotDoc.data()) }));
      } catch (error) {
        console.error(`Falha ao incluir a colecao ${name} no backup.`, error);
        const wrappedError = new Error(`Nao foi possivel ler a colecao ${name} para o backup.`);
        wrappedError.code = error?.code || "backup/permission-denied";
        wrappedError.cause = error;
        throw wrappedError;
      }
    }

    const generatedAt = new Date();
    const deleteAfter = new Date(generatedAt.getTime() + BACKUP_RETENTION_DAYS * 86400000);
    const baseBackup = {
      metadata: {
        generatedAt: generatedAt.toISOString(),
        deleteAfter: deleteAfter.toISOString(),
        version: "48",
        backend: "supabase",
        classification: "CONFIDENCIAL - DADOS DE CLIENTES",
        purpose,
        requestedBy: {
          uid: state.user.uid,
          name: state.profile?.name || state.user.email,
          email: state.user.email
        },
        projectUrl: supabaseConfig.url
      },
      data
    };
    const canonical = JSON.stringify(baseBackup);
    const hash = await sha256Hex(canonical);
    const backup = { ...baseBackup, integrity: { algorithm: "SHA-256", sha256: hash, scope: "metadata+data" } };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `painel-solicitacoes-backup-${generatedAt.toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    await logAccessEvent("backup_generated", `Backup gerado. Finalidade: ${purpose}. SHA-256: ${hash.slice(0, 12)}… Apagar até ${deleteAfter.toLocaleDateString("pt-BR")}.`);
    closeModal(els.backupDialog);
    showToast(`Backup gerado. Apague a cópia local até ${deleteAfter.toLocaleDateString("pt-BR")}.`);
  } catch (error) {
    console.error(error);
    await logAccessEvent("backup_failed", `Falha ao gerar backup. Finalidade: ${purpose}.`);
    const message = error?.message?.startsWith("Nao foi possivel ler a colecao")
      ? `${error.message} Confira as políticas RLS do Supabase.`
      : firebaseErrorMessage(error);
    showFormError(els.backupError, message);
  } finally {
    state.backupInProgress = false;
    setButtonLoading(els.confirmBackupButton, false);
  }
}

async function submitBackupRequest(event) {
  event.preventDefault();
  showFormError(els.backupError);
  const purpose = sanitizeText(els.backupPurpose.value).slice(0, 300);
  if (purpose.length < 10) {
    showFormError(els.backupError, "Descreva a finalidade do backup com pelo menos 10 caracteres.");
    return;
  }
  if (!els.backupAcknowledgement.checked) {
    showFormError(els.backupError, "Confirme que está ciente dos cuidados com o arquivo.");
    return;
  }
  const authorized = await ensureSensitiveAuthorization("Confirme sua senha para exportar a base completa de dados do painel.");
  if (!authorized) return;
  await downloadBackup(purpose);
}

async function logAccessEvent(eventType, description = "") {
  if (!state.user) return;
  try {
    await setDoc(doc(collection(db, "accessLogs")), {
      uid: state.user.uid,
      name: state.profile?.name || state.user.email,
      email: state.user.email,
      eventType,
      description,
      userAgent: navigator.userAgent.slice(0, 300),
      createdAt: serverTimestamp()
    });
  } catch (error) { console.warn("Log de acesso não registrado.", error); }
}

async function loadAccessLogs() {
  if (!isAdmin()) return;
  const snapshots = await getDocs(collection(db, "accessLogs"));
  state.accessLogs = snapshots.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }))
    .sort((a, b) => (timestampToDate(b.createdAt)?.getTime() || 0) - (timestampToDate(a.createdAt)?.getTime() || 0)).slice(0, 300);
  els.accessLogTable.innerHTML = state.accessLogs.length ? state.accessLogs.map((log) => `<tr><td>${escapeHtml(formatDateTime(log.createdAt))}</td><td><strong>${escapeHtml(log.name || log.email || "Usuário")}</strong></td><td>${escapeHtml(log.eventType || "acesso")}<br><small>${escapeHtml(log.description || "")}</small></td><td><span title="${escapeHtml(log.userAgent || "")}">${escapeHtml((log.userAgent || "Navegador").slice(0, 60))}</span></td></tr>`).join("") : `<tr><td colspan="4" class="report-empty-row">Nenhum acesso registrado.</td></tr>`;
}

async function toggleUserAccessLock(uid) {
  const user = state.users.find((entry) => entry.uid === uid);
  if (!isAdmin() || !user || uid === state.user.uid) return;
  const locked = user.accessLocked === true;
  const authorized = await ensureSensitiveAuthorization(`Confirme sua senha para ${locked ? "desbloquear" : "bloquear"} este acesso.`);
  if (!authorized) return;
  try {
    await updateDoc(doc(db, "users", uid), { accessLocked: !locked, lockedAt: locked ? null : serverTimestamp(), lockedByUid: locked ? "" : state.user.uid, updatedAt: serverTimestamp(), updatedByUid: state.user.uid });
    await logAccessEvent(locked ? "user_unlocked" : "user_locked", `${user.email || uid} foi ${locked ? "desbloqueado" : "bloqueado"}.`);
    await loadUsers();
    showToast(locked ? "Acesso desbloqueado." : "Acesso bloqueado temporariamente.");
  } catch (error) { showToast(firebaseErrorMessage(error), "error"); }
}


async function secureSignOut({ eventType = "", description = "", log = true } = {}) {
  try {
    if (log && eventType) await logAccessEvent(eventType, description);
  } catch (error) {
    console.warn("Não foi possível registrar a saída.", error);
  }
  try {
    await signOut(auth);
  } finally {
    clearAuthSessionStorage();
    state.sensitiveAuthorizationUntil = 0;
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE_CACHE" });
  }
}

function clearSessionTimers() {
  [state.sessionWarningTimer, state.sessionExpireTimer, state.sessionCountdownTimer].forEach((timer) => timer && clearTimeout(timer));
  if (state.sessionCountdownTimer) clearInterval(state.sessionCountdownTimer);
  state.sessionWarningTimer = state.sessionExpireTimer = state.sessionCountdownTimer = null;
}

function updateSessionCountdown() {
  const remaining = Math.max(0, (state.sessionExpiresAt || 0) - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  els.sessionCountdown.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resetSessionInactivity() {
  if (!state.user) return;
  state.lastActivityAt = Date.now();
  clearSessionTimers();
  if (els.sessionWarningDialog?.open) closeModal(els.sessionWarningDialog);
  state.sessionExpiresAt = Date.now() + SESSION_INACTIVITY_MS;
  state.sessionWarningTimer = setTimeout(() => {
    updateSessionCountdown();
    if (!els.sessionWarningDialog.open) els.sessionWarningDialog.showModal();
    state.sessionCountdownTimer = setInterval(updateSessionCountdown, 1000);
  }, SESSION_INACTIVITY_MS - SESSION_WARNING_MS);
  state.sessionExpireTimer = setTimeout(async () => {
    state.forcedLogoutMessage = "Sua sessão expirou após 3 horas sem atividade.";
    await secureSignOut({ eventType: "session_expired", description: "Sessão encerrada por inatividade." });
  }, SESSION_INACTIVITY_MS);
}

function applyTheme(theme) {
  const value = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = value;
  localStorage.setItem("painel-theme", value);
  els.themeToggleButton.textContent = value === "dark" ? "☀" : "◐";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value === "dark" ? "#0f172a" : "#2563eb");
}

function toggleTheme() { applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); }

function setupPwa() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn(error));
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.deferredInstallPrompt = event; els.installAppButton.hidden = false; });
  els.installAppButton?.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installAppButton.hidden = true;
  });
}

function isTypingTarget(target) { return target?.matches?.("input, textarea, select, [contenteditable='true']"); }

function handleKeyboardShortcuts(event) {
  if (!state.user) return;
  if (event.key === "Escape") {
    if (event.shiftKey && state.bulkMode && isAdmin()) {
      state.bulkSelected.clear(); updateBulkBar(); renderBoard();
      return;
    }
    if (document.body.classList.contains("kanban-focus-mode")) setKanbanFocusMode(false);
    return;
  }
  if (event.ctrlKey && event.key === "Enter") {
    if (els.requestDialog.open) {
      event.preventDefault();
      if (!els.requestCommentsPanel.hidden && els.requestCommentText.value.trim()) addRequestComment();
      else els.requestForm.requestSubmit();
    }
    return;
  }
  if (isTypingTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
  const key = event.key.toLocaleLowerCase("pt-BR");
  if (event.shiftKey && key === "a" && state.bulkMode && isAdmin()) {
    event.preventDefault();
    filteredRequests().forEach((item) => state.bulkSelected.add(item.id));
    updateBulkBar(); renderBoard();
    return;
  }
  const actions = {
    n: () => openNewRequestModal(), f: () => els.searchInput.focus(), k: () => setKanbanFocusMode(!document.body.classList.contains("kanban-focus-mode")),
    r: () => { renderAll(); showToast("Painel atualizado."); }, "?": () => openHelpDialog("help-productivity"), t: toggleTheme,
    m: () => toggleNotifications(true), s: () => els.savedFilterSelect.focus(), c: () => els.requestDialog.open && switchRequestTab("comments"),
    l: () => els.requestDialog.open && switchRequestTab("history")
  };
  if (isAdmin()) Object.assign(actions, { b: () => setBulkMode(!state.bulkMode), i: () => switchAppView("indicators"), a: () => switchAppView("archived"), u: () => switchAppView("users") });
  if (actions[key]) { event.preventDefault(); actions[key](); }
}

function setupEvents() {
  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(els.loginError);

    if (!isConfigReady()) {
      showFormError(els.loginError, "Configure o arquivo supabase-config.js antes de usar o painel.");
      return;
    }

    const captchaToken = requireCaptchaToken("login", els.loginError);
    if (CAPTCHA_ENABLED && !captchaToken) return;

    setButtonLoading(els.loginButton, true, "Entrando...");
    try {
      await setPersistence(
        auth,
        els.rememberEmail.checked ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(
        auth,
        els.loginEmail.value.trim(),
        els.loginPassword.value,
        captchaToken
      );
    } catch (error) {
      console.error(error);
      showFormError(els.loginError, firebaseErrorMessage(error));
      resetCaptcha("login");
    } finally {
      setButtonLoading(els.loginButton, false);
    }
  });

  els.inviteRegistrationForm.addEventListener("submit", registerFromInvite);
  els.backToLoginButton.addEventListener("click", () => {
    removeInviteFromUrl();
    showLoginCard();
    resetCaptcha("invite");
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

  els.logoutButton.addEventListener("click", () => secureSignOut({ eventType: "logout", description: "Saída manual do painel." }));
  els.changePasswordButton.addEventListener("click", () => openPasswordDialog(false));
  els.changePasswordForm.addEventListener("submit", changeCurrentUserPassword);
  els.showChangePasswords.addEventListener("change", () => {
    const type = els.showChangePasswords.checked ? "text" : "password";
    [els.currentPassword, els.newPassword, els.confirmNewPassword].forEach((input) => { input.type = type; });
  });
  $$(".close-change-password-modal").forEach((button) => button.addEventListener("click", () => {
    if (state.passwordRecoveryMode) return;
    closeModal(els.changePasswordDialog);
    resetCaptcha("changePassword");
  }));
  els.changePasswordDialog.addEventListener("cancel", (event) => {
    if (state.passwordRecoveryMode) event.preventDefault();
  });
  els.newRequestButton.addEventListener("click", () => openNewRequestModal());
  els.newProjectButton?.addEventListener("click", () => openProjectDialog());
  els.refreshProjectsButton?.addEventListener("click", async () => { await reloadProjectConfiguration(); showToast("Projetos atualizados."); });
  els.projectsTableBody?.addEventListener("click", handleProjectsTableClick);
  els.projectForm?.addEventListener("submit", saveProjectDefinition);
  els.addProjectFieldButton?.addEventListener("click", addProjectField);
  els.projectFieldsBuilder?.addEventListener("click", handleProjectFieldBuilderClick);
  els.projectFieldsBuilder?.addEventListener("input", updateProjectFormPreview);
  $$('[data-project-standard-enabled], [data-project-standard-required]').forEach((input) => input.addEventListener("change", syncStandardRequiredControls));
  $$(".close-project-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.projectDialog)));
  els.newColumnButton?.addEventListener("click", () => openColumnDialog());
  els.refreshColumnsButton?.addEventListener("click", async () => { await reloadProjectConfiguration(); showToast("Colunas atualizadas."); });
  els.columnsAdminList?.addEventListener("click", handleColumnsAdminClick);
  els.columnForm?.addEventListener("submit", saveKanbanColumn);
  $$(".close-column-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.columnDialog)));
  els.helpButton.addEventListener("click", () => openHelpDialog());
  els.topHelpButton.addEventListener("click", () => openHelpDialog());
  els.termsButton.addEventListener("click", () => openLegalTermsDialog({ required: false, status: state.legalStatus }));
  els.legalTermsFrame.addEventListener("load", () => {
    try {
      els.legalTermsFrame.contentWindow?.addEventListener("scroll", checkLegalDocumentScroll, { passive: true });
      requestAnimationFrame(checkLegalDocumentScroll);
    } catch (error) {
      console.warn("Não foi possível acompanhar a rolagem do termo.", error);
    }
  });
  [els.legalTermsRead, els.legalTermsConfidentiality, els.legalTermsMonitoring].forEach((input) => {
    input.addEventListener("change", updateLegalAcceptButton);
  });
  els.acceptLegalTermsButton.addEventListener("click", submitLegalAcceptance);
  els.declineLegalTermsButton.addEventListener("click", () => secureSignOut({ log: false }));
  els.closeLegalTerms.addEventListener("click", () => closeModal(els.legalTermsDialog));
  els.closeLegalTermsReview.addEventListener("click", () => closeModal(els.legalTermsDialog));
  els.legalTermsDialog.addEventListener("cancel", (event) => {
    if (state.legalRequiredMode) event.preventDefault();
  });
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
  els.tefUsesPix.addEventListener("change", updateTefPixFields);
  els.tefAdditionalInfo.addEventListener("input", updateTefPixFields);
  els.requestDetailsTab.addEventListener("click", () => switchRequestTab("details"));
  els.requestCommentsTab.addEventListener("click", () => switchRequestTab("comments"));
  els.requestHistoryTab.addEventListener("click", () => switchRequestTab("history"));
  els.commentTemplateSelect.addEventListener("change", () => { const template = state.commentTemplates.find((item) => item.id === els.commentTemplateSelect.value); if (template) els.requestCommentText.value = template.text; });
  els.manageCommentTemplatesButton.addEventListener("click", () => { renderCommentTemplates(); els.commentTemplateDialog.showModal(); });
  els.commentTemplateForm.addEventListener("submit", addCommentTemplate);
  els.commentTemplateList.addEventListener("click", (event) => { const button = event.target.closest("[data-template-delete]"); if (button) deleteCommentTemplate(button.dataset.templateDelete); });
  $$(".close-comment-template-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.commentTemplateDialog)));
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

  [els.searchInput, els.typeFilter, els.priorityFilter, els.squadFilter, els.requesterFilter].forEach((control) => {
    control.addEventListener(control === els.searchInput ? "input" : "change", applyFilters);
  });
  els.squadFilter.addEventListener("change", persistAdminSquadPreference);
  els.clearFilters.addEventListener("click", clearFilters);
  els.savedFilterSelect.addEventListener("change", () => applySavedFilter(els.savedFilterSelect.value));
  els.saveCurrentFilterButton.addEventListener("click", () => { els.savedFilterForm.reset(); showFormError(els.savedFilterError); els.savedFilterDialog.showModal(); });
  els.savedFilterForm.addEventListener("submit", saveCurrentFilter);
  els.deleteSavedFilterButton.addEventListener("click", deleteSelectedSavedFilter);
  $$(".close-saved-filter-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.savedFilterDialog)));
  els.bulkModeButton?.addEventListener("click", () => setBulkMode(!state.bulkMode));
  $$('[data-bulk-column]').forEach((input) => {
    input.addEventListener("change", () => setBulkColumnSelection(input.dataset.bulkColumn, input.checked));
  });
  els.bulkClearButton?.addEventListener("click", () => { state.bulkSelected.clear(); updateBulkBar(); renderBoard(); });
  els.bulkStatusSelect?.addEventListener("change", applyBulkStatus);
  els.bulkAssigneeSelect?.addEventListener("change", applyBulkAssignee);
  els.bulkCrmButton?.addEventListener("click", bulkMarkCrm);
  els.bulkArchiveButton?.addEventListener("click", bulkArchive);
  els.expandKanbanButton?.addEventListener("click", () => setKanbanFocusMode(true));
  els.exitKanbanFocusButton?.addEventListener("click", () => setKanbanFocusMode(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("kanban-focus-mode")) {
      setKanbanFocusMode(false);
    }
  });

  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.view === "help") {
        openHelpDialog();
        els.sidebar.classList.remove("open");
        return;
      }
      if (["users", "indicators", "archived", "security", "projects", "columns"].includes(button.dataset.view)) {
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
  els.userInviteRole.addEventListener("change", () => updateUserSquadFieldVisibility(els.userInviteRole, els.userInviteSquadField, els.userInviteSquad));
  els.copyUserInviteLink.addEventListener("click", () => copyText(els.userInviteLink.value));
  $$(".close-user-invite-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.userInviteDialog)));
  els.editUserForm.addEventListener("submit", saveUserProfile);
  els.editUserRole.addEventListener("change", () => updateUserSquadFieldVisibility(els.editUserRole, els.editUserSquadField, els.editUserSquad));
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
  [els.indicatorStartDate, els.indicatorEndDate, els.indicatorTypeFilter, els.indicatorSquadFilter].forEach((control) => {
    control.addEventListener("change", () => {
      state.indicatorFilters.start = els.indicatorStartDate.value;
      state.indicatorFilters.end = els.indicatorEndDate.value;
      state.indicatorFilters.type = els.indicatorTypeFilter.value;
      state.indicatorFilters.squad = els.indicatorSquadFilter.value;
      renderIndicators();
    });
  });
  els.indicatorClearFilter.addEventListener("click", () => {
    els.indicatorTypeFilter.value = "all";
    els.indicatorSquadFilter.value = "all";
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
  els.archivedSquadFilter.addEventListener("change", () => {
    state.archivedFilters.squad = els.archivedSquadFilter.value;
    renderArchivedRequests();
  });
  els.archivedTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-archive-action]");
    if (!button) return;
    const item = state.archivedRequests.find((entry) => entry.id === button.dataset.id);
    if (button.dataset.archiveAction === "view") openRequestModal(button.dataset.id, "archived");
    if (button.dataset.archiveAction === "restore") openArchiveConfirmation("restore", item);
  });

  els.themeToggleButton.addEventListener("click", toggleTheme);
  els.downloadBackupButton.addEventListener("click", openBackupDialog);
  els.backupForm.addEventListener("submit", submitBackupRequest);
  $$(".close-backup-modal").forEach((button) => button.addEventListener("click", () => closeModal(els.backupDialog)));
  els.reauthForm.addEventListener("submit", submitSensitiveAuthorization);
  $$(".close-reauth-modal").forEach((button) => button.addEventListener("click", () => closeSensitiveAuthorization(false)));
  els.reauthDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeSensitiveAuthorization(false); });
  els.configureMfaButton.addEventListener("click", openMfaEnrollment);
  els.removeMfaButton.addEventListener("click", removeMfa);
  els.mfaEnrollmentForm.addEventListener("submit", submitMfaEnrollment);
  $$(".close-mfa-enrollment").forEach((button) => button.addEventListener("click", cancelMfaEnrollment));
  els.mfaChallengeForm.addEventListener("submit", submitMfaChallenge);
  els.mfaChallengeLogout.addEventListener("click", () => secureSignOut({ eventType: "mfa_cancelled", description: "Usuário saiu durante a verificação do segundo fator." }));
  els.mfaChallengeDialog.addEventListener("cancel", (event) => event.preventDefault());
  els.refreshAccessLogsButton.addEventListener("click", loadAccessLogs);
  els.continueSessionButton.addEventListener("click", resetSessionInactivity);
  els.logoutSessionButton.addEventListener("click", () => secureSignOut({ eventType: "logout", description: "Saída pela tela de expiração." }));
  document.addEventListener("keydown", handleKeyboardShortcuts);
  ["pointerdown", "mousemove", "keydown", "scroll", "touchstart"].forEach((eventName) => document.addEventListener(eventName, () => { if (state.user && Date.now() - state.lastActivityAt > 30000) resetSessionInactivity(); }, { passive: true }));

  els.forgotPassword.addEventListener("click", () => {
    els.resetEmail.value = els.loginEmail.value.trim();
    showFormError(els.resetError);
    els.resetDialog.showModal();
    ensureCaptchaWidget("reset");
  });
  $$(".close-reset-modal").forEach((button) => button.addEventListener("click", () => { closeModal(els.resetDialog); resetCaptcha("reset"); }));
  els.resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(els.resetError);
    const captchaToken = requireCaptchaToken("reset", els.resetError);
    if (CAPTCHA_ENABLED && !captchaToken) return;
    try {
      auth.languageCode = "pt-BR";
      await sendPasswordResetEmail(auth, els.resetEmail.value.trim(), captchaToken);
      els.resetDialog.close();
      showToast("Link de redefinição enviado para o e-mail informado.");
    } catch (error) {
      console.error(error);
      showFormError(els.resetError, firebaseErrorMessage(error));
    } finally {
      resetCaptcha("reset");
    }
  });

  [els.requestDialog, els.projectDialog, els.columnDialog, els.resetDialog, els.changePasswordDialog, els.helpDialog, els.userInviteDialog, els.editUserDialog, els.userStatusDialog, els.archiveConfirmDialog, els.savedFilterDialog, els.commentTemplateDialog, els.backupDialog].forEach((dialog) => {
    let pointerStartedOnBackdrop = false;
    let pointerStartX = 0;
    let pointerStartY = 0;

    dialog.addEventListener("pointerdown", (event) => {
      pointerStartedOnBackdrop = event.target === dialog;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
    });

    dialog.addEventListener("pointerup", (event) => {
      const moved = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
      if (dialog.dataset.recoveryMode !== "true" && pointerStartedOnBackdrop && event.target === dialog && moved < 8) dialog.close();
      pointerStartedOnBackdrop = false;
    });

    dialog.addEventListener("pointercancel", () => {
      pointerStartedOnBackdrop = false;
    });
  });

  els.requestDialog.addEventListener("close", () => {
    if (state.unsubscribeComments) state.unsubscribeComments();
    if (state.unsubscribeHistory) state.unsubscribeHistory();
    state.unsubscribeComments = null;
    state.unsubscribeHistory = null;
    state.currentComments = [];
    state.currentHistory = [];
  });

  setupDropzones();
  setupModalScrollLock();
}

function finishAuthBootstrap() {
  document.body.classList.remove("auth-pending");
  if (els.authBootstrap) els.authBootstrap.hidden = true;
}

async function handleAuthenticated(user, { skipMfaCheck = false, skipLegalCheck = false } = {}) {
  if (state.inviteRegistrationInProgress) return;
  try {
    if (!skipMfaCheck && !await ensureMfaChallengeBeforeApp()) return;
    const profile = await loadProfile(user);
    if (profile.active !== true || profile.accessLocked === true) {
      state.forcedLogoutMessage = profile.accessLocked === true ? "Seu acesso está temporariamente bloqueado. Procure o administrador." : "Seu acesso está desativado. Procure o administrador.";
      await secureSignOut({ log: false });
      return;
    }

    if (!userHasValidSquad(profile)) {
      state.forcedLogoutMessage = "Seu grupo de atendimento ainda não foi atribuído. Procure um administrador.";
      await secureSignOut({ log: false });
      return;
    }

    state.user = user;
    state.profile = profile;

    if (!skipLegalCheck) {
      const legalStatus = await getLegalAcceptanceStatus(auth);
      state.legalStatus = legalStatus;
      if (!legalStatus?.accepted) {
        els.loginView.hidden = true;
        els.appView.hidden = true;
        finishAuthBootstrap();
        await openLegalTermsDialog({ required: true, status: legalStatus });
        return;
      }
    }
    state.bulkMode = false;
    state.bulkSelected.clear();
    configureSquadFilter();
    els.loginView.hidden = true;
    els.appView.hidden = false;
    finishAuthBootstrap();
    showLoginCard();
    renderUser();
    populateProjectAndColumnControls();
    renderKanbanStructure();
    await switchAppView("kanban");
    await loadUsers();
    await Promise.all([loadSavedFilters(), loadCommentTemplates()]);
    try {
      await updateDoc(doc(db, "users", user.uid), { lastLoginAt: serverTimestamp(), lastSeenAt: serverTimestamp(), loginCount: increment(1) });
      await logAccessEvent("login", "Entrada no painel.");
    } catch (logError) { console.warn(logError); }
    resetSessionInactivity();
    subscribeProjectConfiguration();
    subscribeRequests();
    subscribeNotifications();
    subscribeCurrentProfile();

    if (state.elapsedTimer) clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(updateElapsedLabels, 60000);
  } catch (error) {
    console.error(error);
    const rawMessage = String(error?.message || "");
    const message = error.message === "profile-not-found"
      ? "Seu login existe, mas o perfil de acesso ainda não foi cadastrado. Solicite um convite ao administrador."
      : rawMessage.includes("get_current_legal_status") || rawMessage.includes("legal-document")
        ? "A política de uso ainda não foi ativada no Supabase. Execute o arquivo supabase/legal-terms-v47.sql."
        : rawMessage.includes("requestProjects") || rawMessage.includes("kanbanColumns")
          ? "A estrutura de Projetos e Colunas ainda não foi ativada no Supabase. Execute supabase/projects-kanban-v48.sql."
          : firebaseErrorMessage(error);
    state.forcedLogoutMessage = message;
    await secureSignOut({ log: false });
  }
}

function handleSignedOut() {
  if (state.unsubscribeRequests) state.unsubscribeRequests();
  if (state.unsubscribeProjects) state.unsubscribeProjects();
  if (state.unsubscribeKanbanColumns) state.unsubscribeKanbanColumns();
  if (state.unsubscribeProfile) state.unsubscribeProfile();
  if (state.unsubscribeNotifications) state.unsubscribeNotifications();
  if (state.unsubscribeComments) state.unsubscribeComments();
  if (state.unsubscribeHistory) state.unsubscribeHistory();
  if (state.elapsedTimer) clearInterval(state.elapsedTimer);
  state.unsubscribeRequests = null;
  state.unsubscribeProjects = null;
  state.unsubscribeKanbanColumns = null;
  state.unsubscribeProfile = null;
  state.unsubscribeNotifications = null;
  state.unsubscribeComments = null;
  state.unsubscribeHistory = null;
  state.user = null;
  state.profile = null;
  state.requests = [];
  state.projects = mergeProjects([]);
  state.kanbanColumns = mergeKanbanColumns([]);
  state.archivedRequests = [];
  state.archivedLoaded = false;
  state.users = [];
  state.invites = [];
  state.notifications = [];
  state.currentComments = [];
  state.currentHistory = [];
  state.bulkMode = false;
  state.bulkSelected.clear();
  state.passwordRecoveryMode = false;
  state.sensitiveAuthorizationUntil = 0;
  state.mfaChallengeFactorId = "";
  state.mfaEnrollmentFactorId = "";
  state.mfaVerifiedFactorId = "";
  state.mfaStatusLoaded = false;
  state.legalStatus = null;
  state.legalRequiredMode = false;
  state.legalDocumentVerified = false;
  state.legalScrollReached = false;
  state.legalAcceptanceInProgress = false;
  closeSensitiveAuthorization(false);
  [els.backupDialog, els.mfaEnrollmentDialog, els.mfaChallengeDialog, els.legalTermsDialog].forEach((dialog) => { if (dialog?.open) closeModal(dialog); });
  configurePasswordDialog(false);
  updateBulkBar();
  clearSessionTimers();
  toggleNotifications(false);
  els.notificationList.innerHTML = "";
  els.notificationBadge.hidden = true;
  els.appView.hidden = true;
  els.loginView.hidden = false;
  finishAuthBootstrap();
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
    const release = String(info.release || "47").replace(/^v/i, "");
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
    versionLabel.textContent = "v47";
    detailsLabel.textContent = "Versão local";
    card.title = "Informações da versão indisponíveis";
  }
}

applyTheme(localStorage.getItem("painel-theme") || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
setupPwa();
loadAppVersion();
setupEvents();
updateSecurityControlStatus();
ensureCaptchaWidget("login");
if (!isConfigReady()) {
  showFormError(els.loginError, "Configure o arquivo supabase-config.js para conectar o painel ao Supabase.");
}
if (state.inviteToken) showInviteCard();
onAuthStateChanged(auth, async (user, authEvent) => {
  if (authEvent === "PASSWORD_RECOVERY" && user) {
    state.user = user;
    state.profile = null;
    els.appView.hidden = true;
    els.loginView.hidden = false;
    finishAuthBootstrap();
    showLoginCard();
    openPasswordDialog(true);
    return;
  }
  if (state.inviteToken && user && !state.inviteRegistrationInProgress) {
    await secureSignOut({ log: false });
    return;
  }
  if (user) await handleAuthenticated(user);
  else handleSignedOut();
});

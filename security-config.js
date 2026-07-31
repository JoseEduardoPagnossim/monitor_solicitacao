// Configurações públicas de segurança do painel.
// Não coloque segredos neste arquivo. A Site Key do Turnstile é pública.
export const securityConfig = {
  // Preencha somente depois de habilitar Cloudflare Turnstile no Supabase Auth.
  // Enquanto permanecer vazio, o CAPTCHA fica desativado e o painel funciona normalmente.
  turnstileSiteKey: "",

  // Política aplicada pelo frontend. Configure os mesmos requisitos em
  // Supabase > Authentication > Password Security para impedir bypass pela API.
  passwordPolicy: {
    minLength: 10,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSymbol: true,
    forbidWhitespace: true
  },

  // Uma confirmação de identidade vale por este período para ações administrativas sensíveis.
  sensitiveAuthorizationMinutes: 10,

  // Prazo recomendado para apagar cópias locais exportadas do painel.
  backupRetentionDays: 7,

  // Nome exibido no aplicativo autenticador ao configurar MFA TOTP.
  mfaFriendlyName: "Painel de Solicitações"
};

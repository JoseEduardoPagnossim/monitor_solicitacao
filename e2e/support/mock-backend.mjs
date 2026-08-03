import { readFile } from "node:fs/promises";

const mockModuleTemplate = await readFile(new URL("../fixtures/supabase-compat.mock.js", import.meta.url), "utf8");
const securityConfigMock = `
export const securityConfig = {
  turnstileSiteKey: "",
  passwordPolicy: {
    minLength: 10,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSymbol: true,
    forbidWhitespace: true
  },
  sensitiveAuthorizationMinutes: 10,
  backupRetentionDays: 7,
  mfaFriendlyName: "Painel de Solicitações E2E"
};
`;

export async function installMockBackend(page, { authenticated = true } = {}) {
  const mockModule = mockModuleTemplate.replace("__AUTHENTICATED__", String(authenticated));
  await page.route("**/supabase-compat.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: mockModule });
  });
  await page.route("**/security-config.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: securityConfigMock });
  });
  await page.route("https://fonts.googleapis.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });
  await page.route("https://fonts.gstatic.com/**", async (route) => route.abort());
}

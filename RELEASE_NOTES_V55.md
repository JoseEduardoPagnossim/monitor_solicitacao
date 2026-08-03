# Versão 55 — Qualidade automatizada

## Novidades

- ESLint com configuração flat e regras focadas em erros reais de JavaScript.
- Prettier, EditorConfig e recomendações para VS Code.
- Adoção gradual de formatação para evitar alteração massiva nos arquivos legados antes da modularização.
- Playwright configurado com servidor local e Chromium.
- Teste E2E da tela de login sem sessão.
- Teste E2E da troca entre Programação, Cancelamento e TEF Elgin.
- Teste E2E de fechamento e reabertura do modal de nova solicitação.
- Backend simulado no navegador para que os testes E2E não usem dados reais do Supabase.
- Workflow do GitHub para ESLint, Prettier, testes unitários, build e Playwright.

## Comandos

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run test:unit
npm run test:e2e:install
npm run test:e2e
npm run quality
```

Os comandos de ferramentas usam versões fixas pelo `npx`, sem adicionar dependências ao bundle publicado da aplicação.

# Política de segurança

Este repositório contém o frontend de uma ferramenta interna que processa dados de clientes.

## Não publicar

Nunca envie para commits, issues, pull requests, Actions ou capturas de tela:

- chaves `sb_secret_` ou `service_role`;
- senha SMTP ou senha do banco;
- conta de serviço do Firebase;
- arquivos `.env`;
- `migration-report.json`;
- backups JSON do painel;
- dados reais de clientes usados em testes.

O arquivo `supabase-config.js` deve conter somente a URL do projeto e a chave pública `sb_publishable_`.

## Comunicação de vulnerabilidade

Não abra uma issue pública com dados de clientes, credenciais ou uma prova de conceito explorável. Comunique diretamente ao responsável interno pelo painel e revogue imediatamente qualquer credencial exposta.

## Resposta mínima a incidente

1. Revogar ou rotacionar a credencial afetada.
2. Bloquear sessões e usuários suspeitos.
3. Preservar logs do Supabase, GitHub e Brevo.
4. Identificar dados e usuários potencialmente afetados.
5. Registrar as ações tomadas e acionar o processo interno de LGPD quando aplicável.

## Controles da versão 46

- Contas administrativas podem ativar MFA TOTP em **Segurança**.
- Ações de usuários e backup exigem confirmação recente da senha.
- Backups devem ter finalidade registrada e ser apagados no prazo informado.
- O CAPTCHA é opcional; a Secret Key fica somente no Supabase e a Site Key pública em `security-config.js`.
- Anexos aceitos: JPEG, PNG e TXT, com validação do conteúdo real e limite de 700 KB no Storage.

Consulte `SEGURANCA_COMPLEMENTAR_V46.md` antes de habilitar CAPTCHA ou MFA.

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

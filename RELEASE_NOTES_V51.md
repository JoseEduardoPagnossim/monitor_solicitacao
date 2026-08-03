# Versão 51 — Correção dos formulários de Cancelamento e TEF Elgin

## Correções

- Restaura automaticamente o tipo interno dos projetos padrão quando o registro do Supabase estiver sem `legacyType`.
- Impede que **Cancelamento** e **TEF Elgin** sejam tratados como projetos personalizados com formulário vazio.
- Mantém projetos realmente personalizados com o tipo `custom`.
- Renova o cache do PWA para distribuir a correção aos usuários.
- Inclui SQL de reparo para os três projetos padrão no Supabase.

## Banco de dados

Execute `supabase/hotfix-v51-projetos-legados.sql` no SQL Editor do Supabase.

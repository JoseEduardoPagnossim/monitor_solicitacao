# Versão 53 — Identidade definitiva dos projetos padrão

## Correções

- O ID real do documento no Supabase passa a prevalecer sobre um campo `id` incorreto dentro do JSON.
- Programação, Cancelamento e TEF Elgin sempre usam seus formulários nativos.
- Projetos personalizados duplicados com os nomes dos projetos padrão deixam de aparecer na criação de solicitações.
- Nomes ou descrições corrompidos no banco não substituem a definição oficial dos três projetos padrão.
- Solicitações antigas ligadas a duplicatas são direcionadas ao projeto nativo correspondente.
- O service worker busca os arquivos estáticos na rede antes do cache, reduzindo persistência de versões antigas.

## Banco de dados

Execute `supabase/hotfix-v53-identidade-projetos.sql` no SQL Editor do Supabase depois da publicação.

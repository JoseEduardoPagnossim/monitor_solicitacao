# Versão 56 — Formulários de solicitação modularizados

## Objetivo

Separar os quatro formulários de solicitação do arquivo principal `app.js`, mantendo o comportamento atual e reduzindo o risco de uma alteração em um formulário afetar os demais.

## Nova estrutura

```text
request-forms/
├── index.js
├── shared.js
├── programming-form.js
├── cancellation-form.js
├── tef-elgin-form.js
└── custom-project-form.js
```

Cada formulário possui um contrato próprio para:

- ativar ou ocultar sua seção;
- limpar o estado;
- preencher uma solicitação existente;
- validar e montar o payload;
- posicionar o foco inicial.

O arquivo `app.js` permanece responsável pela orquestração geral, persistência, permissões, anexos, histórico e notificações.

## Compatibilidade de publicação

A URL do GitHub Pages continua suportada. O workflow `.github/workflows/pages.yml` passou a executar o mesmo comando `npm run build` usado pela Cloudflare Pages e publica a pasta `_site`.

Isso garante que os novos módulos de `request-forms/` sejam enviados tanto para:

- GitHub Pages;
- Cloudflare Pages.

Nenhuma mudança de domínio, rota ou URL é necessária.

## Testes

- testes unitários ampliados para validar a nova arquitetura;
- Playwright atualizado para cobrir também um projeto personalizado;
- service worker atualizado para armazenar os novos módulos;
- build estático copia recursivamente `request-forms/`.

## Banco de dados

Esta versão não exige SQL nem alteração no Supabase.

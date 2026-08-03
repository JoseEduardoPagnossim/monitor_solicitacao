# Versão 57 — Correções do fluxo de qualidade

- Corrige os seis erros reportados pelo ESLint na versão 56.
- Remove expressão regular com caracteres de controle na sanitização de nomes de anexos.
- Declara corretamente o ambiente de navegador do mock E2E.
- Corrige o executor de Promise usado nos testes unitários.
- Usa o pacote oficial `@playwright/test` e o instala de forma explícita no GitHub Actions.
- Mantém o mesmo build estático para GitHub Pages e Cloudflare Pages.
- Restringe a adoção inicial do Prettier aos módulos e testes E2E novos, evitando reformatação massiva do legado.

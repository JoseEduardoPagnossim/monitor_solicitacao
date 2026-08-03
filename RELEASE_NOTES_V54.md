# Versão 54 — Correção da troca de projeto na nova solicitação

## Correção principal

- Corrigido o evento do seletor **Projeto** na janela de nova solicitação.
- O navegador enviava o evento `change` diretamente para a função que esperava receber uma solicitação.
- Como o evento possui `type = "change"`, o sistema o interpretava como um projeto personalizado chamado **change**.
- Por isso, ao trocar de Programação para Cancelamento ou TEF Elgin, era exibido o bloco vazio **Formulário do projeto — change**.

## Comportamento esperado

- Programação abre o formulário de programação.
- Cancelamento abre o formulário nativo de cancelamento.
- TEF Elgin abre o formulário nativo de TEF.
- Projetos personalizados continuam abrindo seus próprios campos.

Esta correção é somente de frontend e não exige novo SQL no Supabase.

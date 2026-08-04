# Versão 58 — Cadastro por convite

## Correções

- O cadastro da primeira senha agora finaliza o perfil e o convite em uma única transação no Supabase.
- Removida a gravação em duas etapas que podia criar o usuário no Auth e falhar ao criar o perfil.
- Mensagens específicas para CAPTCHA inválido, cadastro desativado, política de senha, e-mail já utilizado e configuração pendente no banco.
- Limpeza automática do usuário incompleto quando a finalização do convite falhar.

## Banco de dados

Execute uma vez:

```text
supabase/invite-onboarding-v58.sql
```

## Compatibilidade

A publicação continua compatível com GitHub Pages e Cloudflare Pages.

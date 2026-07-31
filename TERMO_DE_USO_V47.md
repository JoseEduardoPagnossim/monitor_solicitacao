# Versão 47 — aceite obrigatório de política e termo de uso

## Comportamento

No primeiro acesso após a publicação, cada usuário autenticado deverá:

1. ler o documento até o final;
2. confirmar que compreendeu a política;
3. assumir o compromisso de confidencialidade e não cópia indevida;
4. reconhecer os registros de auditoria e as consequências aplicáveis;
5. clicar em **Aceitar e acessar o painel**.

Sem o aceite, o usuário permanece autenticado apenas o suficiente para validar o próprio perfil e visualizar o documento. As solicitações, comentários, históricos, notificações e anexos ficam bloqueados por políticas restritivas de RLS.

## Evidências registradas

- usuário e e-mail;
- perfil e Squad no momento do aceite;
- versão e hash SHA-256 do documento;
- data e hora do servidor;
- navegador/dispositivo informado pelo user agent;
- IP disponibilizado nos cabeçalhos da requisição, quando presente;
- identificador do aceite.

## Atualização no Supabase

Execute uma única vez:

```text
supabase/legal-terms-v47.sql
```

Não execute novamente o `schema.sql` em um projeto já configurado.

## Alteração futura do texto

Não edite silenciosamente o arquivo vigente. Para alterar a política:

1. crie um novo arquivo em `legal/`;
2. defina uma nova versão em `legal-config.js`;
3. calcule o novo SHA-256;
4. cadastre a nova versão no Supabase como ativa;
5. publique a aplicação.

Todos os usuários precisarão aceitar novamente porque o banco valida a versão e o hash ativos.

## Limite técnico

O termo cria obrigação interna, evidência de aceite e mecanismos de controle. Nenhuma aplicação web consegue impedir de forma absoluta fotografia externa, captura por dispositivo comprometido ou reprodução por pessoa que já teve acesso legítimo. Por isso, o controle deve ser combinado com RLS, auditoria, gestão de acessos, treinamento e medidas disciplinares.

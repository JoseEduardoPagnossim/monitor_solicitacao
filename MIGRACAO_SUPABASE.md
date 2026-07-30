# Migração do Firebase para o Supabase — versão 42

Este guia migra o painel para:

- Supabase Auth: login e recuperação de senha;
- PostgreSQL: solicitações, usuários, comentários, histórico e configurações;
- Supabase Storage: anexos;
- Realtime: atualização das telas abertas;
- Row Level Security (RLS): permissões por administrador, usuário e Squad.

## Antes de começar

Não exclua o projeto Firebase. Mantenha-o somente para consulta até validar a nova base.

As senhas atuais do Firebase não são copiadas por este pacote. Cada usuário deverá criar uma nova senha no Supabase por um convite do painel. Os dados e vínculos são preservados porque a migração relaciona os usuários pelo mesmo endereço de e-mail.

Nunca coloque no GitHub:

- a chave `service_role` do Supabase;
- o JSON da conta de serviço do Firebase;
- senhas temporárias.

A chave `anon` ou `publishable` do Supabase pode ser usada no frontend porque as permissões reais são aplicadas pelas políticas RLS.

---

## Etapa 1 — Criar o projeto no Supabase

1. Entre no Supabase e crie um projeto.
2. Defina uma senha forte para o banco e guarde-a.
3. Aguarde o projeto ficar disponível.
4. Abra **SQL Editor**.
5. Crie uma nova consulta.
6. Cole todo o conteúdo de `supabase/schema.sql`.
7. Clique em **Run**.

O script cria:

- `profiles`;
- `user_invites`;
- `documents`;
- índices;
- funções de permissão;
- políticas RLS;
- bucket privado `request-attachments`;
- políticas do Storage;
- publicação Realtime.

Se o editor concluir sem erro, a estrutura está pronta.

---

## Etapa 2 — Configurar autenticação

No Supabase, acesse **Authentication → URL Configuration**.

Preencha:

- **Site URL:** `https://joseeduardopagnossim.github.io/monitor_solicitacao/`
- **Redirect URLs:** adicione a mesma URL.

Depois acesse **Authentication → Providers → Email** e configure:

- Email habilitado;
- permitir cadastro por e-mail;
- **Confirm email desativado** para o fluxo de convites internos funcionar imediatamente.

O painel não possui cadastro público visível. A criação de perfil é permitida pelas políticas somente quando existe um convite válido.

---

## Etapa 3 — Criar o primeiro administrador

1. No Supabase, abra **Authentication → Users**.
2. Clique em **Add user**.
3. Crie o seu usuário administrador com e-mail e senha.
4. Marque o e-mail como confirmado, quando essa opção aparecer.
5. Abra `supabase/bootstrap-admin.sql`.
6. Troque:
   - `NOME DO ADMINISTRADOR`;
   - `EMAIL_DO_ADMINISTRADOR`.
7. Execute o SQL no **SQL Editor**.

Confirme em **Table Editor → profiles** que o usuário ficou com:

- `role = admin`;
- `active = true`;
- `access_locked = false`.

---

## Etapa 4 — Configurar o painel

Abra `supabase-config.js` e informe os dados do projeto:

```js
export const supabaseConfig = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_CHAVE_ANON_OU_PUBLISHABLE"
};
```

Os valores ficam em **Project Settings → API**.

Use somente:

- Project URL;
- `anon` key ou publishable key.

Não use `service_role` nesse arquivo.

---

## Etapa 5 — Preparar os usuários

As senhas do Firebase não são copiadas. O pacote oferece duas formas de preparar os usuários.

### Opção recomendada — criação automática durante a migração

O script pode criar no Supabase Auth todos os usuários que ainda não existirem, usando os mesmos e-mails do Firebase. Ele gera senhas temporárias aleatórias que não são exibidas nem armazenadas no relatório.

Depois da migração, cada colaborador deverá abrir o painel, clicar em **Esqueci minha senha** e definir uma nova senha pelo e-mail recebido.

Use os comandos com `create-users` descritos nas etapas 6A ou 6B. O seu primeiro administrador, criado na etapa 3, será reutilizado pelo mesmo e-mail.

### Opção alternativa — convites manuais

Antes de importar os chamados:

1. Entre no painel como administrador.
2. Abra **Usuários**.
3. Crie um convite para cada colaborador.
4. Use exatamente o mesmo e-mail do usuário antigo.
5. Defina o perfil e o Squad correto.
6. Aguarde cada colaborador criar a nova senha.

A migração relaciona o UID antigo ao novo UUID do Supabase pelo endereço de e-mail.

Usuários sem e-mail válido não podem ser criados automaticamente. O modo de teste listará esses casos para correção.

---

## Etapa 6A — Migrar diretamente do Firestore

Use esta opção quando a cota do Firebase voltar a permitir leituras.

### Preparar o computador

1. Instale o Node.js 20 ou superior.
2. Extraia o pacote da versão 42.
3. Abra o terminal dentro da pasta.
4. Execute:

```bash
npm install
```

### Gerar a conta de serviço do Firebase

No Firebase:

1. Abra **Configurações do projeto → Contas de serviço**.
2. Clique em **Gerar nova chave privada**.
3. Salve o JSON fora da pasta do GitHub.
4. Não envie esse arquivo para ninguém e não faça commit.

### Obter a service_role do Supabase

No Supabase:

1. Abra **Project Settings → API**.
2. Copie a chave `service_role`.
3. Use-a somente no terminal durante a migração.

### PowerShell — teste sem gravar

```powershell
$env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="SUA_SERVICE_ROLE"
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\Caminho\firebase-service-account.json"
npm run migrate:firebase:dry
```

O teste verifica:

- acesso ao Firebase;
- acesso ao Supabase;
- coleções encontradas;
- correspondência dos usuários por e-mail;
- quantidade de documentos que será processada.

### Executar a migração real

Para criar automaticamente os usuários ausentes e importar os dados:

```powershell
npm run migrate:firebase:create-users
```

Caso todos os usuários já tenham sido criados manualmente:

```powershell
npm run migrate:firebase
```

Ao final é criado:

```text
migration-report.json
```

O relatório informa quantos registros foram lidos, migrados e quais apresentaram erro.

---

## Etapa 6B — Importar um backup JSON do painel

Use esta opção quando você já possui um backup baixado anteriormente.

Defina as variáveis do Supabase:

```powershell
$env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="SUA_SERVICE_ROLE"
```

Teste sem gravar:

```powershell
npm run import:backup -- "C:\Caminho\painel-solicitacoes-backup.json" --dry-run
```

Importação real criando automaticamente os usuários ausentes:

```powershell
npm run import:backup:create-users -- "C:\Caminho\painel-solicitacoes-backup.json"
```

Caso os usuários já tenham sido criados manualmente:

```powershell
npm run import:backup -- "C:\Caminho\painel-solicitacoes-backup.json"
```

Os anexos existentes no backup são enviados ao bucket privado `request-attachments`.

---

## Etapa 7 — Publicar a versão 42

1. Substitua os arquivos do repositório pelos arquivos da versão 42.
2. Configure `supabase-config.js`.
3. Remova do frontend os arquivos antigos que não são mais usados:
   - `firebase-config.js`;
   - `firestore.rules`.
4. Faça o commit e envie para a branch `main`.
5. Aguarde o GitHub Actions concluir os testes e o deploy.
6. Abra o painel com `Ctrl + Shift + R`.
7. Entre com o administrador criado na etapa anterior.

Como a base já foi importada, o painel abrirá com os dados migrados. Os usuários criados automaticamente devem clicar em **Esqueci minha senha** antes do primeiro acesso.

---

## Etapa 8 — Validar a migração

No Supabase, execute:

```sql
select collection_name, count(*)
from public.documents
group by collection_name
order by collection_name;
```

Confira também:

```sql
select role, squad, count(*)
from public.profiles
group by role, squad
order by role, squad;
```

No painel, valide:

1. administrador visualiza todos os Squads;
2. Squad A/B visualiza Programações A/B;
3. Squad D/E visualiza Programações D/E;
4. Cancelamento e TEF seguem a regra de criador ou responsável;
5. criação e edição salvam corretamente;
6. comentários e histórico aparecem;
7. anexos abrem e baixam;
8. notificações aparecem;
9. filtros salvos funcionam;
10. backup JSON é gerado.

---

## Etapa 9 — Encerrar a migração

Mantenha o Firebase sem alterações por alguns dias para conferência.

Depois da validação:

1. confirme que o painel publicado não importa arquivos Firebase;
2. guarde o `migration-report.json`;
3. guarde um backup Supabase gerado pelo painel;
4. revogue ou exclua a chave privada da conta de serviço do Firebase;
5. apague as variáveis `SUPABASE_SERVICE_ROLE_KEY` do terminal;
6. não exclua o Firebase até confirmar que todos os chamados e anexos foram migrados.

---

## Solução de problemas

### “Confirmação de e-mail está ativada”

Desative **Confirm email** em **Authentication → Providers → Email**.

### “Usuário não possui perfil”

Execute `supabase/bootstrap-admin.sql` para o primeiro administrador ou envie um novo convite pelo painel.

### “Usuários faltantes” durante a migração

Corrija os usuários sem e-mail ou execute a migração real com `--create-missing-users`. Os usuários criados automaticamente deverão usar **Esqueci minha senha** no primeiro acesso.

### “permission denied” ou “row-level security”

Execute novamente `supabase/schema.sql` e confirme que o usuário está ativo em `profiles`.

### Anexo não abre

Confirme no Supabase:

- bucket `request-attachments` existente;
- políticas de Storage criadas;
- registro correspondente em `documents` com `collection_name = requestAttachments`;
- campo `storagePath` preenchido.

### Firestore continua sem permitir leitura

Aguarde a renovação da cota ou use um backup JSON já existente. A migração direta não consegue recuperar documentos enquanto o Firebase rejeitar as leituras.

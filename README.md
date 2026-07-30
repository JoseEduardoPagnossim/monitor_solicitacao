# Painel de Solicitações — versão 42

Painel interno da Soften Sistemas publicado no GitHub Pages e conectado ao Supabase.

## Backend atual

- Supabase Auth para login e senha;
- PostgreSQL para dados do painel;
- Supabase Storage para anexos;
- Realtime para atualizações das telas abertas;
- RLS para segurança por usuário, perfil e Squad.

O frontend não utiliza mais Firebase. O Firebase é necessário apenas temporariamente para importar os dados antigos.

## Principais recursos

- Kanban: Nova, Em análise, Aguardando, Bloqueio e Concluída;
- Programação, Cancelamento e TEF Elgin;
- Squads A, B, D e E;
- histórico de alterações;
- comentários, menções e notificações;
- anexos privados;
- ações em massa;
- filtros salvos;
- indicadores e comparação de períodos;
- arquivamento;
- backup JSON;
- log de acesso;
- sessão de 3 horas por inatividade;
- tema claro e escuro;
- PWA instalável;
- atalhos de teclado.

## Regras de visualização

Administradores visualizam todos os grupos.

Solicitantes:

- Squad A ou B: Programações dos Squads A e B;
- Squad D ou E: Programações dos Squads D e E;
- Cancelamento e TEF Elgin: somente quando criou a solicitação ou foi atribuído como responsável.

O Squad é obrigatório para solicitantes e para todas as solicitações.

## Estrutura do projeto

```text
.github/workflows/pages.yml
app.js
supabase-compat.js
supabase-config.js
save-flow.js
styles.css
index.html
service-worker.js
manifest.webmanifest
VERSION
version.json
supabase/schema.sql
supabase/bootstrap-admin.sql
scripts/migrate-firestore-to-supabase.mjs
scripts/import-backup-to-supabase.mjs
scripts/migration-common.mjs
tests/
MIGRACAO_SUPABASE.md
```

## Configuração rápida

1. Crie o projeto Supabase.
2. Execute `supabase/schema.sql` no SQL Editor.
3. Configure a URL do GitHub Pages em Authentication.
4. Desative a confirmação de e-mail para os convites internos.
5. Crie o primeiro usuário em Authentication.
6. Execute `supabase/bootstrap-admin.sql`.
7. Preencha `supabase-config.js` com Project URL e chave anon/publishable.
8. Execute o teste e a migração dos dados.
9. Publique no GitHub somente após conferir o relatório.

O procedimento completo está em [MIGRACAO_SUPABASE.md](MIGRACAO_SUPABASE.md).

## Configuração pública

```js
export const supabaseConfig = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_CHAVE_ANON_OU_PUBLISHABLE"
};
```

Nunca coloque `service_role` no frontend ou no GitHub.

## Migração dos usuários

As senhas do Firebase não são copiadas. A migração pode criar automaticamente os usuários no Supabase Auth usando os mesmos e-mails antigos. Depois, cada colaborador usa **Esqueci minha senha** para definir uma nova senha. Também é possível criar os usuários antes por convites manuais.

## Migração dos dados

Direto do Firestore:

```bash
npm install
npm run migrate:firebase:dry
npm run migrate:firebase:create-users
```

Por backup JSON:

```bash
npm install
npm run import:backup -- "caminho-do-backup.json" --dry-run
npm run import:backup:create-users -- "caminho-do-backup.json"
```

Os comandos exigem variáveis de ambiente descritas em `MIGRACAO_SUPABASE.md`.

## Testes automatizados

```bash
npm test
```

Os testes verificam:

- arquivos obrigatórios;
- sintaxe do frontend e scripts de migração;
- sincronização da versão;
- ausência do SDK Firebase no frontend;
- presença da configuração Supabase;
- ausência de `service_role` no arquivo público;
- timeout e repetição do salvamento;
- uso do Storage nos anexos;
- cache da PWA;
- workflow de publicação;
- tabelas, RLS, políticas por Squad e Storage no SQL.

O GitHub Actions só publica quando todos os testes passam.

## Atalhos

| Atalho | Ação |
|---|---|
| `N` | Nova solicitação |
| `F` | Busca |
| `K` | Kanban ampliado |
| `R` | Atualizar tela |
| `?` | Ajuda |
| `T` | Tema |
| `M` | Notificações |
| `S` | Filtros salvos |
| `B` | Ações em massa — admin |
| `I` | Indicadores — admin |
| `A` | Arquivados — admin |
| `U` | Usuários — admin |
| `Shift + A` | Selecionar cards visíveis |
| `Shift + Esc` | Limpar seleção |
| `C` | Comentários |
| `L` | Histórico |
| `Ctrl + Enter` | Salvar ou enviar comentário |
| `Esc` | Fechar diálogo |

## Segurança

- políticas RLS são a proteção principal;
- anexos ficam em bucket privado;
- `service_role` é usada somente nos scripts locais de migração;
- o JSON da conta de serviço Firebase não pode ser versionado;
- usuários desativados ou bloqueados não passam pelas políticas de acesso;
- solicitantes não podem alterar perfil, Squad ou permissões privilegiadas.

## Versionamento

Até a versão 99 permanece a numeração sequencial atual.

Depois:

- `1.0.0`: primeira versão semântica;
- `1.0.1`: correção;
- `1.1.0`: melhoria menor;
- `2.0.0`: evolução grande ou incompatível.

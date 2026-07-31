# Painel de Solicitações — versão 48

Aplicação web interna para controlar solicitações em um **Kanban único de projetos**, com formulários configuráveis, autenticação, permissões por perfil e Squad, comentários, histórico, notificações, indicadores, arquivamento, backup e recursos administrativos.

## Arquitetura atual

- **GitHub Pages**: publicação do painel estático.
- **Supabase Auth**: login, sessão e recuperação de senha.
- **Supabase PostgreSQL**: solicitações, usuários, comentários, histórico e configurações.
- **Supabase Storage**: anexos das solicitações.
- **Row Level Security — RLS**: controle de acesso no banco.
- **GitHub Actions**: testes e publicação automática.
- **PWA**: instalação do painel como aplicativo.

A migração do Firebase para o Supabase está documentada em `MIGRACAO_SUPABASE.md`.

## Perfis e grupos

### Administrador

- Visualiza solicitações de todos os Squads.
- Gerencia usuários, grupos, bloqueios e convites.
- Move, edita, conclui, arquiva e exclui solicitações.
- Acessa Indicadores, Arquivados, Segurança e Backup.
- Pode salvar uma preferência de filtro por Squad.

### Solicitante

O perfil deve possuir um grupo obrigatório:

- Squad A;
- Squad B;
- Squad D;
- Squad E.

Visibilidade das Programações:

- Squads A e B visualizam Programações de A e B.
- Squads D e E visualizam Programações de D e E.

Cancelamentos e TEF Elgin permanecem limitados ao criador, responsável ou administrador, conforme as políticas RLS.

## Funcionalidades principais

- Kanban único com colunas configuráveis pela interface administrativa.
- Projetos e formulários configuráveis, mantendo Programação, Cancelamento e TEF Elgin como projetos padrão.
- Filtros por texto, projeto, prioridade, Squad e solicitante.
- Filtros salvos por usuário.
- Modo ampliado do Kanban.
- Ações em massa e seleção por coluna para administradores.
- Histórico automático das alterações.
- Comentários internos, menções e modelos de comentários.
- Notificações internas.
- Pausa automática do tempo em Aguardando e Bloqueio.
- Indicadores e comparação por período.
- Arquivamento e restauração.
- Backup JSON administrativo.
- Log de acesso.
- Tema claro e escuro.
- Atalhos de teclado.
- Instalação como PWA.

## Projetos e tipos de solicitação

### Programação

Inclui cliente, CNPJ, solicitante, contato, título, descrição, comportamento atual, comportamento esperado, justificativa, vídeo e anexos.

O botão **Copiar dados** pode ser utilizado por administradores e solicitantes que possuam acesso à Programação.

### Cancelamento

Permite montar uma lista de clientes e acompanhar a marcação individual de cancelamento no CRM.

### TEF Elgin

Inclui CNPJ, Razão Social, sistema operacional, memória, sistema utilizado, estabelecimento, SAK, PIN Pad, adquirente, responsável, CPF, contato, valor combinado e informações de PIX.

A opção **Vai utilizar PIX** inicia desmarcada. Quando marcada, libera um campo adicional de até 1.000 caracteres.

## Recuperação e alteração de senha

### Esqueci minha senha

O Supabase envia um link de recuperação por e-mail. Quando o usuário abre o link, o painel identifica o evento `PASSWORD_RECOVERY` e mostra a tela obrigatória **Criar nova senha**.

Nesse fluxo:

- não é solicitada a senha anterior;
- o usuário informa a nova senha e a confirmação;
- a janela não fecha pelo fundo, pelo botão cancelar ou pela tecla `Esc`;
- a senha é atualizada com `updateUser` na sessão temporária de recuperação;
- a sessão temporária é encerrada;
- o usuário retorna ao login para entrar com a nova senha.

### Alterar senha dentro do painel

O botão de chave continua utilizando o fluxo normal e exige:

- senha atual;
- nova senha;
- confirmação da nova senha.

## SMTP para recuperação de senha

O envio de e-mails deve ser configurado no Supabase em **Authentication → SMTP Settings**.

Exemplo com Brevo:

- Host: `smtp-relay.brevo.com`;
- Porta: `587`;
- Username: login SMTP fornecido pelo Brevo;
- Password: chave SMTP;
- Sender email: remetente validado no Brevo.

Nunca coloque senha SMTP, `service_role`, `sb_secret_`, senha do banco ou credenciais administrativas em arquivos do GitHub.

## Configuração pública do Supabase

O painel importa `supabase-config.js`:

```javascript
export const supabaseConfig = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_CHAVE_PUBLICA_PUBLISHABLE"
};
```

Apenas a URL pública e a chave `publishable`/`anon` devem ficar nesse arquivo. A segurança dos dados depende das políticas RLS.

Ao atualizar versões, preserve o seu `supabase-config.js` já preenchido.

## Publicação no GitHub Pages

1. Mantenha o `supabase-config.js` atual do repositório.
2. Substitua os demais arquivos da versão.
3. Faça o commit.
4. O GitHub Actions executará `npm test`.
5. O deploy ocorre apenas se os testes passarem.
6. Após a publicação, atualize com `Ctrl + Shift + R`.

A versão 48 não exige refazer a migração. Depois de publicar os arquivos, execute uma vez `supabase/projects-kanban-v48.sql` no SQL Editor do Supabase. Não execute novamente o `schema.sql` completo.

## Testes automatizados

Execute no Windows:

```powershell
npm.cmd test
```

Ou:

```text
TESTAR.bat
```

A versão 48 possui testes para:

- arquivos obrigatórios;
- sintaxe JavaScript;
- sincronização da versão;
- estrutura e políticas do Supabase;
- fluxo de salvamento e novas tentativas;
- scripts de migração;
- evento `PASSWORD_RECOVERY`;
- abertura da tela específica de nova senha;
- atualização sem exigir senha anterior;
- bloqueio do fechamento acidental da recuperação;
- Content Security Policy e ausência de eventos inline;
- ausência de credenciais e arquivos privados;
- RPCs de histórico e notificações;
- RLS reforçado para anexos, auditoria e notificações;
- configuração do CodeQL e Dependabot.
- autenticação em duas etapas e exigência de AAL2 para contas com MFA;
- política forte de senha e integração opcional com Turnstile;
- confirmação recente de identidade para ações administrativas;
- integridade e retenção do backup;
- validação da assinatura real dos anexos;
- cache restrito aos arquivos públicos do aplicativo;
- criação, audiência, publicação e arquivamento de projetos;
- validações de formulários dinâmicos e limite de 1.000 caracteres;
- colunas dinâmicas, pausa, conclusão e preservação histórica;
- migração e proteção SQL da versão 48.

Os testes automatizados não substituem a validação real do e-mail, do link de recuperação e das credenciais do projeto Supabase.

## Atalhos

| Atalho | Ação |
|---|---|
| `N` | Nova solicitação |
| `F` | Focar a busca |
| `K` | Kanban ampliado |
| `R` | Atualizar o painel |
| `?` | Abrir Ajuda |
| `T` | Alternar tema |
| `M` | Abrir notificações |
| `S` | Focar filtros salvos |
| `B` | Ações em massa — administrador |
| `I` | Indicadores — administrador |
| `A` | Arquivados — administrador |
| `U` | Usuários — administrador |
| `Shift + A` | Selecionar cards visíveis |
| `Shift + Esc` | Limpar seleção em massa |
| `C` | Abrir Comentários |
| `L` | Abrir Histórico |
| `Ctrl + Enter` | Salvar ou enviar comentário |
| `Esc` | Fechar diálogo comum ou modo ampliado |

Durante a recuperação de senha, `Esc` não fecha a janela obrigatória.

## Versionamento

- Até a versão 99: numeração sequencial.
- Depois da 99: `1.0.0`.
- Correções: `1.0.1`, `1.0.2`.
- Melhorias menores: `1.1.0`, `1.2.0`.
- Grandes evoluções: `2.0.0`, `3.0.0`.


## Alteração da versão 48

### Projetos, formulários e Kanban dinâmico

- converte Programação, Cancelamento e TEF Elgin em projetos padrão do mesmo Kanban;
- permite criar, editar, publicar, arquivar e reativar projetos pela interface;
- controla quem pode criar solicitações: administradores, solicitantes ou todos;
- oferece CPF/CNPJ, Razão Social, Telefone e E-mail com validação e obrigatoriedade configuráveis;
- permite campos personalizados com nome, placeholder, ordem, obrigatoriedade e até 1.000 caracteres;
- permite criar, editar, ordenar, arquivar e reativar colunas;
- permite marcar colunas que pausam o tempo ou representam conclusão;
- preserva o formulário original de cada solicitação por snapshot;
- move o filtro de projeto para dentro da tela do Kanban;
- valida projetos, colunas, campos e permissões também no Supabase por RLS e trigger.

Depois de publicar, execute uma única vez:

```text
supabase/projects-kanban-v48.sql
```

O passo a passo administrativo está em `PROJETOS_E_KANBAN_V48.md` e também na tela **Ajuda** do painel.

## Alteração da versão 47

### Política e termo de uso obrigatório

- apresenta a Política de Uso, Confidencialidade e Proteção de Dados no próximo acesso de cada usuário;
- exige rolagem até o final e três confirmações antes de liberar o aceite;
- impede o acesso aos dados operacionais e anexos por RLS enquanto a versão vigente não tiver sido aceita;
- registra versão, hash SHA-256, data, usuário, perfil, Squad, dispositivo e IP disponível no Supabase;
- permite ao administrador identificar na gestão de usuários quem aceitou o termo vigente;
- mantém o documento disponível no menu **Termos e privacidade**;
- remove o armazenamento separado do e-mail no `localStorage`, atendendo aos alertas do CodeQL.

Depois de publicar, execute uma única vez:

```text
supabase/legal-terms-v47.sql
```

O texto integral está em `legal/termo-uso-confidencialidade-v1.html` e a versão editável em Markdown está em `POLITICA_E_TERMO_DE_USO.md`. Qualquer alteração no texto exige nova versão e novo hash.

## Alteração da versão 46

### Segurança complementar

- adiciona política forte de senha para convites e redefinições;
- oferece CAPTCHA Turnstile opcional;
- permite MFA TOTP para administradores;
- exige AAL2 no banco para contas que ativaram MFA;
- exige confirmação recente de senha para backup e gestão de usuários;
- classifica o backup, registra sua finalidade e inclui hash SHA-256;
- valida o conteúdo real dos anexos e utiliza nomes internos aleatórios;
- limita o service worker aos arquivos estáticos públicos;
- limpa a sessão local durante o logout.

Depois de publicar, execute uma única vez:

```text
supabase/security-hardening-v46.sql
```

As configurações e os testes manuais estão em `SEGURANCA_COMPLEMENTAR_V46.md`.

## Alteração da versão 45

### Endurecimento urgente de segurança

- valida a solicitação associada ao metadado e ao caminho de cada anexo;
- define autores de auditoria no banco usando o usuário autenticado;
- cria histórico e notificações por RPCs controladas;
- restringe notificações aos participantes da demanda;
- impede alteração do conteúdo de notificações pelo destinatário;
- adiciona CSP e remove eventos JavaScript inline;
- adiciona CodeQL, Dependabot e testes de vazamento de segredos;
- amplia o `.gitignore` para relatórios, backups e credenciais.

Depois de publicar, execute uma única vez:

```text
supabase/security-hardening-v45.sql
```

Não refaça a migração e não execute novamente o `schema.sql` completo. A auditoria detalhada está em `SEGURANCA_URGENTE.md`.

## Correção mantida da versão 44

A separação entre `insert` e `update` para perfis solicitantes permanece ativa. O arquivo `supabase/fix-request-save-v44.sql` é mantido apenas como histórico de atualização.

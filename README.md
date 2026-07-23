# Painel de Solicitações

Aplicação web interna para centralizar solicitações de **Programação**, **Cancelamento** e **TEF Elgin** em um Kanban com autenticação, permissões, comentários, notificações, histórico, indicadores, arquivamento e recursos administrativos.

O projeto é publicado no **GitHub Pages** e usa:

- **Firebase Authentication** para login por e-mail e senha;
- **Cloud Firestore** para solicitações, usuários, comentários, anexos e configurações;
- **GitHub Actions** para publicação e controle automático de build;
- **PWA** para instalação do painel como aplicativo.

> **Versão 34:** melhora o espaçamento interno dos cartões de Segurança e backup, deixando os textos afastados das bordas e mais consistentes com o restante do painel.


---

## 1. Funcionalidades principais

### Acesso e usuários

- Login individual por e-mail e senha.
- restauração da sessão sem exibir rapidamente a tela de login durante a atualização da página;
- Recuperação de senha por e-mail.
- Alteração da própria senha dentro do painel.
- Perfis `admin` e `solicitante`;
- solicitantes dos Squads A e B visualizam Programações dos Squads A e B; solicitantes dos Squads D e E visualizam Programações dos Squads D e E;
- solicitações de Cancelamento e TEF Elgin continuam visíveis apenas para quem criou, recebeu como responsável ou possui perfil administrador.
- Cadastro de usuários por convite.
- Convites válidos por 7 dias.
- Alteração de nome, perfil e Squad pela interface administrativa.
- Ativação e desativação sem apagar o histórico.
- Bloqueio temporário de acesso pelo administrador.
- Desbloqueio do acesso pela tela **Usuários**.
- Registro de último acesso e quantidade de entradas.
- Desconexão em tempo real quando o acesso é desativado ou bloqueado.

### Kanban

Etapas disponíveis:

1. **Nova**;
2. **Em análise**;
3. **Aguardando**;
4. **Bloqueio**;
5. **Concluída**.

Recursos:

- atualização em tempo real;
- arrastar e soltar para administradores;
- rolagem independente por coluna;
- modo ampliado mostrando somente o Kanban e encerrando automaticamente qualquer ação em massa ativa;
- ordenação da demanda mais antiga para a mais recente;
- destaque visual da solicitação mais antiga;
- busca por cliente, CNPJ, título ou solicitante;
- filtros por tipo, prioridade, grupo de atendimento e solicitante;
- grupos disponíveis: **Squad A**, **Squad B**, **Squad D** e **Squad E**;
- filtros favoritos salvos por usuário;
- contador de comentários e anexos no card;
- CNPJ completo no card de Programação;
- seleção de todos os cards visíveis de uma coluna no modo de ações em massa;
- o modo em massa sempre inicia desativado após login, atualização da página ou troca de sessão.

### Grupos de atendimento

Toda solicitação deve ser vinculada a um grupo responsável:

- **Squad A**;
- **Squad B**;
- **Squad D**;
- **Squad E**.

O grupo aparece no card, nos detalhes, no texto copiado e no histórico. O filtro por grupo está disponível no Kanban, em Indicadores e em Arquivados. Os filtros favoritos também guardam o grupo escolhido. A classificação por Squad também controla a leitura das Programações para solicitantes. Administradores continuam vendo todos os grupos. O filtro do administrador salva automaticamente a última opção escolhida no perfil, inclusive **Todos os grupos**.

### Tipos de solicitação

#### Programação

Campos principais:

- Grupo de atendimento;
- Razão Social;
- CNPJ obrigatório e validado;
- Solicitante;
- Cargo;
- E-mail;
- Telefone com DDD;
- Título;
- Descrição da solicitação;
- Comportamento atual;
- Comportamento esperado;
- Justificativa;
- Link de vídeo opcional;
- até dois anexos opcionais.

Depois do primeiro salvamento, o **tipo da solicitação não pode ser alterado**.

#### Cancelamento

O formulário também exige a seleção do grupo de atendimento responsável.

Para cada cliente é obrigatório informar:

- CPF/CNPJ **ou** Razão Social;
- Motivo.

O técnico preenche os campos fixos, adiciona o cliente à lista e repete o processo. O administrador pode marcar individualmente ou em massa os clientes já cancelados no CRM.

#### TEF Elgin

O formulário também exige a seleção do grupo de atendimento responsável.

Campos:

- CNPJ validado;
- sistema operacional;
- memória RAM acima de 4 GB;
- sistema utilizado;
- número do estabelecimento;
- número lógico do PIN Pad — SAK;
- modelo do PIN Pad;
- adquirente;
- proprietário;
- CPF validado;
- telefone com DDD;
- e-mail;
- valor combinado.

---

## 2. Histórico de alterações

Cada solicitação salva possui a aba **Histórico**.

O painel registra automaticamente as principais ações:

- criação;
- edição de campos;
- alteração de status;
- alteração de responsável;
- comentários;
- controle de cancelamento no CRM;
- ações em massa;
- arquivamento;
- restauração.

Cada registro contém usuário, data, horário e resumo da ação.

Os históricos ficam na coleção:

```text
requestHistory
```

Solicitantes visualizam o histórico das solicitações às quais possuem acesso. Administradores também visualizam o histórico de solicitações arquivadas.

---

## 3. Pausa do tempo

O painel diferencia **tempo total** e **tempo ativo**.

### Quando o tempo é pausado

O contador de tempo ativo para automaticamente quando a solicitação entra em:

- **Aguardando**;
- **Bloqueio**.

### Quando o tempo volta a contar

A contagem continua quando a solicitação volta para:

- **Nova**;
- **Em análise**.

Ao concluir uma solicitação que estava pausada, o período atual de pausa também é acumulado.

### Campos utilizados

```text
pausedDurationMs
pauseStartedAt
lastStatusChangedAt
```

Solicitações antigas continuam funcionando. Os campos são criados quando ocorrer uma nova mudança de status.

### Exibição

- O card mostra **TEMPO PAUSADO** nas etapas Aguardando e Bloqueio.
- O tempo apresentado no card é o tempo efetivo em atividade.
- Os detalhes da solicitação mostram tempo ativo e tempo pausado.
- Os indicadores somam o tempo pausado no período.

---

## 4. Comentários, modelos e notificações

### Comentários internos

A aba **Comentários** permite registrar alinhamentos sem alterar a descrição original.

- O administrador pode marcar o solicitante ou o responsável.
- O usuário marcado recebe uma notificação interna.
- Ao clicar na notificação, a solicitação abre diretamente nos comentários.

### Modelos de comentários

O painel possui modelos padrão, como:

- Aguardando vídeo;
- Documento pendente;
- CNPJ inválido;
- Em análise;
- Dados TEF pendentes.

Administradores podem criar e excluir modelos compartilhados pelo botão **Gerenciar**.

Os modelos personalizados ficam em:

```text
commentTemplates
```

### Alertas automáticos

O painel gera notificações quando:

- uma solicitação é atribuída a um usuário;
- um usuário é mencionado em comentário;
- o status muda;
- a solicitação entra em Bloqueio;
- a solicitação permanece com o tempo pausado por mais de 24 horas.

O alerta de pausa de 24 horas é enviado uma vez por ciclo de pausa.

---

## 5. Ações em massa

Disponíveis somente para administradores.

1. Clique em **Em massa**.
2. Marque os cards desejados individualmente ou use a caixa **Todos** no topo de uma coluna.
3. A caixa da coluna seleciona apenas os cards atualmente visíveis naquela etapa e respeita busca e filtros.
4. Escolha uma ação.

Ações disponíveis:

- alterar status;
- definir responsável;
- marcar todos os cancelamentos no CRM;
- arquivar solicitações concluídas.

Atalhos relacionados:

- `B`: entrar ou sair do modo em massa;
- `Shift + A`: selecionar todos os cards visíveis;
- `Shift + Esc`: limpar a seleção.

---

## 6. Filtros salvos

Cada usuário pode salvar combinações de:

- texto de busca;
- tipo;
- prioridade;
- solicitante.

### Como usar

1. Configure os filtros.
2. Clique em **Salvar filtro**.
3. Informe um nome.
4. Use o seletor **Filtros salvos** para reaplicar.
5. Use o botão `×` ao lado do seletor para excluir o filtro selecionado.

Os filtros são pessoais e ficam em:

```text
savedFilters
```

---

## 7. Indicadores gerenciais

A tela **Indicadores** é exclusiva para administradores.

Indicadores disponíveis:

- solicitações criadas;
- solicitações concluídas;
- tempo médio ativo de conclusão;
- quantidade em Bloqueio;
- taxa de conclusão;
- quantidade arquivada;
- tempo total pausado;
- variação do volume em relação ao período anterior;
- distribuição por status;
- distribuição por tipo;
- tempo médio ativo por tipo;
- volume e desempenho por técnico.

### Comparação por período

O painel compara o intervalo selecionado com o período imediatamente anterior de mesma duração.

Exemplo:

- período selecionado: 1 a 30 de julho;
- comparação automática: 1 a 30 de junho.

A variação é apresentada em percentual.

---

## 8. Arquivamento

- Somente solicitações concluídas podem ser arquivadas.
- Apenas administradores arquivam e restauram.
- A solicitação sai da coleção ativa e deixa de pesar no Kanban.
- Dados, comentários, anexos e histórico são mantidos.
- Existe uma ação para arquivar concluídas há mais de 30 dias.

Coleções:

```text
requests
archivedRequests
```

---

## 9. Backup e log de acesso

A tela **Segurança e backup** é exclusiva para administradores.

### Backup

O botão **Baixar backup JSON** gera uma cópia contendo:

- solicitações ativas;
- solicitações arquivadas;
- comentários;
- histórico;
- anexos do Firestore;
- usuários;
- convites;
- notificações;
- filtros salvos;
- modelos de comentários;
- logs de acesso.

> O painel gera a cópia para segurança e consulta. A importação automática do backup não está implementada nesta versão.

Como os anexos podem estar no arquivo, o backup pode ficar grande. Armazene-o em local protegido.

### Log de acesso

São registrados:

- login;
- logout manual;
- expiração por inatividade;
- alteração de senha;
- geração de backup.

Os eventos ficam em:

```text
accessLogs
```

A tabela administrativa mostra data, usuário, evento e navegador/dispositivo.

---

## 10. Sessão e segurança

### Expiração por inatividade

A sessão expira após **3 horas sem atividade**.

Atividades consideradas:

- clique ou toque;
- movimentação do mouse;
- teclado;
- rolagem.

Nos últimos **5 minutos**, o painel abre um diálogo com contador regressivo.

O usuário pode:

- clicar em **Continuar conectado**;
- sair imediatamente;
- deixar o contador terminar e ser desconectado.

### Bloqueio temporário administrativo

Na tela **Usuários**, o administrador pode:

- bloquear temporariamente um acesso;
- desbloquear o usuário;
- desativar completamente;
- reativar.

O bloqueio temporário não apaga dados e desconecta o usuário quando o perfil é atualizado.

O Firebase Authentication também possui proteções próprias contra abuso de tentativas de login. O painel não cria um bloqueio automático global baseado em senha incorreta, pois o projeto é estático e não utiliza servidor administrativo.

---

## 11. Aplicativo instalável — PWA

A instalação PWA utiliza:

```text
manifest.webmanifest
service-worker.js
icon-192.png
icon-512.png
```

Quando o navegador permitir a instalação, aparece um botão de download no rodapé lateral.

A instalação funciona melhor no GitHub Pages, porque PWA requer HTTPS. O painel pode ser aberto em uma janela própria, como aplicativo.

A autenticação e a sincronização dos dados continuam exigindo conexão com o Firebase.

---

## 12. Tema claro e escuro

Use o botão `◐` no rodapé para alternar o tema.

A preferência é salva no navegador:

```text
localStorage: painel-theme
```

Na primeira abertura, o painel respeita a preferência de tema do sistema operacional.

---

## 13. Atalhos de teclado

As teclas simples não são executadas enquanto o usuário estiver digitando em um campo, textarea ou seletor.

### Globais

| Atalho | Ação |
|---|---|
| `N` | Abrir Nova solicitação |
| `F` | Focar a busca |
| `K` | Ativar ou sair do Kanban ampliado |
| `R` | Atualizar a renderização do painel |
| `?` | Abrir a Ajuda na seção de produtividade |
| `T` | Alternar tema claro/escuro |
| `M` | Abrir notificações |
| `S` | Focar o seletor de filtros salvos |

### Administrador

| Atalho | Ação |
|---|---|
| `B` | Ativar ou sair de Ações em massa |
| `I` | Abrir Indicadores |
| `A` | Abrir Arquivados |
| `U` | Abrir Usuários |
| `Shift + A` | Selecionar todos os cards visíveis no modo em massa |
| `Shift + Esc` | Limpar a seleção em massa |

### Solicitação aberta

| Atalho | Ação |
|---|---|
| `C` | Abrir Comentários |
| `L` | Abrir Histórico |
| `Ctrl + Enter` | Salvar formulário ou enviar comentário |
| `Esc` | Fechar diálogo ou sair do Kanban ampliado |

---

## 14. Estrutura de arquivos

```text
painel-solicitacoes/
├── .github/
│   └── workflows/
│       └── pages.yml
├── index.html
├── styles.css
├── app.js
├── firebase-config.js
├── firestore.rules
├── logo-soften.png
├── icon-192.png
├── icon-512.png
├── manifest.webmanifest
├── service-worker.js
├── VERSION
├── version.json
├── README.md
└── ATUALIZAR.txt
```

---

## 15. Configuração inicial do Firebase

### Criar o projeto

1. Crie um projeto no Console do Firebase.
2. Adicione um aplicativo Web.
3. Copie o objeto `firebaseConfig`.
4. Cole os dados em `firebase-config.js`.

Mantenha o início do arquivo como:

```javascript
export const firebaseConfig = {
```

### Authentication

1. Abra **Authentication**.
2. Ative **E-mail/senha**.
3. Autorize o domínio do GitHub Pages.

Exemplo:

```text
joseeduardopagnossim.github.io
```

### Firestore

1. Crie o Firestore em modo de produção.
2. Abra **Firestore Database → Regras**.
3. Cole todo o conteúdo de `firestore.rules`.
4. Clique em **Publicar**.

As coleções novas são criadas automaticamente durante o uso.

---

## 16. Perfil do primeiro administrador

Depois de criar o usuário em **Authentication**, copie o UID.

Crie no Firestore:

```text
users/UID_DO_ADMIN
```

Campos:

| Campo | Tipo | Valor |
|---|---|---|
| `name` | string | Nome do administrador |
| `email` | string | Mesmo e-mail do Authentication |
| `role` | string | `admin` |
| `active` | boolean | `true` |
| `accessLocked` | boolean | `false` |

Os demais usuários podem ser cadastrados por convite dentro do painel.

---

## 17. Publicação no GitHub Pages

O repositório deve usar **GitHub Actions** como fonte.

1. Envie todos os arquivos para a branch `main`.
2. Abra **Settings → Pages**.
3. Em **Source**, selecione **GitHub Actions**.
4. Abra **Actions** e acompanhe o workflow **Publicar painel no GitHub Pages**.
5. Aguarde a execução ficar verde.
6. Atualize o painel com `Ctrl + F5`.

### Política de versionamento a partir da versão 100

Até a versão 99, o projeto mantém a numeração sequencial atual. A versão seguinte será publicada como **1.0.0**. A partir daí:

- correções de erro: incrementam o último número (`1.0.1`, `1.0.2`);
- melhorias menores e compatíveis: incrementam o número central (`1.1.0`, `1.2.0`);
- grandes evoluções ou mudanças estruturais: incrementam o primeiro número (`2.0.0`, `3.0.0`).

O workflow já aceita valores como `1.0.0` no arquivo `VERSION`, portanto não será necessário alterar o processo de publicação no GitHub Actions.

O arquivo `VERSION` contém o número funcional da versão. O workflow gera automaticamente:

- número do build;
- commit;
- data de publicação.

---

## 18. Atualização para a versão 31

Envie ao GitHub todos os arquivos deste pacote, mantendo o seu `firebase-config.js` atual.

Depois, publique obrigatoriamente o novo `firestore.rules` no Firebase. Antes de liberar o acesso, abra a tela **Usuários** e atribua um Squad a cada solicitante existente.

### Cache da PWA

Se o navegador continuar mostrando uma versão anterior:

1. aguarde o GitHub Actions terminar;
2. pressione `Ctrl + F5`;
3. se necessário, abra as ferramentas do navegador;
4. em **Application → Service Workers**, clique em **Update** ou remova o service worker antigo;
5. abra o painel novamente.

---

## 19. Coleções utilizadas

```text
users
userInvites
requests
archivedRequests
requestComments
requestHistory
requestAttachments
notifications
savedFilters
commentTemplates
accessLogs
```

---

## 20. Segurança importante

- O `firebase-config.js` é público por natureza em aplicações Web Firebase.
- A proteção real depende do Authentication e do `firestore.rules`.
- Não use regras abertas em produção.
- Teste as permissões com contas `admin` e `solicitante`.
- Guarde backups em local restrito.
- Não compartilhe arquivos de backup em canais públicos.
- O projeto usa armazenamento de anexos no Firestore para permanecer no plano gratuito; respeite o limite de tamanho definido no painel.

## Correções e orientações da versão 28

### Backup administrativo

O backup consulta todas as coleções necessárias, inclusive filtros salvos de todos os usuários. Por isso, depois de atualizar o painel, é obrigatório publicar o arquivo `firestore.rules` da mesma versão. Se as regras antigas permanecerem publicadas, o Firebase exibirá erro de permissão ao gerar a cópia.

### Tema escuro

Os formulários, campos bloqueados, comentários, anexos, tabelas e a Central de Ajuda possuem estilos próprios para o tema escuro. O conteúdo deve permanecer legível tanto no modo claro quanto no escuro.

### Atalhos na Ajuda

Abra **Ajuda > Produtividade** para consultar a lista completa de atalhos, ações em massa, pausa do tempo, alertas automáticos, filtros salvos, instalação do aplicativo e segurança da sessão.

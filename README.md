# Painel de Solicitações

Aplicação web interna para centralizar **solicitações de programação**, **chamados para cancelamento** e **solicitações TEF Elgin** em um quadro Kanban, com autenticação individual, acompanhamento por status, destaque das demandas mais antigas e controle de permissões.

O projeto foi preparado para ser publicado no **GitHub Pages** e utiliza o **Firebase Authentication** e o **Cloud Firestore** como serviços de login, banco de dados e armazenamento dos anexos.

---

> Versão 19: inclui comentários internos com menção e notificação, coluna Bloqueio, indicadores gerenciais exclusivos para administradores e arquivamento de solicitações concluídas.

## Funcionalidades disponíveis

### Acesso e usuários

- Login individual por e-mail e senha.
- Recuperação de senha pelo botão **Esqueci minha senha**.
- Alteração da própria senha dentro do painel, mediante confirmação da senha atual e sem envio de e-mail.
- Perfis de acesso `admin` e `solicitante`.
- Bloqueio de usuário sem apagar o histórico, alterando o campo `active` para `false`.
- Tela administrativa de usuários, visível somente para o perfil `admin`.
- Cadastro por convite: o administrador informa nome, e-mail e perfil e o painel gera um link exclusivo.
- O colaborador abre o convite e cria a própria senha.
- Convites válidos por 7 dias, com opções de copiar e cancelar.
- Ativação, desativação e reativação de usuários sem apagar o histórico.
- Alteração de nome e perfil pela interface administrativa.
- Envio de redefinição de senha pelo administrador.
- Desconexão automática quando um usuário é desativado.
- Identificação do usuário responsável por cada solicitação.

### Kanban e acompanhamento

- Etapas:
  - **Nova**;
  - **Em análise**;
  - **Aguardando**;
  - **Bloqueio**;
  - **Concluída**.
- Atualização em tempo real pelo Cloud Firestore.
- Arrastar e soltar cartões entre as colunas, disponível para administradores.
- Contador de tempo em cada cartão.
- Ordenação automática da solicitação mais antiga para a mais recente.
- Destaque do cartão mais antigo.
- Alerta visual após 24 horas.
- Destaque crítico após 48 horas.
- Indicadores de solicitações em aberto, mais antiga, programações e concluídas.
- Busca por cliente, título, assunto ou solicitante.
- Filtros por tipo, prioridade e solicitante.
- Campo para definição do responsável.
- Layout responsivo para computador e celular.
- Cada coluna possui rolagem independente.
- A etapa **Bloqueio** identifica solicitações paradas por falta de informação, validação ou retorno.

### Comentários internos e notificações

Cada solicitação salva possui uma aba **Comentários**, destinada exclusivamente ao alinhamento interno da equipe.

- Administradores e usuários que possuem acesso à solicitação podem registrar comentários.
- O administrador pode selecionar o técnico solicitante ou o responsável pela demanda para enviar uma notificação interna.
- O usuário notificado visualiza um contador no botão **Notificações**.
- Ao abrir a notificação, o painel direciona para a aba de comentários da solicitação.
- Os comentários registram autor, data, horário e eventual usuário mencionado.
- Comentários permanecem vinculados à solicitação mesmo após o arquivamento.

### Indicadores gerenciais

A tela **Indicadores** é exibida somente para administradores e apresenta:

- solicitações criadas no período;
- solicitações concluídas;
- tempo médio de conclusão;
- solicitações em Bloqueio;
- taxa de conclusão;
- quantidade de solicitações arquivadas;
- distribuição por status;
- distribuição por tipo;
- volume criado, concluído, em aberto e bloqueado por técnico.

É possível filtrar por período e tipo de solicitação. Os indicadores consideram solicitações ativas e arquivadas.

### Arquivamento

O arquivamento mantém o Kanban principal mais leve, pois solicitações antigas são movidas da coleção ativa para uma coleção de histórico.

- Somente administradores podem arquivar ou restaurar.
- Apenas solicitações concluídas podem ser arquivadas.
- A solicitação deixa de aparecer no Kanban, mas preserva dados, comentários e anexos.
- A tela **Arquivados** permite pesquisar, abrir e restaurar registros.
- Existe uma ação para arquivar em lote solicitações concluídas há mais de 30 dias.
- Ao restaurar, a solicitação retorna para a coluna **Concluídas**.

### Solicitação de programação

O CNPJ do cliente é obrigatório e validado antes do salvamento. Depois que a solicitação é criada, o tipo não pode mais ser alterado.


O formulário possui os seguintes campos:

#### Informações do cliente

- Razão Social;
- CNPJ obrigatório;
- Solicitante;
- Cargo;
- E-mail;
- Telefone.

#### Descrição da demanda

- Título;
- Descrição da solicitação;
- Comportamento atual;
- Comportamento esperado;
- Justificativa;
- Link do vídeo, opcional;
- Até dois anexos opcionais.

O administrador possui a ação **Copiar dados**, que copia o conteúdo no seguinte formato:

```text
Título:

=== Informações do Cliente ===
Razão Social:
CNPJ:

=== Dados do Solicitante ===
Solicitante:
Cargo:
Telefone:
E-mail:

=== Descrição da Demanda ===

Comportamento atual (O que acontece hoje?):

Comportamento esperado (O que deveria acontecer?):

Justificativa (Por que isso é importante? Qual o impacto/incômodo?):

Link Video:
```

### Chamado para cancelamento

O formulário de cancelamento utiliza campos fixos para:

- CPF/CNPJ;
- Razão Social;
- Motivo.

É obrigatório informar **CPF/CNPJ ou Razão Social**, não sendo necessário preencher os dois. Quando o documento for informado, ele precisa ser válido. O Motivo permanece obrigatório.

Funcionamento:

1. O técnico preenche os dados do primeiro cliente.
2. Clica em **Adicionar cliente à lista**.
3. O registro é inserido na tabela abaixo.
4. Os campos são limpos e permanecem no mesmo local.
5. O técnico repete o processo para cadastrar um ou mais clientes.
6. Após revisar a lista, salva a solicitação.

O administrador possui a ação **Copiar dados**, que copia toda a relação de cancelamentos de uma vez.

Depois que a solicitação é salva, a lista apresenta a coluna **Cancelado no CRM**. Somente administradores podem marcar ou desmarcar cada cliente. A alteração é salva imediatamente no Firestore, registra o administrador e a data da confirmação e não exige clicar novamente em **Salvar alterações**. As regras desta versão também impedem que um solicitante altere esse controle diretamente fora da interface.

O cartão do Kanban mostra o andamento no formato `CRM 3/8`. Quando todos os clientes da lista estão marcados, o indicador fica verde. Marcar todos os clientes no CRM não altera automaticamente o status geral da solicitação no Kanban.


### Solicitação TEF Elgin

O formulário TEF Elgin possui os seguintes campos obrigatórios:

- CNPJ, com validação;
- Sistema operacional;
- Memória RAM da máquina, com opções sempre superiores a 4 GB;
- Sistema utilizado: Gerencie Aqui, SIEM, Gerencie Vendas ou Outro;
- Número do estabelecimento;
- Número lógico do PIN Pad (SAK);
- Modelo do PIN Pad;
- Adquirente;
- Nome completo do proprietário;
- CPF do proprietário, com validação;
- Fone para contato, com DDD e validação;
- E-mail;
- Valor combinado.

O título é gerado automaticamente usando o CNPJ. O administrador também possui a ação **Copiar dados**, que copia todo o formulário TEF em um bloco formatado.

### Validações e máscaras

- Validação dos dígitos verificadores de CPF e CNPJ.
- Rejeição de documentos formados por números repetidos, como `000.000.000-00`.
- Máscara automática de CPF e CNPJ.
- Campo destacado em vermelho quando o documento é inválido.
- Mensagem **O documento não é válido** exibida abaixo do campo.
- Máscara automática de telefone fixo com DDD:

```text
(00) 0000-0000
```

- Máscara automática de celular com DDD:

```text
(00) 00000-0000
```

- Mensagem de validação quando o telefone não possui 10 ou 11 dígitos.
- Validação do formato do e-mail.

### Anexos sem Firebase Storage

Os anexos são armazenados diretamente no **Cloud Firestore**, na coleção `requestAttachments`. Dessa forma, o projeto não depende do Firebase Storage nem exige ativação do plano Blaze apenas para essa função.

Regras atuais:

- Até **2 anexos** por solicitação de programação.
- Anexos opcionais.
- Formatos permitidos:
  - `.jpeg`;
  - `.jpg`;
  - `.png`;
  - `.txt`.
- Imagens de origem podem ter até **5 MB**.
- As imagens são redimensionadas e compactadas no navegador antes do salvamento.
- O arquivo armazenado no Firestore deve ter no máximo aproximadamente **700 KB**.
- Arquivos TXT devem ter no máximo aproximadamente **700 KB**.
- Os anexos podem ser abertos e removidos nos detalhes da solicitação.
- Ao excluir uma solicitação, seus anexos também são excluídos.

> O limite final é menor porque cada documento do Firestore possui limite de tamanho. O sistema armazena cada anexo em um documento separado.

### Central de ajuda

O painel possui uma tela **Ajuda**, disponível no menu lateral e no topo, com orientações sobre:

- fluxo geral do painel;
- preenchimento da solicitação de programação;
- preenchimento de cada campo;
- cadastro de um ou vários cancelamentos;
- preenchimento da solicitação TEF Elgin;
- alteração da própria senha dentro do painel;
- funcionamento do Kanban;
- filtros, responsável e movimentação dos cartões;
- botão de copiar;
- regras de edição e exclusão;
- comentários internos e notificações;
- uso da etapa Bloqueio;
- indicadores gerenciais;
- arquivamento e restauração.

### Exclusão

- A exclusão é permitida somente para usuários com perfil `admin`.
- O botão não é exibido para solicitantes.
- Existe uma verificação adicional no JavaScript.
- As regras do Firestore também bloqueiam tentativas de exclusão feitas por usuários sem permissão.
- A confirmação é apresentada em um diálogo personalizado.
- O diálogo informa que a ação é permanente e não pode ser desfeita.

---

## Perfis e permissões

### Administrador

O administrador pode:

- abrir a área **Usuários**;
- criar e cancelar convites;
- editar nome e perfil dos usuários;
- desativar e reativar acessos;
- enviar redefinição de senha;
- alterar a própria senha sem envio de e-mail;
- visualizar todas as solicitações;
- filtrar por solicitante;
- criar solicitações;
- editar qualquer solicitação;
- alterar status;
- definir o responsável;
- arrastar cartões entre as etapas;
- copiar os dados formatados;
- abrir e remover anexos;
- excluir solicitações e seus anexos;
- registrar comentários internos e notificar o técnico;
- acessar indicadores gerenciais;
- arquivar e restaurar solicitações concluídas.

### Solicitante

O solicitante pode:

- criar solicitações;
- visualizar somente as próprias solicitações;
- editar somente as próprias solicitações enquanto estiverem na etapa **Nova**;
- adicionar ou remover anexos enquanto a solicitação puder ser editada;
- acompanhar o andamento e o tempo em aberto;
- visualizar e responder aos comentários internos das solicitações acessíveis;
- receber notificações quando for mencionado;
- visualizar solicitações em que foi definido como responsável;
- alterar a própria senha pelo ícone de chave no perfil, confirmando a senha atual.

O solicitante não pode:

- visualizar solicitações de outros usuários;
- alterar o status;
- definir o responsável;
- excluir solicitações.

---

## Arquitetura

O GitHub Pages hospeda apenas arquivos estáticos e não fornece autenticação segura nem banco de dados. Por isso, o projeto utiliza:

- **GitHub Pages**: hospedagem da página;
- **Firebase Authentication**: login por e-mail e senha, alteração da senha no painel e recuperação por e-mail;
- **Cloud Firestore**: usuários, solicitações, comentários, notificações, histórico e anexos;
- **Firestore Security Rules**: controle efetivo de leitura, criação, edição e exclusão.

### Coleções utilizadas

```text
users
userInvites
requests
archivedRequests
requestComments
notifications
requestAttachments
```

#### `users`

Armazena o perfil e a permissão de cada usuário.

#### `userInvites`

Armazena convites temporários criados pelos administradores. O link contém um token aleatório e expira após sete dias.

#### `requests`

Armazena as solicitações de programação, cancelamento e TEF Elgin.

#### `archivedRequests`

Armazena solicitações concluídas retiradas do Kanban principal. Esta separação reduz o volume carregado em tempo real pela tela operacional.

#### `requestComments`

Armazena os comentários internos vinculados pelo campo `requestId`.

#### `notifications`

Armazena notificações internas de menção destinadas a um usuário específico.

#### `requestAttachments`

Armazena os anexos em documentos separados, usando dados binários do tipo `bytes`.

---

## 1. Criar o projeto no Firebase

1. Acesse o Console do Firebase e crie um projeto.
2. Em **Visão geral do projeto**, clique em **Adicionar app**.
3. Selecione **Web**.
4. Dê um nome ao aplicativo.
5. Copie o objeto `firebaseConfig`.
6. Abra o arquivo `firebase-config.js` do projeto.
7. Substitua os valores de exemplo pelos dados fornecidos pelo Firebase.

O arquivo deve manter o `export`:

```javascript
export const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};
```

Documentação oficial:

https://firebase.google.com/docs/web/setup?hl=pt-BR

---

## 2. Ativar o login por e-mail e senha

1. No Firebase, abra **Authentication**.
2. Clique em **Começar**.
3. Acesse **Sign-in method/Método de login**.
4. Ative **E-mail/senha**.
5. Salve a configuração.

Não existe cadastro público livre. Depois que o primeiro administrador estiver configurado, os demais usuários são cadastrados pela tela **Usuários**, usando convites controlados pelo administrador.

Documentação oficial:

https://firebase.google.com/docs/auth/web/password-auth?hl=pt-BR

---

## 3. Criar o Cloud Firestore

1. No Firebase, abra **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Selecione o modo de produção.
4. Escolha uma região próxima dos usuários.
5. Conclua a criação.

Não é necessário criar manualmente as coleções `userInvites`, `requests` e `requestAttachments`. Elas serão criadas quando os primeiros registros forem salvos.

A coleção `users` precisa ser criada manualmente apenas para configurar o primeiro administrador.

---

## 4. Publicar as regras de segurança

1. Abra **Firestore Database**.
2. Entre na guia **Rules/Regras**.
3. Abra o arquivo `firestore.rules` do projeto.
4. Copie todo o conteúdo.
5. Substitua as regras existentes no Firebase.
6. Clique em **Publicar**.

As regras garantem que:

- somente usuários autenticados e ativos acessem os dados;
- o administrador visualize e gerencie todas as solicitações;
- o solicitante visualize somente as próprias solicitações;
- o solicitante edite apenas uma solicitação própria que ainda esteja em **Nova**;
- somente o administrador altere status ou exclua solicitações;
- os anexos respeitem o limite aproximado de 700 KB;
- somente os tipos JPEG, PNG e TXT sejam aceitos;
- o tipo TEF Elgin e seus campos obrigatórios sejam validados pelas regras;
- o proprietário ou administrador consiga visualizar os anexos;
- somente o administrador consiga excluir uma solicitação;
- apenas administradores listem e alterem usuários;
- convites públicos só possam ser lidos por meio do token exclusivo, enquanto estiverem pendentes e dentro do prazo;
- o novo usuário só consiga criar o próprio perfil quando o e-mail, nome e perfil corresponderem ao convite;
- um administrador não consiga desativar nem remover o próprio perfil administrativo.

> Sempre que o arquivo `firestore.rules` for alterado, publique novamente as regras no Firebase.

---

## 5. Criar o primeiro administrador

O primeiro administrador ainda precisa ser criado manualmente, pois a tela administrativa só pode ser acessada depois que já existe um perfil `admin`.

### No Authentication

1. Abra **Authentication > Users/Usuários**.
2. Clique em **Adicionar usuário**.
3. Informe o e-mail e uma senha inicial.
4. Copie o **UID** criado pelo Firebase.

### No Firestore

Crie a coleção `users` e um documento cujo ID seja exatamente o UID copiado.

```text
users/UID_DO_ADMIN
```

Campos:

| Campo | Tipo | Exemplo |
|---|---|---|
| `name` | string | `Heitor` |
| `email` | string | `heitor@empresa.com.br` |
| `role` | string | `admin` |
| `active` | boolean | `true` |

Não utilize **Auto-ID**.

---

## 6. Cadastrar e administrar os demais usuários

Depois de entrar com o primeiro administrador:

1. Abra **Usuários** no menu lateral.
2. Clique em **Convidar usuário**.
3. Informe nome, e-mail e perfil (`admin` ou `solicitante`).
4. Clique em **Gerar convite**.
5. Copie o link e envie ao colaborador.
6. O colaborador abre o link e cria a própria senha.
7. O painel cria automaticamente a conta no Firebase Authentication e o perfil na coleção `users`.

O convite é válido por sete dias. Convites pendentes podem ser copiados novamente ou cancelados.

Na listagem, o administrador pode:

- editar nome e perfil;
- desativar ou reativar o acesso;
- enviar um e-mail de redefinição de senha;
- pesquisar e filtrar usuários;
- acompanhar convites pendentes.

Ao desativar um usuário:

- a conta do Firebase Authentication não é apagada;
- as solicitações e o histórico permanecem registrados;
- o acesso é bloqueado;
- caso esteja conectado, o usuário é desconectado automaticamente.

O administrador não pode desativar ou retirar o perfil administrativo da própria conta.

---

## 7. Recuperação e troca de senha

### Alterar a senha dentro do painel

O usuário conectado pode clicar no ícone de chave exibido ao lado do perfil. A tela solicitará:

- senha atual;
- nova senha;
- confirmação da nova senha.

A senha atual é utilizada para reautenticar o usuário e a nova senha é aplicada imediatamente, sem envio de e-mail. A nova senha deve possuir pelo menos seis caracteres e ser diferente da atual.

### Recuperar por e-mail

Na tela de login, o usuário também pode clicar em:

```text
Esqueci minha senha
```

O Firebase enviará um link para o e-mail cadastrado. O usuário poderá abrir o link e definir uma nova senha.

Caso o e-mail não seja recebido:

- confira a caixa de spam;
- verifique se o e-mail está cadastrado em **Authentication > Users**;
- confirme se o provedor **E-mail/senha** está habilitado;
- verifique os modelos de e-mail em **Authentication > Templates**.

---

## 8. Autorizar os domínios

No Firebase:

1. Abra **Authentication**.
2. Entre em **Settings/Configurações**.
3. Abra **Authorized domains/Domínios autorizados**.
4. Adicione o domínio utilizado pelo painel.

Exemplo do GitHub Pages:

```text
suaempresa.github.io
```

Para testes locais, adicione também:

```text
localhost
```

---

## 9. Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie os arquivos para a raiz do repositório.
3. Abra **Settings > Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Escolha a branch `main`.
6. Escolha a pasta `/root`.
7. Salve.
8. Aguarde a URL do site ser disponibilizada.

Depois de enviar uma atualização, aguarde a nova publicação e pressione:

```text
Ctrl + F5
```

Isso força o navegador a carregar os arquivos atualizados.

Também é possível publicar em Netlify, Vercel ou Firebase Hosting.

---

## 10. Testar localmente

Evite abrir o arquivo `index.html` diretamente com um endereço `file:///`.

Utilize um servidor local.

### VS Code com Live Server

1. Abra a pasta do projeto no VS Code.
2. Clique com o botão direito no `index.html`.
3. Selecione **Open with Live Server**.

### Python

Dentro da pasta do projeto, execute:

```bash
py -m http.server 5500
```

Depois acesse:

```text
http://localhost:5500
```

---

## Estrutura dos arquivos

```text
painel-solicitacoes/
├── index.html
├── styles.css
├── app.js
├── firebase-config.js
├── firestore.rules
└── README.md
```

### `index.html`

Estrutura visual da tela de login, cadastro por convite, Kanban, formulários, administração de usuários, ajuda e diálogos.

### `styles.css`

Estilos, responsividade, alertas, máscaras visuais, modal de ajuda e confirmação de exclusão.

### `app.js`

Autenticação, cadastro por convite, administração de usuários, consultas, formulários, validações, máscaras, Kanban, anexos, cópia e permissões.

### `firebase-config.js`

Dados de conexão do aplicativo Web com o Firebase.

### `firestore.rules`

Regras efetivas de segurança e acesso ao banco.

---

## Como preencher uma solicitação de programação

### Razão Social

Informe a empresa ou o nome fantasia utilizado no cadastro.

### CPF/CNPJ

Informe o documento do cliente. O sistema aplicará a máscara e validará os dígitos.

### Solicitante

Informe o nome da pessoa que pediu a alteração.

### Cargo

Informe a função do solicitante na empresa.

### E-mail

Informe um endereço válido para contato.

### Telefone

Informe telefone fixo ou celular com DDD.

### Título

Utilize um resumo curto e específico.

Exemplo:

```text
Adicionar filtro por responsável no relatório de pedidos
```

### Descrição da solicitação

Explique o que está sendo solicitado, em qual módulo ou tela e em qual rotina a necessidade aparece.

### Comportamento atual

Descreva exatamente o que acontece hoje, incluindo passos, mensagens, limitações ou resultado apresentado.

### Comportamento esperado

Explique como o cliente espera que o recurso funcione após a alteração.

### Justificativa

Informe o impacto causado pela situação, como:

- retrabalho;
- perda de tempo;
- erro operacional;
- risco fiscal;
- dificuldade de controle;
- insatisfação do cliente.

### Link do vídeo

Campo opcional. Utilize um endereço acessível e confirme se a permissão de visualização está liberada.

### Anexos

Campo opcional. Utilize imagens ou arquivos TXT que ajudem a demonstrar o cenário.

---

## Como preencher um chamado para cancelamento

1. Informe um CPF/CNPJ válido **ou** a Razão Social.
2. Registre o motivo do cancelamento.
3. Clique em **Adicionar cliente à lista**.
4. Confira se o cliente apareceu na tabela.
5. Repita para os demais clientes, quando necessário.
6. Revise a lista.
7. Clique em **Salvar solicitação**.
8. O administrador abre a solicitação e marca **Cancelado no CRM** conforme cada cliente for processado.

> Apenas preencher os campos não inclui o cliente na solicitação. É obrigatório clicar em **Adicionar cliente à lista**. O controle do CRM somente aparece de forma interativa para administradores e é salvo a cada marcação.

---

## Como preencher uma solicitação TEF Elgin

1. Informe um CNPJ válido.
2. Registre o sistema operacional da máquina.
3. Selecione uma opção de memória RAM superior a 4 GB.
4. Selecione o sistema utilizado.
5. Informe o número do estabelecimento e o número lógico do PIN Pad (SAK), normalmente fornecidos pela adquirente.
6. Registre o modelo do PIN Pad e a adquirente.
7. Informe nome, CPF, telefone e e-mail do proprietário.
8. Registre o valor combinado.
9. Revise e salve a solicitação.

O administrador poderá usar **Copiar dados** para obter o formulário completo em texto.

---

## Ajuste dos prazos visuais

No arquivo `app.js`, localize as verificações:

```javascript
ageHours >= 48
ageHours >= 24
```

- `24`: inicia o destaque amarelo;
- `48`: inicia o destaque vermelho.

Altere os valores conforme o SLA desejado.

---

## Solução de problemas

### O login não funciona

Confira:

- se `firebase-config.js` possui os dados reais do projeto;
- se o login por e-mail e senha está habilitado;
- se o usuário existe no Authentication;
- se existe um documento com o mesmo UID na coleção `users`;
- se `active` está como booleano `true`;
- se `role` está como `admin` ou `solicitante`;
- se o domínio está autorizado.

### Perfil não encontrado

O ID do documento em `users` provavelmente não é igual ao UID do Authentication.

### Permissão negada ao salvar

Confira se o arquivo `firestore.rules` atualizado foi publicado.

### Solicitação não salva com anexo

Confira:

- se existem no máximo dois arquivos;
- se o formato é JPEG, JPG, PNG ou TXT;
- se a imagem de origem possui até 5 MB;
- se o TXT possui até aproximadamente 700 KB;
- se as regras da coleção `requestAttachments` foram publicadas;
- se o usuário está ativo.

### Alterações não aparecem no GitHub Pages

- aguarde a conclusão do deploy;
- confirme se os arquivos foram enviados para a branch correta;
- pressione `Ctrl + F5`;
- teste em uma janela anônima.

### E-mail de recuperação não chegou

- confira o spam;
- confirme o e-mail cadastrado;
- verifique os templates do Authentication;
- tente novamente após alguns minutos.

---

## Segurança

O arquivo `firebase-config.js` fica visível no navegador, como ocorre em aplicações Web do Firebase. Ele identifica o projeto, mas não concede acesso irrestrito aos dados.

A segurança depende principalmente de:

- Firebase Authentication;
- documentos da coleção `users`;
- campo `active`;
- campo `role`;
- regras publicadas no Firestore.

Recomendações:

- não publique o Firestore em modo de teste para uso definitivo;
- valide as regras no **Rules Playground**;
- mantenha somente usuários autorizados no Authentication;
- desative usuários desligados alterando `active` para `false`;
- revise periodicamente as permissões;
- monitore o uso e as cotas do Firestore;
- não coloque senhas, chaves administrativas ou credenciais privadas no JavaScript.

---

## Observações sobre custos e limites

- O painel não utiliza Firebase Storage para os anexos.
- Os anexos são armazenados no Firestore para manter a solução compatível com a cota gratuita do projeto.
- O uso gratuito possui limites de armazenamento, leitura, gravação e transferência.
- Imagens e arquivos armazenados como documentos consomem a cota do Firestore.
- Para uso intenso, grande volume de anexos ou arquivos maiores, considere migrar os anexos para um serviço próprio de armazenamento.

---


### Convite não abre ou informa que expirou

Confira se:

- o link foi copiado por completo;
- o convite ainda está como pendente na tela **Usuários**;
- o prazo de sete dias não terminou;
- as regras atualizadas do arquivo `firestore.rules` foram publicadas;
- o domínio do GitHub Pages está autorizado no Firebase Authentication.

Se o convite expirou ou foi cancelado, crie um novo convite para o mesmo e-mail.

### Usuário desativado ainda estava com a tela aberta

O painel acompanha o documento do perfil em tempo real. Ao detectar `active: false`, a sessão é encerrada automaticamente. Caso a aba esteja sem conexão, o bloqueio ocorrerá assim que a conexão for restabelecida ou em uma nova consulta.

## Checklist de publicação

- [ ] Criar projeto no Firebase.
- [ ] Registrar aplicativo Web.
- [ ] Preencher `firebase-config.js`.
- [ ] Ativar login por e-mail e senha.
- [ ] Criar Cloud Firestore.
- [ ] Publicar `firestore.rules`.
- [ ] Criar primeiro usuário no Authentication.
- [ ] Criar perfil `admin` na coleção `users`.
- [ ] Entrar como administrador e testar a tela **Usuários**.
- [ ] Criar um convite de teste e concluir o cadastro em uma janela anônima.
- [ ] Autorizar o domínio do GitHub Pages.
- [ ] Enviar os arquivos ao GitHub.
- [ ] Ativar GitHub Pages.
- [ ] Testar login de administrador.
- [ ] Testar login de solicitante.
- [ ] Testar programação sem anexo.
- [ ] Testar programação com anexo.
- [ ] Testar cancelamento com um cliente.
- [ ] Testar cancelamento com vários clientes.
- [ ] Como administrador, marcar e desmarcar clientes como cancelados no CRM.
- [ ] Confirmar o indicador de progresso `CRM concluídos/total` no cartão.
- [ ] Testar cancelamento preenchendo somente o CPF/CNPJ.
- [ ] Testar cancelamento preenchendo somente a Razão Social.
- [ ] Testar solicitação TEF Elgin e a validação de CNPJ/CPF.
- [ ] Testar cópia dos dados.
- [ ] Testar movimentação no Kanban.
- [ ] Confirmar que apenas o administrador pode excluir.
- [ ] Testar alteração de senha dentro do painel.
- [ ] Testar recuperação de senha por e-mail.

## Ajuste da versão 13

- A lista de cancelamentos foi ajustada para caber integralmente no modal, sem barra de rolagem horizontal.
- As colunas agora distribuem o espaço disponível e quebram textos longos automaticamente.
- Em telas menores, cada cancelamento é exibido como um cartão responsivo.
- O controle individual “Cancelado no CRM” e a ação administrativa de remoção foram mantidos.


## Versão 14 — Ajuste visual da lista de cancelamentos

- Modal de cancelamentos ampliado em telas de computador.
- Colunas preservadas sem compressão excessiva.
- Botão **Remover** exibido em uma única linha, com estilo de ação secundária.
- Em telas menores, a listagem continua responsiva no formato de cartões.


## Versão 15 — Ajuda do TEF Elgin

- Adicionada a opção **TEF Elgin** no menu lateral da Central de Ajuda.
- Incluído um passo a passo para conferência dos dados técnicos, informações da adquirente e dados do proprietário.
- Acrescentadas orientações individuais para todos os campos do formulário TEF Elgin.
- Incluído alerta para revisão de CNPJ, CPF, número do estabelecimento e SAK antes do salvamento.


## Versão 16 — bloqueio de rolagem do plano de fundo

- Quando qualquer diálogo ou formulário está aberto, a página principal deixa de rolar.
- A roda do mouse e o touch permanecem limitados ao conteúdo do próprio diálogo.
- Ao fechar o diálogo, a rolagem normal da página é restaurada automaticamente.
- O bloqueio também funciona quando um segundo diálogo é aberto sobre outro, como a confirmação de exclusão.

## Versão 19 — comentários, indicadores, arquivamento e Bloqueio

- Criada a aba **Comentários** dentro de cada solicitação.
- Incluída menção ao técnico solicitante ou responsável, com notificação interna.
- Adicionado contador de notificações não lidas.
- Usuários responsáveis também passam a visualizar as solicitações atribuídas a eles.
- Criada a coluna **Bloqueio** no Kanban.
- Criada a tela administrativa **Indicadores** com filtros por período e tipo.
- Criada a tela **Arquivados** para consulta e restauração.
- Incluído arquivamento em lote de solicitações concluídas há mais de 30 dias.
- O Kanban principal passa a consultar somente a coleção ativa `requests`, melhorando o desempenho conforme o histórico aumenta.
- Atualizadas as regras do Firestore para comentários, notificações, responsáveis e histórico.

## Controle de versão no rodapé

A partir da versão 18, o rodapé lateral mostra:

- versão funcional do painel;
- número automático do build;
- commit publicado, ao posicionar o mouse;
- data e horário da publicação, ao posicionar o mouse.

O número funcional fica no arquivo `VERSION`. Para uma nova versão funcional, altere somente o número desse arquivo, por exemplo, de `19` para `20`.

O arquivo `.github/workflows/pages.yml` gera automaticamente o `version.json` durante a publicação. A cada envio para a branch `main`, o GitHub Actions atualiza o build, o commit e a data sem exigir edição manual.

Para usar essa automação:

1. No GitHub, abra **Settings > Pages**.
2. Em **Build and deployment > Source**, selecione **GitHub Actions**.
3. Envie os arquivos, incluindo as pastas ocultas `.github/workflows`.
4. Acompanhe a publicação pela aba **Actions**.

Durante o teste pelo Live Server, o rodapé mostra `Ambiente local`. No GitHub Pages, exibe os dados reais gerados na publicação.



## Alterações da versão 20

- O CNPJ passou a ser obrigatório nas solicitações de programação.
- A solicitação de cancelamento mantém a regra de aceitar CPF/CNPJ ou Razão Social.
- Corrigida a validação do telefone ao editar uma solicitação já salva.
- O tipo da solicitação é bloqueado após o primeiro salvamento, tanto na interface quanto nas regras do Firestore.

## Alterações da versão 21

- Corrigido o selo **Mais antiga** nos cartões do Kanban.
- O selo agora fica inteiramente dentro do cartão e não é cortado pela área de rolagem da coluna.
- Atualizado o controle de cache dos arquivos CSS e JavaScript para a versão 21.

## Alterações da versão 22

- Os cartões de **Programação** agora mostram somente o título, o cliente e o CNPJ.
- O início da descrição deixou de ser exibido no cartão, mantendo o Kanban mais limpo e objetivo.
- A descrição completa continua disponível ao abrir a solicitação.
- Atualizado o controle de cache dos arquivos CSS e JavaScript para a versão 22.



## Alterações da versão 23

- Cards de Programação exibem o CNPJ completo em uma linha própria, abaixo do cliente.
- Removido o corte por reticências no CNPJ dos cards de Programação.
- Adicionado favicon próprio do Painel de Solicitações (`favicon.svg`).
- Atualizado o controle de cache dos arquivos CSS e JavaScript para a versão 23.

## Alterações da versão 24

- Substituídas todas as marcações textuais `PS` pela logo oficial enviada.
- A logo passou a ser usada na tela de login, no cadastro por convite e no cabeçalho lateral do painel.
- O favicon agora utiliza a mesma identidade visual por meio do arquivo `logo-soften.png`.
- Atualizado o controle de cache dos arquivos CSS e JavaScript para a versão 24.



## Alteracoes da versao 25

- Adicionado o botao **Expandir Kanban** na barra superior da tela principal.
- O modo ampliado oculta menu lateral, indicadores, filtros e demais controles, exibindo somente o quadro Kanban.
- Incluido cabecalho compacto com a logo, identificacao do quadro e botao **Voltar ao painel**.
- Cada coluna continua com rolagem vertical independente no modo ampliado.
- O quadro utiliza toda a largura e altura disponiveis, mantendo rolagem horizontal apenas quando a tela nao comportar as cinco etapas.
- A tecla `Esc` tambem encerra o modo ampliado.
- Nao houve alteracao nas regras do Firestore.

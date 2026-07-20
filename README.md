# Painel de Solicitações

Aplicação web interna para centralizar **solicitações de programação** e **chamados para cancelamento** em um quadro Kanban, com autenticação individual, acompanhamento por status, destaque das demandas mais antigas e controle de permissões.

O projeto foi preparado para ser publicado no **GitHub Pages** e utiliza o **Firebase Authentication** e o **Cloud Firestore** como serviços de login, banco de dados e armazenamento dos anexos.

---

## Funcionalidades disponíveis

### Acesso e usuários

- Login individual por e-mail e senha.
- Recuperação de senha pelo botão **Esqueci minha senha**.
- Perfis de acesso `admin` e `solicitante`.
- Bloqueio de usuário sem apagar o histórico, alterando o campo `active` para `false`.
- Ausência de cadastro público: os usuários são criados manualmente pelo administrador no Firebase.
- Identificação do usuário responsável por cada solicitação.

### Kanban e acompanhamento

- Etapas:
  - **Nova**;
  - **Em análise**;
  - **Aguardando**;
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

### Solicitação de programação

O formulário possui os seguintes campos:

#### Informações do cliente

- Razão Social;
- CPF/CNPJ;
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
CPF/CNPJ:

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

Funcionamento:

1. O técnico preenche os dados do primeiro cliente.
2. Clica em **Adicionar cliente à lista**.
3. O registro é inserido na tabela abaixo.
4. Os campos são limpos e permanecem no mesmo local.
5. O técnico repete o processo para cadastrar um ou mais clientes.
6. Após revisar a lista, salva a solicitação.

O administrador possui a ação **Copiar dados**, que copia toda a relação de cancelamentos de uma vez.

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
- funcionamento do Kanban;
- filtros, responsável e movimentação dos cartões;
- botão de copiar;
- regras de edição e exclusão.

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

- visualizar todas as solicitações;
- filtrar por solicitante;
- criar solicitações;
- editar qualquer solicitação;
- alterar status;
- definir o responsável;
- arrastar cartões entre as etapas;
- copiar os dados formatados;
- abrir e remover anexos;
- excluir solicitações e seus anexos.

### Solicitante

O solicitante pode:

- criar solicitações;
- visualizar somente as próprias solicitações;
- editar somente as próprias solicitações enquanto estiverem na etapa **Nova**;
- adicionar ou remover anexos enquanto a solicitação puder ser editada;
- acompanhar o andamento e o tempo em aberto.

O solicitante não pode:

- visualizar solicitações de outros usuários;
- alterar o status;
- definir o responsável;
- excluir solicitações.

---

## Arquitetura

O GitHub Pages hospeda apenas arquivos estáticos e não fornece autenticação segura nem banco de dados. Por isso, o projeto utiliza:

- **GitHub Pages**: hospedagem da página;
- **Firebase Authentication**: login por e-mail e senha e recuperação de senha;
- **Cloud Firestore**: usuários, solicitações e anexos;
- **Firestore Security Rules**: controle efetivo de leitura, criação, edição e exclusão.

### Coleções utilizadas

```text
users
requests
requestAttachments
```

#### `users`

Armazena o perfil e a permissão de cada usuário.

#### `requests`

Armazena as solicitações de programação e cancelamento.

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

Não existe cadastro público na página. Cada usuário deve ser criado manualmente no console do Firebase.

Documentação oficial:

https://firebase.google.com/docs/auth/web/password-auth?hl=pt-BR

---

## 3. Criar o Cloud Firestore

1. No Firebase, abra **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Selecione o modo de produção.
4. Escolha uma região próxima dos usuários.
5. Conclua a criação.

Não é necessário criar manualmente as coleções `requests` e `requestAttachments`. Elas serão criadas quando os primeiros registros forem salvos.

A coleção `users` precisa ser criada manualmente para configurar o primeiro administrador.

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
- o proprietário ou administrador consiga visualizar os anexos;
- somente o administrador consiga excluir uma solicitação.

> Sempre que o arquivo `firestore.rules` for alterado, publique novamente as regras no Firebase.

---

## 5. Criar os usuários no Authentication

Para cada usuário:

1. Abra **Authentication**.
2. Acesse a guia **Users/Usuários**.
3. Clique em **Add user/Adicionar usuário**.
4. Informe o e-mail.
5. Defina uma senha inicial.
6. Salve.
7. Copie o **UID** criado pelo Firebase.

---

## 6. Criar os perfis na coleção `users`

Depois de criar o usuário no Authentication, abra:

```text
Firestore Database > Data/Dados
```

Crie uma coleção chamada:

```text
users
```

Dentro dela, crie um documento cujo ID seja exatamente o UID copiado do Authentication.

Não utilize **Auto-ID**.

### Primeiro administrador

Documento:

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

### Solicitante

Documento:

```text
users/UID_DO_USUARIO
```

Campos:

| Campo | Tipo | Exemplo |
|---|---|---|
| `name` | string | `Nome do colaborador` |
| `email` | string | `colaborador@empresa.com.br` |
| `role` | string | `solicitante` |
| `active` | boolean | `true` |

Cuidados importantes:

- o ID do documento deve ser exatamente o UID do Authentication;
- o e-mail deve ser o mesmo nos dois locais;
- `role` deve ser exatamente `admin` ou `solicitante`;
- `active` deve ser do tipo **boolean**, e não texto;
- para bloquear um usuário, altere `active` para `false`.

> O primeiro administrador precisa ser criado manualmente porque ainda não existe outro administrador autenticado para executar essa configuração.

---

## 7. Recuperação e troca de senha

Na tela de login, o usuário pode clicar em:

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

Estrutura visual da tela de login, Kanban, formulários, ajuda e diálogos.

### `styles.css`

Estilos, responsividade, alertas, máscaras visuais, modal de ajuda e confirmação de exclusão.

### `app.js`

Autenticação, consultas, formulários, validações, máscaras, Kanban, anexos, cópia e permissões.

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

1. Informe um CPF ou CNPJ válido.
2. Informe a Razão Social.
3. Registre o motivo do cancelamento.
4. Clique em **Adicionar cliente à lista**.
5. Confira se o cliente apareceu na tabela.
6. Repita para os demais clientes, quando necessário.
7. Revise a lista.
8. Clique em **Salvar solicitação**.

> Apenas preencher os campos não inclui o cliente na solicitação. É obrigatório clicar em **Adicionar cliente à lista**.

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

## Checklist de publicação

- [ ] Criar projeto no Firebase.
- [ ] Registrar aplicativo Web.
- [ ] Preencher `firebase-config.js`.
- [ ] Ativar login por e-mail e senha.
- [ ] Criar Cloud Firestore.
- [ ] Publicar `firestore.rules`.
- [ ] Criar primeiro usuário no Authentication.
- [ ] Criar perfil `admin` na coleção `users`.
- [ ] Criar os demais usuários.
- [ ] Autorizar o domínio do GitHub Pages.
- [ ] Enviar os arquivos ao GitHub.
- [ ] Ativar GitHub Pages.
- [ ] Testar login de administrador.
- [ ] Testar login de solicitante.
- [ ] Testar programação sem anexo.
- [ ] Testar programação com anexo.
- [ ] Testar cancelamento com um cliente.
- [ ] Testar cancelamento com vários clientes.
- [ ] Testar cópia dos dados.
- [ ] Testar movimentação no Kanban.
- [ ] Confirmar que apenas o administrador pode excluir.
- [ ] Testar recuperação de senha.

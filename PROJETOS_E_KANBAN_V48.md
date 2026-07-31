# Projetos, formulários e Kanban dinâmico — versão 48

A versão 48 transforma os tipos fixos de solicitação em **projetos configuráveis** dentro de um único Kanban.

## O que mudou

- Programação, Cancelamento e TEF Elgin passam a ser projetos padrão.
- Administradores podem criar projetos pela interface.
- Cada projeto pode ser liberado para administradores, solicitantes ou ambos.
- Projetos personalizados podem usar CPF/CNPJ, Razão Social, Telefone e E-mail com validações e obrigatoriedade configuráveis.
- Campos personalizados recebem nome, placeholder, obrigatoriedade, ordem e limite de até 1.000 caracteres.
- Administradores podem criar, editar, ordenar, arquivar e reativar colunas do Kanban.
- Uma coluna pode pausar a contagem de tempo ou representar conclusão.
- O filtro de projeto fica dentro da tela do Kanban.
- Campos e nomes utilizados em solicitações antigas são preservados pelo snapshot do formulário.

## Criar um projeto

1. Entre com perfil administrador.
2. Acesse **Projetos e formulários**.
3. Clique em **Novo projeto**.
4. Informe nome, descrição, público autorizado e situação.
5. Marque os campos padrão desejados e a obrigatoriedade de cada um.
6. Em **Campos personalizados**, adicione o nome do campo e o texto de orientação que será exibido como placeholder.
7. Organize os campos e confira a pré-visualização.
8. Salve como rascunho ou publique.

Projetos publicados ficam disponíveis em **Nova solicitação** somente para os perfis autorizados. Projetos arquivados deixam de aceitar novas solicitações, mas permanecem visíveis nos registros antigos.

## Criar uma coluna

1. Entre com perfil administrador.
2. Acesse **Colunas do Kanban**.
3. Clique em **Nova coluna**.
4. Informe o nome e a posição.
5. Defina se a coluna pausa a contagem de tempo.
6. Defina se a coluna representa conclusão.
7. Escolha a identificação visual e salve.

Para arquivar uma coluna, primeiro mova todos os cards ativos dela. Registros já arquivados mantêm a referência histórica e não impedem o arquivamento da coluna.

## Regras de preservação

- O projeto de uma solicitação não pode ser alterado depois do primeiro salvamento.
- O formulário usado no momento da criação é salvo junto à solicitação.
- Alterar ou remover um campo do projeto não elimina respostas antigas.
- Alterar o nome de um campo não muda o rótulo histórico das solicitações já criadas.
- Projetos e colunas são arquivados, não apagados pela interface.
- Pelo menos uma coluna aberta deve permanecer ativa para receber novas solicitações.

## Segurança no Supabase

O SQL da versão 48 valida no banco:

- perfil ativo e aceite do termo vigente;
- projeto publicado e autorizado para o perfil criador;
- projeto e solicitante imutáveis após a criação;
- coluna ativa e válida;
- campos obrigatórios;
- CPF/CNPJ, telefone e e-mail;
- limite de 1.000 caracteres nos campos personalizados;
- esquema do formulário obtido do próprio cadastro do projeto, sem confiar no navegador;
- criação e alteração de projetos e colunas apenas por administradores.

## Atualização

Execute uma única vez no SQL Editor:

```text
supabase/projects-kanban-v48.sql
```

Não execute novamente o `schema.sql` em uma base já existente e não refaça a migração do Firebase.

# Painel de Solicitações — versão 43

Aplicação web interna para centralizar solicitações de **Programação**, **Cancelamento** e **TEF Elgin** em um Kanban com autenticação, permissões por Squad, comentários, histórico, notificações, indicadores, arquivamento, backup e recursos administrativos.

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

- Kanban com etapas Nova, Em análise, Aguardando, Bloqueio e Concluída.
- Filtros por texto, tipo, prioridade, Squad e solicitante.
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

## Tipos de solicitação

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

A versão 43 não exige executar novamente `schema.sql`, refazer a migração ou alterar políticas RLS.

## Testes automatizados

Execute no Windows:

```powershell
npm.cmd test
```

Ou:

```text
TESTAR.bat
```

A versão 43 possui testes para:

- arquivos obrigatórios;
- sintaxe JavaScript;
- sincronização da versão;
- estrutura e políticas do Supabase;
- fluxo de salvamento e novas tentativas;
- scripts de migração;
- evento `PASSWORD_RECOVERY`;
- abertura da tela específica de nova senha;
- atualização sem exigir senha anterior;
- bloqueio do fechamento acidental da recuperação.

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

## Alteração da versão 43

- Corrige o redirecionamento do link de recuperação.
- Reconhece o evento oficial `PASSWORD_RECOVERY` do Supabase.
- Abre a tela **Criar nova senha** sem solicitar a senha anterior.
- Encerra a sessão temporária após a atualização.
- Adiciona testes de regressão específicos para recuperação de senha.
- Atualiza cache da PWA e controle de versão.

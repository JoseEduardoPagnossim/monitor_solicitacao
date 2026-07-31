# Auditoria urgente de segurança — versão 45

## Resultado da revisão do repositório recebido

A revisão foi feita sobre os arquivos efetivamente rastreados no Git (`git ls-files`) e sobre o histórico disponível no pacote enviado.

### Arquivos rastreados corretamente

- frontend estático (`index.html`, `styles.css`, `app.js`);
- integração pública do Supabase (`supabase-config.js`);
- testes, scripts de migração, SQL e documentação;
- workflow de publicação do GitHub Pages.

O `supabase-config.js` contém somente a URL do projeto e uma chave pública `sb_publishable_`. Essa chave é própria para frontend; ela não substitui as políticas RLS.

### Arquivos presentes no ZIP local, mas não rastreados no Git

- `.git/`;
- `node_modules/`;
- `migration-report.json`.

Eles apareceram porque a pasta inteira foi compactada. O `.gitignore` já impedia o versionamento dos dois últimos. A versão 45 amplia essa proteção para backups, certificados e outros arquivos sensíveis.

`migration-report.json` pode conter e-mails, identificadores e detalhes da migração. Mantenha-o fora do Git, não envie em chamados públicos e apague cópias desnecessárias.

### Histórico antigo

Foi localizado um `firebase-config.js` em commits anteriores. Ele contém a configuração web pública do antigo Firebase, não uma conta de serviço nem uma chave privada. Como o Firebase não é mais utilizado, recomenda-se restringir ou revogar a chave web antiga e manter o projeto antigo apenas durante o período necessário de conferência.

Não foram encontrados no histórico disponível padrões de alta confiança para:

- `sb_secret_`;
- chave SMTP Brevo (`xkeysib-...`);
- chave privada PEM;
- conta de serviço Firebase com `private_key`;
- JWT `service_role` do Supabase.

## Correções aplicadas na versão 45

1. RLS de anexos exige permissão de edição na solicitação vinculada.
2. Caminhos do Storage validam usuário e ID da solicitação.
3. Autor de comentário, histórico, log e notificação é definido pelo banco.
4. Histórico e notificações passam por funções RPC validadas.
5. Notificação só pode ser enviada ao solicitante ou responsável da demanda.
6. Usuário comum só pode alterar `read` e `readAt` nas próprias notificações.
7. URLs externas de anexos passam por validação de protocolo.
8. Eventos JavaScript inline foram removidos.
9. Foi adicionada Content Security Policy no HTML.
10. Foram adicionados CodeQL, Dependabot e testes contra arquivos/segredos proibidos.
11. O pacote de distribuição não inclui `.git`, `node_modules` nem relatórios de migração.

## Ações manuais obrigatórias

### Supabase

- Execute `supabase/security-hardening-v45.sql` uma única vez.
- Confirme que o bucket `request-attachments` continua privado.
- Revise os usuários com `role = admin`.
- Ative MFA para as contas administrativas quando a interface do painel estiver preparada.

### GitHub

- Ative autenticação em dois fatores na conta.
- Em **Settings → Security / Advanced Security**, habilite Secret scanning e Push protection quando disponíveis.
- Em **Settings → Branches**, proteja a branch `main` e exija os testes antes do merge.
- Em **Settings → Actions**, mantenha permissões mínimas para workflows.
- Confira a aba **Security** após o primeiro CodeQL.

### Brevo

- Mantenha revogada qualquer chave SMTP que tenha aparecido em captura de tela.
- Ative autenticação em dois fatores.

## Validação após publicar

1. Admin cria e edita uma solicitação.
2. Solicitante cria solicitação no próprio Squad.
3. Solicitante não cria anexo em demanda sem acesso.
4. Usuário de A/B não lê dados de D/E.
5. Notificação chega somente a participante da demanda.
6. Histórico mostra o usuário autenticado como autor.
7. Anexos continuam abrindo para usuários autorizados.
8. GitHub Actions aprova testes, CodeQL e deploy.

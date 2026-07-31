# Segurança complementar — versão 46

Esta versão complementa o endurecimento urgente da v45. Ela não refaz a migração e não substitui as políticas funcionais já aplicadas.

## O que foi acrescentado

- política forte de senha no frontend: mínimo de 10 caracteres, maiúscula, minúscula, número e símbolo;
- suporte opcional ao Cloudflare Turnstile nos fluxos de login, convite, recuperação e confirmação de identidade;
- MFA TOTP para contas administrativas, usando aplicativo autenticador;
- exigência de AAL2 no banco para qualquer conta que já possua MFA verificado;
- nova confirmação de senha para backup e gestão de usuários;
- finalidade, classificação, prazo de retenção e hash SHA-256 no backup JSON;
- validação do conteúdo real de JPEG, PNG e TXT antes do envio;
- nomes internos aleatórios para anexos;
- limpeza explícita da sessão ao sair;
- service worker limitado aos arquivos públicos do aplicativo;
- logs adicionais para mudanças administrativas sensíveis.

## Atualização obrigatória

1. Publique os arquivos da versão 46 no GitHub.
2. Abra **Supabase > SQL Editor > New query**.
3. Cole todo o conteúdo de `supabase/security-hardening-v46.sql`.
4. Clique em **Run**.
5. Atualize o painel com `Ctrl + Shift + R`.

O SQL da v46 deve ser executado depois do `security-hardening-v45.sql`. Não execute novamente o `schema.sql` e não refaça a migração.

## Política de senha no Supabase

A validação do navegador melhora a experiência, mas não impede chamadas diretas à API. Configure no painel do Supabase os mesmos requisitos usados em `security-config.js`:

- mínimo de 10 caracteres;
- letra maiúscula;
- letra minúscula;
- número;
- símbolo.

Senhas antigas continuam válidas até serem alteradas. Novos convites e redefinições passam a exigir a política forte no painel.

## MFA para administradores

1. Entre com uma conta administradora.
2. Abra **Segurança**.
3. Clique em **Configurar MFA**.
4. Confirme a senha atual.
5. Escaneie o QR Code em um aplicativo autenticador.
6. Digite o código de seis dígitos.

Depois da ativação, essa conta precisará informar o código nos próximos acessos. O SQL da v46 também impede que uma sessão AAL1 dessa conta leia ou altere os dados diretamente pela API.

Não ative MFA sem guardar o acesso ao aplicativo autenticador. Em caso de perda, a recuperação administrativa do fator deverá ser feita no Supabase por uma pessoa autorizada.

## CAPTCHA opcional

O CAPTCHA permanece desativado enquanto `turnstileSiteKey` estiver vazio em `security-config.js`.

Para ativar:

1. Crie um widget no Cloudflare Turnstile para o domínio do GitHub Pages.
2. No Supabase, habilite a proteção CAPTCHA e informe a **Secret Key** do Turnstile.
3. Em `security-config.js`, informe apenas a **Site Key pública**:

```javascript
turnstileSiteKey: "SUA_SITE_KEY_PUBLICA"
```

4. Publique e teste login, convite, recuperação, troca de senha e ações administrativas em janela anônima.

Nunca coloque a Secret Key do Turnstile no GitHub. Evite habilitar o CAPTCHA no Supabase antes de publicar uma Site Key funcional, pois os fluxos de autenticação poderão ser recusados.

## Backup administrativo

O backup agora exige:

- nova confirmação de senha, válida por 10 minutos para ações sensíveis;
- finalidade com pelo menos 10 caracteres;
- confirmação de ciência sobre os dados pessoais;
- registro da solicitação e do resultado no log;
- indicação de exclusão recomendada em 7 dias;
- hash SHA-256 para verificação de integridade.

O hash foi calculado sobre `metadata + data` antes da inclusão do bloco `integrity`.

## Anexos

O frontend verifica a assinatura dos arquivos:

- JPEG: cabeçalho `FF D8 FF`;
- PNG: assinatura PNG oficial;
- TXT: UTF-8 válido e sem byte nulo.

As imagens continuam sendo reprocessadas antes do envio, removendo os metadados originais. O bucket permanece privado e limitado a 700 KB por objeto.

## Teste recomendado

Depois da publicação:

1. entre como administrador sem MFA e confirme o acesso normal;
2. ative MFA e saia;
3. entre novamente e confirme a solicitação do código;
4. tente abrir dados sem concluir o código e confirme que não são carregados;
5. teste criação e edição como solicitante;
6. teste JPEG, PNG, TXT e um arquivo renomeado indevidamente;
7. gere um backup e confira `metadata`, `deleteAfter` e `integrity`;
8. saia e confirme que o retorno exige novo login;
9. caso ative Turnstile, teste login, convite, recuperação, troca de senha e confirmação administrativa.

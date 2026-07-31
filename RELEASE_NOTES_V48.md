# Release 48 — Projetos e Kanban dinâmico

## Entregas

- Kanban único para todos os projetos.
- Programação, Cancelamento e TEF Elgin migrados para projetos padrão.
- Criação e administração de projetos pela interface.
- Formulários dinâmicos com campos padrão validados e campos personalizados de até 1.000 caracteres.
- Controle de público por projeto: administrador, solicitante ou todos.
- Criação, edição, ordenação, arquivamento e reativação de colunas.
- Colunas configuráveis para pausa de tempo e conclusão.
- Filtro de projeto dentro do Kanban.
- Preservação do formulário histórico por snapshot.
- Migração automática das solicitações existentes.
- Ajuda administrativa incluída no painel.

## Banco de dados

Aplicar uma vez:

```text
supabase/projects-kanban-v48.sql
```

## Testes

A versão foi validada com 74 testes automatizados, cobrindo as versões anteriores e os novos recursos de projetos, formulários, colunas, migração, RLS e preservação histórica.

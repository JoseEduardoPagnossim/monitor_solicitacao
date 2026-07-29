#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
echo "Executando testes automatizados do Painel de Solicitações..."
npm test

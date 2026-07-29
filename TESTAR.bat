@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale o Node.js 20 ou superior.
  pause
  exit /b 1
)
echo Executando testes automatizados do Painel de Solicitacoes...
call npm test
set RESULT=%ERRORLEVEL%
if %RESULT% EQU 0 (
  echo.
  echo Todos os testes foram aprovados.
) else (
  echo.
  echo Um ou mais testes falharam. Nao publique esta versao antes de corrigir.
)
pause
exit /b %RESULT%

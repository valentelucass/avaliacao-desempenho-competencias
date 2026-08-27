@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

set "MODE=CHECK"
if "%~1"=="" goto :RUN
if /i "%~1"=="--check" goto :RUN
if /i "%~1"=="--apply" (
  set "MODE=APPLY"
  goto :RUN
)
if /i "%~1"=="--help" goto :HELP
if /i "%~1"=="-h" goto :HELP

echo [ERRO] Argumento invalido. Use --help para ver os comandos aceitos.
exit /b 1

:RUN
where sqlcmd >nul 2>&1
if errorlevel 1 (
  echo [ERRO] sqlcmd nao foi encontrado no PATH.
  exit /b 1
)

set "SQLCMD_FLAGS=-b -r1 -I -f 65001 -N"
echo [ETAPA] Validando alvos e conexoes atuais...
sqlcmd %SQLCMD_FLAGS% -S "localhost,1433" -E -d master -i "%~dp0sql\manual\003_validar_renomeio_ambientes.sql"
if errorlevel 1 (
  echo [ERRO] Nao foi possivel validar os alvos de renomeio.
  exit /b 1
)

if /i "%MODE%"=="CHECK" (
  echo [CHECK] Nenhuma alteracao foi feita.
  exit /b 0
)

echo.
set "CONFIRMATION="
set /p "CONFIRMATION=Digite exatamente RENOMEAR AVALIACAO_DEV E AVALIACAO_PROD para continuar: "
if /i not "%CONFIRMATION%"=="RENOMEAR AVALIACAO_DEV E AVALIACAO_PROD" (
  echo Operacao cancelada. Nenhuma alteracao foi feita.
  exit /b 1
)

echo [ETAPA] Renomeando as duas bases e encerrando conexoes ativas...
sqlcmd %SQLCMD_FLAGS% -S "localhost,1433" -E -d master -v Confirmation="%CONFIRMATION%" -i "%~dp0sql\manual\004_renomear_bases_para_ambientes_padronizados.sql"
if errorlevel 1 (
  echo [ERRO] O renomeio falhou. O procedimento tentou restaurar os nomes e o acesso multiusuario.
  exit /b 1
)

echo [ETAPA] Confirmando o resultado...
sqlcmd %SQLCMD_FLAGS% -S "localhost,1433" -E -d master -i "%~dp0sql\manual\003_validar_renomeio_ambientes.sql"
if errorlevel 1 (
  echo [ERRO] O renomeio concluiu, mas a leitura de confirmacao falhou.
  exit /b 1
)

echo [OK] Bases padronizadas. Reinicie a API de desenvolvimento para usar AVALIACAO_DEV.
exit /b 0

:HELP
echo.
echo Uso:
echo   renomear-bases.bat --check
echo      Lista os alvos e conexoes sem alterar nada.
echo.
echo   renomear-bases.bat --apply
echo      Renomeia AvaliacaoDesempenhoCompetencias para AVALIACAO_DEV e
echo      RodogarciaAvaliacaoDesempenho para AVALIACAO_PROD.
echo      Encerra conexoes das duas bases com rollback imediato e exige confirmacao.
exit /b 0

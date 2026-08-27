@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

title Avaliacao de Desempenho - Banco SQL Server

set "MODO="
set "EXIT_CODE=0"
set "WORK_DIR="
set "CONFIG_FILE=%ADC_DATABASE_CONFIG%"

:LER_ARGUMENTOS
if "%~1"=="" goto :ARGUMENTOS_OK
if /i "%~1"=="--help" goto :AJUDA
if /i "%~1"=="-h" goto :AJUDA
if /i "%~1"=="/?" goto :AJUDA
if /i "%~1"=="--check" (
  if defined MODO goto :ARGUMENTOS_INVALIDOS
  set "MODO=CHECK"
  shift
  goto :LER_ARGUMENTOS
)
if /i "%~1"=="--check-all" (
  if defined MODO goto :ARGUMENTOS_INVALIDOS
  set "MODO=CHECK_ALL"
  shift
  goto :LER_ARGUMENTOS
)
if /i "%~1"=="--apply" (
  if defined MODO goto :ARGUMENTOS_INVALIDOS
  set "MODO=APPLY"
  shift
  goto :LER_ARGUMENTOS
)
if /i "%~1"=="--apply-all" (
  if defined MODO goto :ARGUMENTOS_INVALIDOS
  set "MODO=APPLY_ALL"
  shift
  goto :LER_ARGUMENTOS
)
if /i "%~1"=="--validate" (
  if defined MODO goto :ARGUMENTOS_INVALIDOS
  set "MODO=VALIDATE"
  shift
  goto :LER_ARGUMENTOS
)
if /i "%~1"=="--recover-v0001-partial" (
  if defined MODO goto :ARGUMENTOS_INVALIDOS
  set "MODO=RECOVER_V0001"
  shift
  goto :LER_ARGUMENTOS
)
if /i "%~1"=="--recover-empty-bootstrap" (
  if defined MODO goto :ARGUMENTOS_INVALIDOS
  set "MODO=RECOVER_EMPTY_BOOTSTRAP"
  shift
  goto :LER_ARGUMENTOS
)
goto :ARGUMENTOS_INVALIDOS

:ARGUMENTOS_OK
if not defined MODO set "MODO=APPLY_ALL_AUTOMATIC"

if /i "%MODO%"=="CHECK_ALL" goto :VERIFICAR_TODOS
if /i "%MODO%"=="APPLY_ALL_AUTOMATIC" goto :APLICAR_TODOS_AUTOMATICO
if /i "%MODO%"=="APPLY_ALL" goto :APLICAR_TODOS

if not defined CONFIG_FILE set "CONFIG_FILE=%~dp0config.local.bat"
if not exist "%CONFIG_FILE%" (
  echo [ERRO] Configuracao local nao encontrada: %CONFIG_FILE%
  echo Copie config.example.bat para config.local.bat e ajuste somente os valores locais.
  set "EXIT_CODE=1"
  goto :FIM
)

call "%CONFIG_FILE%"
if errorlevel 1 (
  echo [ERRO] A configuracao local terminou com falha.
  set "EXIT_CODE=1"
  goto :FIM
)
call :VALIDAR_CONFIGURACAO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :VERIFICAR_SQLCMD
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

set "SQLCMD_SERVER=%ADC_DB_SERVER%,%ADC_DB_PORT%"
set "SQLCMD_FLAGS=-b -r1 -I -f 65001 -N"
if "%ADC_SQLCMD_TRUST_SERVER_CERTIFICATE%"=="1" set "SQLCMD_FLAGS=%SQLCMD_FLAGS% -C"
call :VERIFICAR_CONEXAO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :VALIDAR_MIGRATIONS
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :PREPARAR_DIRETORIO_TEMPORARIO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :OBTER_STATUS_BANCO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

if /i "%MODO%"=="CHECK" goto :CHECK
if /i "%MODO%"=="VALIDATE" goto :VALIDATE
if /i "%MODO%"=="RECOVER_V0001" goto :RECUPERAR_V0001
if /i "%MODO%"=="RECOVER_EMPTY_BOOTSTRAP" goto :RECUPERAR_BOOTSTRAP_VAZIO

call :CONFIRMAR_APLICACAO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

if /i "%DATABASE_STATUS%"=="MISSING" (
  echo [ETAPA] Criando o banco dedicado %ADC_DB_NAME%...
  sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d master -v DatabaseName=%ADC_DB_NAME% -i "%~dp0sql\bootstrap\001_criar_banco.sql"
  if errorlevel 1 (
    echo [ERRO] Falha ao criar o banco. Nenhuma migration foi iniciada.
    set "EXIT_CODE=1"
    goto :FIM
  )
  echo [OK] Banco criado.
) else (
  call :VERIFICAR_PROPRIEDADE
  if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :FIM
  )
  echo [INFO] Banco %ADC_DB_NAME% ja existe e pertence a este projeto; nenhum banco sera recriado.
)

:PREPARAR_CONTROLE_E_APLICAR_MIGRATIONS
echo [ETAPA] Garantindo o controle de migrations...
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -i "%~dp0sql\bootstrap\002_criar_controle_migrations.sql"
if errorlevel 1 (
  echo [ERRO] Falha ao preparar o controle de migrations.
  set "EXIT_CODE=1"
  goto :FIM
)

call :GERAR_LISTA_MIGRATIONS
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :RECONCILIAR_HISTORICO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :OBTER_ESTADO_FUNDACAO_V0001
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
if /i "%FUNDACAO_V0001_ESTADO%"=="PARCIAL" (
  echo [ERRO] A fundacao V0001 nao esta limpa: %FUNDACAO_V0001_ESTADO%.
  echo Use --recover-v0001-partial somente para o estado parcial confirmado e vazio.
  set "EXIT_CODE=1"
  goto :FIM
)
if /i "%FUNDACAO_V0001_ESTADO%"=="INCONSISTENTE" (
  echo [ERRO] A fundacao V0001 esta inconsistente com o historico de migrations.
  set "EXIT_CODE=1"
  goto :FIM
)

for /f "usebackq delims=" %%F in ("%WORK_DIR%\migration-files.txt") do (
  call :APLICAR_MIGRATION "%%F"
  if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :FIM
  )
)

echo [ETAPA] Executando validacoes somente leitura...
call :EXECUTAR_VALIDACOES_COMPLETAS
if errorlevel 1 (
  echo [ERRO] A validacao falhou. Verifique o banco antes de prosseguir.
  set "EXIT_CODE=1"
  goto :FIM
)

echo [OK] Banco e migrations concluidos sem operacao destrutiva.
goto :FIM

:VERIFICAR_TODOS
call :VALIDAR_ALVOS_CANONICOS
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
echo [INFO] Verificando os dois bancos canonicos do projeto.
call :EXECUTAR_NO_ALVO "%~dp0config.local.bat" "--check"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
call :EXECUTAR_NO_ALVO "%~dp0config.production.local.bat" "--check"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
echo [OK] A verificacao de AVALIACAO_DEV e AVALIACAO_PROD foi concluida sem alteracoes.
goto :FIM

:APLICAR_TODOS_AUTOMATICO
call :VALIDAR_ALVOS_CANONICOS
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
echo [INFO] Atualizando AVALIACAO_DEV e AVALIACAO_PROD sem confirmacao interativa.
call :EXECUTAR_NO_ALVO "%~dp0config.local.bat" "--apply" "AUTO_CONFIRM"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
call :EXECUTAR_NO_ALVO "%~dp0config.production.local.bat" "--apply" "AUTO_CONFIRM"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
echo [OK] AVALIACAO_DEV e AVALIACAO_PROD foram atualizados e validados.
goto :FIM

:APLICAR_TODOS
call :VALIDAR_ALVOS_CANONICOS
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
call :CONFIRMAR_APLICACAO_TODOS
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

echo [INFO] Aplicando migrations primeiro em AVALIACAO_DEV e depois em AVALIACAO_PROD.
call :EXECUTAR_NO_ALVO "%~dp0config.local.bat" "--apply"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
call :EXECUTAR_NO_ALVO "%~dp0config.production.local.bat" "--apply"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
echo [OK] AVALIACAO_DEV e AVALIACAO_PROD foram atualizados e validados.
goto :FIM

:VALIDATE
if /i not "%DATABASE_STATUS%"=="EXISTS" (
  echo [ERRO] A validacao completa exige o banco dedicado existente.
  set "EXIT_CODE=1"
  goto :FIM
)

call :VERIFICAR_PROPRIEDADE
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :GERAR_LISTA_MIGRATIONS
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :RECONCILIAR_HISTORICO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :OBTER_ESTADO_FUNDACAO_V0001
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
if /i not "%FUNDACAO_V0001_ESTADO%"=="APLICADA" (
  echo [ERRO] A validacao completa exige fundacao V0001 APLICADA; estado atual: %FUNDACAO_V0001_ESTADO%.
  set "EXIT_CODE=1"
  goto :FIM
)

echo [ETAPA] Executando validacoes somente leitura...
call :EXECUTAR_VALIDACOES_COMPLETAS
if errorlevel 1 (
  echo [ERRO] A validacao completa falhou. Verifique o banco antes de prosseguir.
  set "EXIT_CODE=1"
  goto :FIM
)

echo [OK] Banco, migrations e validacoes somente leitura concluidos.
goto :FIM

:CHECK
call :GERAR_LISTA_MIGRATIONS
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
if /i "%DATABASE_STATUS%"=="EXISTS" (
  call :VERIFICAR_PROPRIEDADE
  if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :FIM
  )
  call :RECONCILIAR_HISTORICO
  if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :FIM
  )
  call :OBTER_ESTADO_FUNDACAO_V0001
  if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :FIM
  )
)
echo.
echo [CHECK] Servidor: %SQLCMD_SERVER%
echo [CHECK] Banco dedicado: %ADC_DB_NAME%
if /i "%DATABASE_STATUS%"=="MISSING" (
  echo [CHECK] O banco ainda nao existe. Use --apply e confirme para cria-lo.
) else (
  echo [CHECK] O banco ja existe. Use --apply para publicar migrations pendentes.
  echo [CHECK] Fundacao V0001: %FUNDACAO_V0001_ESTADO%
)
echo [CHECK] Nenhuma alteracao foi feita.
if /i "%FUNDACAO_V0001_ESTADO%"=="PARCIAL" (
  echo [CHECK] O estado parcial bloqueia --apply; use a recuperacao controlada autorizada.
  set "EXIT_CODE=1"
)
if /i "%FUNDACAO_V0001_ESTADO%"=="INCONSISTENTE" (
  echo [CHECK] A fundacao esta inconsistente com o historico e bloqueia --apply.
  set "EXIT_CODE=1"
)
goto :FIM

:RECUPERAR_V0001
if /i not "%DATABASE_STATUS%"=="EXISTS" (
  echo [ERRO] A recuperacao exige o banco existente e marcado deste projeto.
  set "EXIT_CODE=1"
  goto :FIM
)

call :VERIFICAR_PROPRIEDADE
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :CONFIRMAR_RECUPERACAO_V0001
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

echo [ETAPA] Garantindo o controle de migrations...
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -i "%~dp0sql\bootstrap\002_criar_controle_migrations.sql"
if errorlevel 1 (
  echo [ERRO] Falha ao preparar o controle de migrations.
  set "EXIT_CODE=1"
  goto :FIM
)

call :GERAR_LISTA_MIGRATIONS
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :RECONCILIAR_HISTORICO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :OBTER_ESTADO_FUNDACAO_V0001
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)
if /i not "%FUNDACAO_V0001_ESTADO%"=="PARCIAL" (
  echo [ERRO] A recuperacao exige fundacao V0001 PARCIAL; estado atual: %FUNDACAO_V0001_ESTADO%.
  set "EXIT_CODE=1"
  goto :FIM
)

set "V0001_FILE=%~dp0sql\migrations\V0001__fundacao_identidade_acesso_e_auditoria.sql"
if not exist "%V0001_FILE%" (
  echo [ERRO] A migration V0001 esperada nao foi encontrada.
  set "EXIT_CODE=1"
  goto :FIM
)

call :APLICAR_MIGRATION "%V0001_FILE%" "RECUPERAR_V0001"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

echo [ETAPA] Executando validacao somente leitura...
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -i "%~dp0sql\validation\001_validar_fundacao_identidade.sql"
if errorlevel 1 (
  echo [ERRO] A validacao falhou. Verifique o banco antes de prosseguir.
  set "EXIT_CODE=1"
  goto :FIM
)

echo [OK] Fundacao V0001 recuperada e validada sem apagar dados de negocio.
goto :FIM

:RECUPERAR_BOOTSTRAP_VAZIO
if /i not "%DATABASE_STATUS%"=="EXISTS" (
  echo [ERRO] A recuperacao do bootstrap exige o banco dedicado existente.
  set "EXIT_CODE=1"
  goto :FIM
)

call :VERIFICAR_BOOTSTRAP_VAZIO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

call :CONFIRMAR_RECUPERACAO_BOOTSTRAP_VAZIO
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :FIM
)

echo [INFO] Base vazia confirmada; retomando somente o bootstrap e as migrations.
goto :PREPARAR_CONTROLE_E_APLICAR_MIGRATIONS

:VALIDAR_CONFIGURACAO
if not defined ADC_SQLCMD_TRUST_SERVER_CERTIFICATE set "ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=0"
powershell -NoProfile -Command "$server=$env:ADC_DB_SERVER; $port=$env:ADC_DB_PORT; $database=$env:ADC_DB_NAME; $trust=$env:ADC_SQLCMD_TRUST_SERVER_CERTIFICATE; $allowedDatabases=@('AVALIACAO_DEV','AVALIACAO_PROD'); if ($server -notin @('localhost','127.0.0.1')) { throw 'ADC_DB_SERVER deve ser localhost ou 127.0.0.1.' }; if ($port -notmatch '^[0-9]{1,5}$' -or [int]$port -lt 1 -or [int]$port -gt 65535) { throw 'ADC_DB_PORT deve estar entre 1 e 65535.' }; if ($database -notin $allowedDatabases) { throw 'ADC_DB_NAME deve ser AVALIACAO_DEV ou AVALIACAO_PROD.' }; if ($trust -notin @('0','1')) { throw 'ADC_SQLCMD_TRUST_SERVER_CERTIFICATE deve ser 0 ou 1.' }" >nul
if errorlevel 1 (
  echo [ERRO] Configuracao local invalida. Consulte config.example.bat.
  exit /b 1
)
exit /b 0

:VERIFICAR_SQLCMD
where sqlcmd >nul 2>nul
if errorlevel 1 (
  echo [ERRO] sqlcmd nao foi encontrado no PATH.
  exit /b 1
)
exit /b 0

:VERIFICAR_CONEXAO
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d master -Q "SET NOCOUNT ON; SELECT 1;" >nul
if errorlevel 1 (
  echo [ERRO] Nao foi possivel conectar ao SQL Server com autenticacao integrada.
  exit /b 1
)
exit /b 0

:VALIDAR_MIGRATIONS
set "ADC_MIGRATION_DIR=%~dp0sql\migrations"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\validar-migrations.ps1" -MigrationDirectory "%ADC_MIGRATION_DIR%"
if errorlevel 1 exit /b 1
exit /b 0

:EXECUTAR_VALIDACOES_COMPLETAS
for %%F in (
  001_validar_fundacao_identidade.sql
  003_validar_catalogo_inicial_acesso.sql
  004_validar_cadastros_ciclos_e_questionarios.sql
  005_validar_avaliacoes_rascunho_envio_e_historico.sql
  006_validar_regra_operacional_2024_1.sql
  007_validar_catalogo_rbac_2024_1.sql
  008_validar_atribuicao_questionario_por_colaborador_e_ciclo.sql
  009_validar_perfis_administrador_integral_e_usuario_comum.sql
  010_validar_catalogo_inicial_rodogarcia_2024_1.sql
) do (
  echo [ETAPA] Validando %%F...
  sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -i "%~dp0sql\validation\%%F"
  if errorlevel 1 exit /b 1
)
exit /b 0

:EXECUTAR_VALIDACAO
if not exist "%~1" (
  echo [ERRO] Arquivo de validacao nao encontrado: %~nx1
  exit /b 1
)
echo [ETAPA] Validando %~nx1...
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -i "%~1"
exit /b %ERRORLEVEL%

:OBTER_STATUS_BANCO
set "DATABASE_STATUS="
set "DATABASE_STATUS_FILE=%WORK_DIR%\database-status.txt"
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d master -h -1 -W -v DatabaseName=%ADC_DB_NAME% -i "%~dp0sql\bootstrap\003_verificar_banco.sql" > "%DATABASE_STATUS_FILE%"
if errorlevel 1 (
  if exist "%DATABASE_STATUS_FILE%" del /q "%DATABASE_STATUS_FILE%" >nul 2>&1
  echo [ERRO] Falha ao consultar o estado do banco dedicado.
  exit /b 1
)
< "%DATABASE_STATUS_FILE%" set /p "DATABASE_STATUS="
if exist "%DATABASE_STATUS_FILE%" del /q "%DATABASE_STATUS_FILE%" >nul 2>&1
if /i not "%DATABASE_STATUS%"=="MISSING" if /i not "%DATABASE_STATUS%"=="EXISTS" (
  echo [ERRO] Nao foi possivel determinar o estado do banco dedicado.
  exit /b 1
)
exit /b 0

:PREPARAR_DIRETORIO_TEMPORARIO
set "RUN_ID="
for /f "usebackq delims=" %%G in (`powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"`) do set "RUN_ID=%%G"
if not defined RUN_ID (
  echo [ERRO] Nao foi possivel gerar identificador temporario seguro.
  exit /b 1
)
set "WORK_DIR=%TEMP%\AvaliacaoDesempenhoDatabase_%RUN_ID%"
mkdir "%WORK_DIR%" >nul 2>&1
if not exist "%WORK_DIR%\" (
  echo [ERRO] Nao foi possivel preparar diretorio temporario para executar migrations.
  exit /b 1
)
exit /b 0

:VERIFICAR_PROPRIEDADE
set "PROJECT_OWNERSHIP="
set "PROJECT_OWNERSHIP_FILE=%WORK_DIR%\project-ownership.txt"
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -h -1 -W -i "%~dp0sql\bootstrap\005_verificar_propriedade.sql" > "%PROJECT_OWNERSHIP_FILE%"
if errorlevel 1 (
  if exist "%PROJECT_OWNERSHIP_FILE%" del /q "%PROJECT_OWNERSHIP_FILE%" >nul 2>&1
  echo [ERRO] Nao foi possivel confirmar a propriedade do banco existente.
  exit /b 1
)
< "%PROJECT_OWNERSHIP_FILE%" set /p "PROJECT_OWNERSHIP="
if exist "%PROJECT_OWNERSHIP_FILE%" del /q "%PROJECT_OWNERSHIP_FILE%" >nul 2>&1
if /i "%PROJECT_OWNERSHIP%"=="OWNED" exit /b 0
if /i "%PROJECT_OWNERSHIP%"=="UNMARKED" (
  echo [ERRO] O banco com este nome ja existe, mas nao possui marcador deste projeto.
  echo Nenhuma tabela ou migration sera criada nele. Confirme o alvo antes de qualquer acao manual.
  exit /b 1
)
if /i "%PROJECT_OWNERSHIP%"=="OTHER_PROJECT" (
  echo [ERRO] O banco com este nome possui marcador de outro projeto.
  exit /b 1
)
echo [ERRO] Marcador de propriedade do banco invalido.
exit /b 1

:VERIFICAR_BOOTSTRAP_VAZIO
set "EMPTY_BOOTSTRAP_STATUS="
set "EMPTY_BOOTSTRAP_FILE=%WORK_DIR%\empty-bootstrap-status.txt"
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -h -1 -W -i "%~dp0sql\bootstrap\007_verificar_bootstrap_vazio.sql" > "%EMPTY_BOOTSTRAP_FILE%"
if errorlevel 1 (
  if exist "%EMPTY_BOOTSTRAP_FILE%" del /q "%EMPTY_BOOTSTRAP_FILE%" >nul 2>&1
  echo [ERRO] Nao foi possivel verificar se o bootstrap interrompido deixou a base vazia.
  exit /b 1
)
< "%EMPTY_BOOTSTRAP_FILE%" set /p "EMPTY_BOOTSTRAP_STATUS="
if exist "%EMPTY_BOOTSTRAP_FILE%" del /q "%EMPTY_BOOTSTRAP_FILE%" >nul 2>&1
if /i "%EMPTY_BOOTSTRAP_STATUS%"=="SAFE_EMPTY_BOOTSTRAP" exit /b 0
echo [ERRO] A base nao esta vazia ou possui metadados; a recuperacao do bootstrap foi bloqueada.
exit /b 1

:CONFIRMAR_APLICACAO
if /i "%ADC_DATABASE_INTERNAL_AUTO_CONFIRM%"=="1" (
  echo [INFO] Confirmacao interativa dispensada pelo fluxo automatico dos dois alvos.
  exit /b 0
)
echo.
set "CONFIRMACAO="
set /p "CONFIRMACAO=Digite exatamente APLICAR %ADC_DB_NAME% para continuar: "
if /i not "%CONFIRMACAO%"=="APLICAR %ADC_DB_NAME%" (
  echo Operacao cancelada. Nenhuma alteracao foi feita.
  exit /b 1
)
exit /b 0

:CONFIRMAR_APLICACAO_TODOS
echo.
set "CONFIRMACAO="
set /p "CONFIRMACAO=Digite exatamente APLICAR TODOS AVALIACAO_DEV AVALIACAO_PROD para continuar: "
if /i not "%CONFIRMACAO%"=="APLICAR TODOS AVALIACAO_DEV AVALIACAO_PROD" (
  echo Operacao cancelada. Nenhuma alteracao foi feita.
  exit /b 1
)
exit /b 0

:EXECUTAR_NO_ALVO
set "TARGET_CONFIG=%~f1"
set "TARGET_MODE=%~2"
if not exist "%TARGET_CONFIG%" (
  echo [ERRO] Configuracao do alvo nao encontrada: %TARGET_CONFIG%
  exit /b 1
)
set "SAVED_ADC_DATABASE_CONFIG=%ADC_DATABASE_CONFIG%"
set "SAVED_ADC_DATABASE_INTERNAL_AUTO_CONFIRM=%ADC_DATABASE_INTERNAL_AUTO_CONFIRM%"
set "ADC_DATABASE_CONFIG=%TARGET_CONFIG%"
if /i "%~3"=="AUTO_CONFIRM" set "ADC_DATABASE_INTERNAL_AUTO_CONFIRM=1"
call "%~f0" %TARGET_MODE%
set "TARGET_EXIT_CODE=%ERRORLEVEL%"
set "ADC_DATABASE_CONFIG=%SAVED_ADC_DATABASE_CONFIG%"
set "ADC_DATABASE_INTERNAL_AUTO_CONFIRM=%SAVED_ADC_DATABASE_INTERNAL_AUTO_CONFIRM%"
exit /b %TARGET_EXIT_CODE%

:VALIDAR_ALVOS_CANONICOS
if not exist "%~dp0config.local.bat" (
  echo [ERRO] Configuracao de desenvolvimento nao encontrada: %~dp0config.local.bat
  exit /b 1
)
if not exist "%~dp0config.production.local.bat" (
  echo [ERRO] Configuracao de producao nao encontrada: %~dp0config.production.local.bat
  exit /b 1
)
exit /b 0

:CONFIRMAR_RECUPERACAO_V0001
echo.
set "CONFIRMACAO="
set /p "CONFIRMACAO=Digite exatamente RECUPERAR %ADC_DB_NAME% V0001 para recuperar a fundacao parcial vazia: "
if /i not "%CONFIRMACAO%"=="RECUPERAR %ADC_DB_NAME% V0001" (
  echo Operacao cancelada. Nenhuma alteracao foi feita.
  exit /b 1
)
exit /b 0

:CONFIRMAR_RECUPERACAO_BOOTSTRAP_VAZIO
echo.
set "CONFIRMACAO="
set /p "CONFIRMACAO=Digite exatamente RECUPERAR %ADC_DB_NAME% BOOTSTRAP_VAZIO para retomar: "
if /i not "%CONFIRMACAO%"=="RECUPERAR %ADC_DB_NAME% BOOTSTRAP_VAZIO" (
  echo Operacao cancelada. Nenhuma alteracao foi feita.
  exit /b 1
)
exit /b 0

:GERAR_LISTA_MIGRATIONS
set "ADC_MIGRATION_DIR=%~dp0sql\migrations"
set "ADC_MIGRATION_LIST=%WORK_DIR%\migration-files.txt"
set "ADC_MIGRATION_MANIFEST=%WORK_DIR%\migration-manifest.txt"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\preparar-migrations.ps1" -MigrationDirectory "%ADC_MIGRATION_DIR%" -ListPath "%ADC_MIGRATION_LIST%" -ManifestPath "%ADC_MIGRATION_MANIFEST%"
if errorlevel 1 (
  echo [ERRO] Nao foi possivel gerar a lista e o manifesto de migrations.
  exit /b 1
)
exit /b 0

:CALCULAR_SHA256
set "SHA256_INPUT=%~1"
set "SHA256_OUTPUT=%~2"
if not exist "%SHA256_INPUT%" (
  echo [ERRO] Arquivo nao encontrado para calcular SHA-256.
  exit /b 1
)
if not defined SHA256_OUTPUT (
  echo [ERRO] Destino temporario de SHA-256 nao foi informado.
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\calcular-sha256.ps1" -Path "%SHA256_INPUT%" > "%SHA256_OUTPUT%"
if errorlevel 1 (
  if exist "%SHA256_OUTPUT%" del /q "%SHA256_OUTPUT%" >nul 2>&1
  echo [ERRO] Nao foi possivel calcular SHA-256.
  exit /b 1
)
exit /b 0

:VALIDAR_SHA256
set "ADC_SHA256_TO_VALIDATE=%~1"
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; try { if ($env:ADC_SHA256_TO_VALIDATE -notmatch '^[0-9a-f]{64}$') { throw 'Checksum SHA-256 invalido.' } } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"
if errorlevel 1 exit /b 1
exit /b 0

:RECONCILIAR_HISTORICO
set "ADC_MIGRATION_HISTORY=%WORK_DIR%\migration-history.txt"
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -h -1 -W -s "|" -i "%~dp0sql\bootstrap\006_listar_historico_migrations.sql" > "%ADC_MIGRATION_HISTORY%"
if errorlevel 1 (
  echo [ERRO] Nao foi possivel ler o historico de migrations.
  exit /b 1
)
powershell -NoProfile -Command "$disk=@{}; foreach($line in [System.IO.File]::ReadAllLines($env:ADC_MIGRATION_MANIFEST)){ if([string]::IsNullOrWhiteSpace($line)){ continue }; $parts=$line.Split([char]'|'); if($parts.Count -ne 3){ throw ('Manifesto invalido: ' + $line) }; $disk[$parts[0]]=[pscustomobject]@{ Name=$parts[1]; Checksum=$parts[2] } }; $history=@{}; foreach($line in [System.IO.File]::ReadAllLines($env:ADC_MIGRATION_HISTORY)){ if([string]::IsNullOrWhiteSpace($line)){ continue }; $parts=$line.Split([char]'|'); if($parts.Count -ne 3){ throw ('Historico invalido: ' + $line) }; $history[$parts[0]]=[pscustomobject]@{ Name=$parts[1]; Checksum=$parts[2] } }; $maxApplied=0; foreach($version in $history.Keys){ if(-not $disk.ContainsKey($version)){ throw ('Migration aplicada ausente do repositorio: ' + $version) }; if($disk[$version].Name -ne $history[$version].Name){ throw ('Nome divergente para migration aplicada: ' + $version) }; if($disk[$version].Checksum -ne $history[$version].Checksum){ throw ('Checksum divergente para migration aplicada: ' + $version) }; $number=[int]($version.Substring(1)); if($number -gt $maxApplied){ $maxApplied=$number } }; foreach($version in $disk.Keys){ if(-not $history.ContainsKey($version) -and [int]($version.Substring(1)) -le $maxApplied){ throw ('Migration pendente fora de ordem: ' + $version) } }; Write-Output ('Historico reconciliado: ' + $history.Count + ' aplicada(s), ' + ($disk.Count - $history.Count) + ' pendente(s).')"
if errorlevel 1 (
  echo [ERRO] Historico de migrations nao e compativel com os arquivos do repositorio.
  exit /b 1
)
exit /b 0

:OBTER_ESTADO_FUNDACAO_V0001
set "FUNDACAO_V0001_ESTADO="
set "FUNDACAO_V0001_FILE=%WORK_DIR%\fundacao-v0001-status.txt"
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -h -1 -W -i "%~dp0sql\validation\002_verificar_deriva_v0001.sql" > "%FUNDACAO_V0001_FILE%"
if errorlevel 1 (
  if exist "%FUNDACAO_V0001_FILE%" del /q "%FUNDACAO_V0001_FILE%" >nul 2>&1
  echo [ERRO] Nao foi possivel verificar o estado da fundacao V0001.
  exit /b 1
)
< "%FUNDACAO_V0001_FILE%" set /p "FUNDACAO_V0001_ESTADO="
if exist "%FUNDACAO_V0001_FILE%" del /q "%FUNDACAO_V0001_FILE%" >nul 2>&1
if /i "%FUNDACAO_V0001_ESTADO%"=="LIMPA" exit /b 0
if /i "%FUNDACAO_V0001_ESTADO%"=="PARCIAL" exit /b 0
if /i "%FUNDACAO_V0001_ESTADO%"=="APLICADA" exit /b 0
if /i "%FUNDACAO_V0001_ESTADO%"=="INCONSISTENTE" exit /b 0
echo [ERRO] Estado da fundacao V0001 invalido.
exit /b 1

:APLICAR_MIGRATION
set "MIGRATION_SOURCE=%~1"
for %%M in ("%MIGRATION_SOURCE%") do set "MIGRATION_NAME=%%~nM"
for /f "tokens=1 delims=_" %%V in ("%MIGRATION_NAME%") do set "MIGRATION_VERSION=%%V"
set "MIGRATION_FILE=%WORK_DIR%\%MIGRATION_NAME%.sql"
copy /y "%MIGRATION_SOURCE%" "%MIGRATION_FILE%" >nul
if errorlevel 1 (
  echo [ERRO] Nao foi possivel copiar %MIGRATION_NAME% para execucao protegida.
  exit /b 1
)
set "MIGRATION_CHECKSUM="
set "MIGRATION_HASH_FILE=%WORK_DIR%\%MIGRATION_VERSION%_apply_sha256.txt"
call :CALCULAR_SHA256 "%MIGRATION_FILE%" "%MIGRATION_HASH_FILE%"
if errorlevel 1 (
  echo [ERRO] Nao foi possivel calcular o checksum de %MIGRATION_NAME%.
  exit /b 1
)
< "%MIGRATION_HASH_FILE%" set /p "MIGRATION_CHECKSUM="
if exist "%MIGRATION_HASH_FILE%" del /q "%MIGRATION_HASH_FILE%" >nul 2>&1
call :VALIDAR_SHA256 "%MIGRATION_CHECKSUM%"
if errorlevel 1 (
  echo [ERRO] Nao foi possivel calcular o checksum de %MIGRATION_NAME%.
  exit /b 1
)

set "MIGRATION_STATUS="
set "MIGRATION_STATUS_FILE=%WORK_DIR%\%MIGRATION_VERSION%_status.txt"
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -h -1 -W -v MigrationVersion=%MIGRATION_VERSION% MigrationChecksum=%MIGRATION_CHECKSUM% -i "%~dp0sql\bootstrap\004_verificar_migration.sql" > "%MIGRATION_STATUS_FILE%"
if errorlevel 1 (
  if exist "%MIGRATION_STATUS_FILE%" del /q "%MIGRATION_STATUS_FILE%" >nul 2>&1
  echo [ERRO] Falha ao consultar o historico de %MIGRATION_NAME%.
  exit /b 1
)
< "%MIGRATION_STATUS_FILE%" set /p "MIGRATION_STATUS="
if exist "%MIGRATION_STATUS_FILE%" del /q "%MIGRATION_STATUS_FILE%" >nul 2>&1

if /i "%MIGRATION_STATUS%"=="APPLIED" (
  echo [SKIP] %MIGRATION_NAME% ja aplicada com o mesmo checksum.
  exit /b 0
)
if /i "%MIGRATION_STATUS%"=="CHECKSUM_MISMATCH" (
  echo [ERRO] %MIGRATION_NAME% possui checksum diferente do historico. Crie uma nova migration; nao altere uma aplicada.
  exit /b 1
)
if /i not "%MIGRATION_STATUS%"=="PENDING" (
  echo [ERRO] Nao foi possivel verificar %MIGRATION_NAME%.
  exit /b 1
)

set "MASTER_MIGRATION=%WORK_DIR%\%MIGRATION_VERSION%_apply.sql"
set "MIGRATION_RECOVERY_PARAMETER="
if /i "%~2"=="RECUPERAR_V0001" set "MIGRATION_RECOVERY_PARAMETER=-RecoverPartialV0001"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\preparar-master-migration.ps1" -MigrationPath "%MIGRATION_FILE%" -ExpectedChecksum "%MIGRATION_CHECKSUM%" -OutputPath "%MASTER_MIGRATION%" %MIGRATION_RECOVERY_PARAMETER%
if errorlevel 1 (
  echo [ERRO] Nao foi possivel preparar o wrapper atomico de %MIGRATION_NAME%.
  exit /b 1
)

echo [ETAPA] Aplicando %MIGRATION_NAME%...
set "MIGRATION_RESULT_FILE=%WORK_DIR%\%MIGRATION_VERSION%_result.txt"
sqlcmd %SQLCMD_FLAGS% -S "%SQLCMD_SERVER%" -E -d "%ADC_DB_NAME%" -h -1 -W -i "%MASTER_MIGRATION%" > "%MIGRATION_RESULT_FILE%"
if errorlevel 1 (
  if exist "%MIGRATION_RESULT_FILE%" del /q "%MIGRATION_RESULT_FILE%" >nul 2>&1
  echo [ERRO] Falha ao aplicar %MIGRATION_NAME%.
  exit /b 1
)
set "MIGRATION_RESULT="
< "%MIGRATION_RESULT_FILE%" set /p "MIGRATION_RESULT="
if exist "%MIGRATION_RESULT_FILE%" del /q "%MIGRATION_RESULT_FILE%" >nul 2>&1
if /i "%MIGRATION_RESULT%"=="__ADC_MIGRATION_APPLIED__" (
  echo [OK] %MIGRATION_NAME% aplicada.
  exit /b 0
)
if /i "%MIGRATION_RESULT%"=="__ADC_MIGRATION_SKIPPED__" (
  echo [SKIP] %MIGRATION_NAME% ja aplicada durante a execucao protegida.
  exit /b 0
)
echo [ERRO] O wrapper atomico de %MIGRATION_NAME% nao retornou resultado reconhecido.
exit /b 1

:ARGUMENTOS_INVALIDOS
echo [ERRO] Argumento invalido. Use --help para ver os comandos aceitos.
set "EXIT_CODE=1"
goto :FIM

:AJUDA
echo.
echo Uso:
echo   executar-database.bat
echo      Atualiza automaticamente AVALIACAO_DEV e AVALIACAO_PROD, sem confirmacao.
echo      O comando exige os dois arquivos locais de configuracao antes de iniciar.
echo.
echo   executar-database.bat --apply-all
echo      Atualiza primeiro AVALIACAO_DEV e depois AVALIACAO_PROD, usando somente
echo      os arquivos locais config.local.bat e config.production.local.bat.
echo      Exige uma confirmacao global e as confirmacoes individuais dos dois bancos.
echo.
echo   executar-database.bat --check-all
echo      Verifica AVALIACAO_DEV e AVALIACAO_PROD, sem criar ou alterar bancos.
echo.
echo   executar-database.bat --check
echo      Valida configuracao, sqlcmd, conexao local, arquivos e hashes de migrations.
echo      Quando o banco existe, tambem reconcilia seu historico em modo somente leitura.
echo.
echo   executar-database.bat --apply
echo      Cria somente o banco configurado e autorizado se ele ainda nao existir,
echo      aplica migrations pendentes e executa validacao de leitura. Exige confirmacao digitada.
echo.
echo   executar-database.bat --validate
echo      Confere historico, checksum, deriva V0001 e todas as validacoes SQL de leitura.
echo      Exige o banco ja existente e nao cria, altera ou aplica migrations.
echo.
echo   executar-database.bat --recover-v0001-partial
echo      Recupera somente o prefixo vazio e exatamente reconhecido da V0001,
echo      reaplica a fundacao na mesma transacao e exige confirmacao distinta.
echo.
echo   executar-database.bat --recover-empty-bootstrap
echo      Retoma somente um bootstrap interrompido antes de qualquer tabela ou metadado.
echo      Exige base vazia confirmada e uma confirmacao distinta.
echo.
echo Seguranca:
echo   - Usa autenticacao integrada do Windows; nao le senha nem usa sa.
echo   - Nao possui DROP DATABASE, --recriar, --force ou alteracao de outros bancos.
echo   - Migration aplicada e imutavel: checksum divergente interrompe a execucao.
echo.
exit /b 0

:FIM
if defined WORK_DIR if exist "%WORK_DIR%\" rmdir /s /q "%WORK_DIR%" >nul 2>&1
endlocal & exit /b %EXIT_CODE%

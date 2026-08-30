@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

if /i "%AVALIACAO_DESEMPENHO_ENV_LOADED%"=="1" goto :environment_loaded
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-production-from-env.ps1" %*
exit /b %ERRORLEVEL%

:environment_loaded
title Avaliacao de Desempenho - Producao PM2

set "BACKEND_HOST=127.0.0.1"
set "BACKEND_PORT=18081"
set "FRONTEND_HOST=127.0.0.1"
set "FRONTEND_PORT=18080"
set "BACKEND_PROCESS=avaliacao-desempenho-backend-prod"
set "FRONTEND_PROCESS=avaliacao-desempenho-frontend-prod"
set "PRODUCTION_CONFIG_PATH=%AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG%"
set "PRODUCTION_API_BASE_URL=%AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL%"
set "PRODUCTION_LOG_DIRECTORY=%AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY%"
set "CHECK_ONLY="

if "%~1"=="" goto :arguments_ok
if /i "%~1"=="--check" (
  set "CHECK_ONLY=1"
  goto :arguments_ok
)

echo Uso: %~nx0 [--check]
exit /b 2

:arguments_ok
where powershell >nul 2>&1
if errorlevel 1 (
  echo [Avaliacao PROD] PowerShell nao foi encontrado.
  exit /b 1
)

where pm2 >nul 2>&1
if errorlevel 1 (
  echo [Avaliacao PROD] PM2 nao foi encontrado. Instale-o antes de publicar.
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [Avaliacao PROD] Node.js nao foi encontrado no PATH.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-backend.ps1" -ValidateOnly
if errorlevel 1 exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\validate-production-runtime.ps1"
if errorlevel 1 exit /b 1

if not exist "frontend\package-lock.json" (
  echo [Avaliacao PROD] frontend\package-lock.json nao foi encontrado.
  exit /b 1
)

call :assert_port_free_when_process_is_missing "%BACKEND_PROCESS%" "%BACKEND_PORT%"
if errorlevel 1 exit /b 1

call :assert_port_free_when_process_is_missing "%FRONTEND_PROCESS%" "%FRONTEND_PORT%"
if errorlevel 1 exit /b 1

if defined CHECK_ONLY (
  echo [Avaliacao PROD] Pre-requisitos validados. Nenhum build ou processo PM2 foi alterado.
  echo [Avaliacao PROD] Processos PM2 previstos: %BACKEND_PROCESS% e %FRONTEND_PROCESS%
  echo [Avaliacao PROD] Portas privadas previstas: %BACKEND_PORT% e %FRONTEND_PORT%
  exit /b 0
)

call :ensure_frontend_dependencies
if errorlevel 1 exit /b 1

for /f %%R in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"') do set "BACKEND_RELEASE_DIRECTORY=target\releases\%%R"
if not defined BACKEND_RELEASE_DIRECTORY (
  echo [Avaliacao PROD] Nao foi possivel preparar o diretorio imutavel do release.
  exit /b 1
)

echo [Avaliacao PROD] Executando o gate local completo antes de alterar PM2...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\verify-quality.ps1" -BackendBuildDirectory "%BACKEND_RELEASE_DIRECTORY%"
if errorlevel 1 (
  echo [Avaliacao PROD] Pre-flight falhou; nenhum processo PM2 foi alterado.
  exit /b 1
)

call :resolve_backend_jar
if errorlevel 1 exit /b 1

call :resolve_node_executable
if errorlevel 1 exit /b 1

set "VITE_API_BASE_URL=%PRODUCTION_API_BASE_URL%"
echo [Avaliacao PROD] Gerando o build final do front-end com a API publica autorizada...
pushd frontend
call npm run build
if errorlevel 1 (
  popd
  exit /b 1
)
popd

set "VITE_CLI=%~dp0frontend\node_modules\vite\bin\vite.js"
if not exist "%VITE_CLI%" (
  echo [Avaliacao PROD] Vite nao foi encontrado apos npm ci.
  exit /b 1
)

set "JAVA_EXECUTABLE=%JAVA_HOME%\bin\java.exe"
if not exist "%JAVA_EXECUTABLE%" (
  echo [Avaliacao PROD] JAVA_HOME nao aponta para java.exe.
  exit /b 1
)

set "PM2_ECOSYSTEM_FILE=%~dp0ecosystem.config.cjs"
if not exist "%PM2_ECOSYSTEM_FILE%" (
  echo [Avaliacao PROD] ecosystem.config.cjs nao foi encontrado.
  exit /b 1
)
set "ADC_PM2_BACKEND_HOST=%BACKEND_HOST%"
set "ADC_PM2_BACKEND_PORT=%BACKEND_PORT%"
set "ADC_PM2_FRONTEND_HOST=%FRONTEND_HOST%"
set "ADC_PM2_FRONTEND_PORT=%FRONTEND_PORT%"
set "ADC_PM2_BACKEND_JAR=%BACKEND_JAR%"
set "ADC_PM2_JAVA_EXECUTABLE=%JAVA_EXECUTABLE%"
set "ADC_PM2_NODE_EXECUTABLE=%NODE_EXECUTABLE%"
set "ADC_PM2_VITE_CLI=%VITE_CLI%"
set "ADC_PM2_PRODUCTION_CONFIG_PATH=%PRODUCTION_CONFIG_PATH%"
set "ADC_PM2_PRODUCTION_LOG_DIRECTORY=%PRODUCTION_LOG_DIRECTORY%"

call :start_or_restart_backend
if errorlevel 1 goto :pm2_failed

call :wait_for_port "%BACKEND_PORT%"
if errorlevel 1 goto :pm2_failed

call :start_or_restart_frontend
if errorlevel 1 goto :pm2_failed

call :wait_for_port "%FRONTEND_PORT%"
if errorlevel 1 goto :pm2_failed

call pm2 save
if errorlevel 1 goto :pm2_failed

echo.
echo [Avaliacao PROD] API privada:       http://%BACKEND_HOST%:%BACKEND_PORT%
echo [Avaliacao PROD] Front-end privado: http://%FRONTEND_HOST%:%FRONTEND_PORT%
echo [Avaliacao PROD] Status: pm2 status %BACKEND_PROCESS% %FRONTEND_PROCESS%
echo [Avaliacao PROD] O script nao configura Cloudflare, firewall, TLS ou inicializacao apos reboot.
exit /b 0

:resolve_backend_jar
set "BACKEND_JAR="
set /a BACKEND_JAR_COUNT=0
for %%F in ("backend\%BACKEND_RELEASE_DIRECTORY%\avaliacao-desempenho-api-*.jar") do (
  set /a BACKEND_JAR_COUNT+=1
  set "BACKEND_JAR=%%~fF"
)

if "%BACKEND_JAR_COUNT%"=="1" exit /b 0

echo [Avaliacao PROD] Era esperado exatamente um JAR no release %BACKEND_RELEASE_DIRECTORY%.
exit /b 1

:ensure_frontend_dependencies
set "FRONTEND_LOCK_HASH="
set "FRONTEND_INSTALLED_HASH="
for /f "skip=1 tokens=*" %%H in ('certutil -hashfile "frontend\package-lock.json" SHA256') do if not defined FRONTEND_LOCK_HASH set "FRONTEND_LOCK_HASH=%%H"
set "FRONTEND_LOCK_HASH=%FRONTEND_LOCK_HASH: =%"
if exist "frontend\node_modules\.adc-package-lock.sha256" set /p FRONTEND_INSTALLED_HASH=<"frontend\node_modules\.adc-package-lock.sha256"
if defined FRONTEND_LOCK_HASH if /i "%FRONTEND_LOCK_HASH%"=="%FRONTEND_INSTALLED_HASH%" (
  echo [Avaliacao PROD] Dependencias exatas do front-end ja conferem com o package-lock.
  exit /b 0
)

echo [Avaliacao PROD] Instalando dependencias exatas do front-end...
pushd frontend
call npm ci
if errorlevel 1 (
  popd
  exit /b 1
)
set "FRONTEND_LOCK_HASH="
for /f "skip=1 tokens=*" %%H in ('certutil -hashfile "package-lock.json" SHA256') do if not defined FRONTEND_LOCK_HASH set "FRONTEND_LOCK_HASH=%%H"
set "FRONTEND_LOCK_HASH=%FRONTEND_LOCK_HASH: =%"
if not defined FRONTEND_LOCK_HASH (
  popd
  exit /b 1
)
> "node_modules\.adc-package-lock.sha256" echo %FRONTEND_LOCK_HASH%
if errorlevel 1 (
  popd
  exit /b 1
)
popd
exit /b 0

:resolve_node_executable
set "NODE_EXECUTABLE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXECUTABLE set "NODE_EXECUTABLE=%%N"

if defined NODE_EXECUTABLE exit /b 0

echo [Avaliacao PROD] Nao foi possivel localizar node.exe.
exit /b 1

:start_or_restart_backend
call :start_or_restart_pm2_application "%BACKEND_PROCESS%" "%BACKEND_PORT%"
exit /b %ERRORLEVEL%

:start_or_restart_frontend
call :start_or_restart_pm2_application "%FRONTEND_PROCESS%" "%FRONTEND_PORT%"
exit /b %ERRORLEVEL%

:start_or_restart_pm2_application
call pm2 describe "%~1" >nul 2>&1
if not errorlevel 1 (
  echo [Avaliacao PROD] Recriando somente %~1 pelo manifesto PM2...
  call pm2 delete "%~1"
  if errorlevel 1 exit /b 1
)
echo [Avaliacao PROD] Iniciando %~1 pelo manifesto PM2...
call :assert_port_free "%~2"
if errorlevel 1 exit /b 1
call pm2 start "%PM2_ECOSYSTEM_FILE%" --only "%~1" --update-env
exit /b %ERRORLEVEL%

:assert_port_free_when_process_is_missing
call pm2 describe "%~1" >nul 2>&1
if not errorlevel 1 exit /b 0
call :assert_port_free "%~2"
exit /b %ERRORLEVEL%

:assert_port_free
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = [int]%~1; $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue; if ($null -ne $listener) { Write-Error ('A porta {0} ja esta em uso. O script nao encerra processos de terceiros.' -f $port); exit 1 }; exit 0"
exit /b %ERRORLEVEL%

:wait_for_port
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = [int]%~1; $deadline = (Get-Date).AddSeconds(60); do { if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { exit 0 }; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"
exit /b %ERRORLEVEL%

:pm2_failed
echo [Avaliacao PROD] Falha ao iniciar ou validar processos deste projeto no PM2.
echo [Avaliacao PROD] Processos de terceiros nao foram interrompidos. Consulte os logs e o status do PM2.
exit /b 1

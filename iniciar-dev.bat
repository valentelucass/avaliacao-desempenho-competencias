@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

title Avaliacao de Desempenho - Desenvolvimento local

set "ADC_POWERSHELL=pwsh.exe"
where pwsh.exe >nul 2>nul
if errorlevel 1 set "ADC_POWERSHELL=powershell.exe"

if "%~1"=="" goto :start
if /i "%~1"=="--open-browser" (
  if not "%~2"=="" goto :usage
  "%ADC_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-dev-local.ps1" -KeepRunning -OpenBrowser
  set "ADC_EXIT=%ERRORLEVEL%"
  goto :result
)
if /i "%~1"=="--no-browser" (
  if not "%~2"=="" goto :usage
  "%ADC_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-dev-local.ps1" -KeepRunning
  set "ADC_EXIT=%ERRORLEVEL%"
  goto :result
)
if /i "%~1"=="--public-preview" (
  if "%~2"=="" goto :usage
  if not "%~3"=="" goto :usage
  "%ADC_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-dev-local.ps1" -KeepRunning -PublicPreviewOrigin "%~2"
  set "ADC_EXIT=%ERRORLEVEL%"
  goto :result
)

:usage
echo Uso: %~nx0 [--open-browser ^| --public-preview https://seu-tunel.devtunnels.ms]
echo Por padrao, o navegador nao e aberto automaticamente.
echo O modo de desenvolvimento compila a API localmente antes de iniciar.
echo Ele nao instala dependencias nem publica em producao.
echo A demonstracao publica e temporaria e libera somente o endereco exato informado.
exit /b 2

:start
"%ADC_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-dev-local.ps1" -KeepRunning
set "ADC_EXIT=%ERRORLEVEL%"

:result
if not "%ADC_EXIT%"=="0" exit /b %ADC_EXIT%
exit /b 0

@echo off
rem Opcional: ADC_DATABASE_CREDENTIAL_FILE aponta para PSCredential cifrado por DPAPI fora do Git.
rem Opcional: ADC_SQLCMD_EXECUTABLE e ADC_SQLCMD_SERVER_CERTIFICATE usam sqlcmd Go com pin TLS (-J).
rem Opcional: ADC_SQLCMD_LOCAL_TLS_PROFILE aponta para perfil privado de reconciliacao local do pin.
rem Copie este arquivo para config.production.local.bat. O arquivo local nao entra no Git.
rem Use uma conta autorizada somente para aplicar bootstrap e migrations.
rem Sem ADC_DB_USER usa Windows; para SQL, defina o login (sem senha) aqui.
rem A credencial DPAPI ou SQLCMDPASSWORD do processo fornece a senha, sem argumentos.
rem A aplicacao em producao usa a conta SQL de minimo privilegio criada em production\001.

set "ADC_DB_SERVER=localhost"
set "ADC_DB_PORT=1433"
set "ADC_DB_NAME=AVALIACAO_PROD"

rem Producao exige TLS com certificado SQL Server confiavel; nunca use 1 neste alvo.
set "ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=0"

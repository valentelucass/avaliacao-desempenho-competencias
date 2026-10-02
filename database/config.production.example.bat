@echo off
rem Copie este arquivo para config.production.local.bat. O arquivo local nao entra no Git.
rem Use uma conta autorizada somente para aplicar bootstrap e migrations.
rem Sem ADC_DB_USER usa Windows; para SQL, defina o login (sem senha) aqui.
rem O launcher solicita a senha sem exibi-la. SQLCMDPASSWORD dura so no gate.
rem A aplicacao em producao usa a conta SQL de minimo privilegio criada em production\001.

set "ADC_DB_SERVER=localhost"
set "ADC_DB_PORT=1433"
set "ADC_DB_NAME=AVALIACAO_PROD"

rem Producao exige TLS com certificado SQL Server confiavel; nunca use 1 neste alvo.
set "ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=0"

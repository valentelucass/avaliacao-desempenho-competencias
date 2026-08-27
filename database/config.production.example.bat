@echo off
rem Copie este arquivo para config.production.local.bat. O arquivo local nao entra no Git.
rem Use uma conta Windows administrativa somente para aplicar o bootstrap e as migrations.
rem A aplicacao em producao usa a conta SQL de minimo privilegio criada em production\001.

set "ADC_DB_SERVER=localhost"
set "ADC_DB_PORT=1433"
set "ADC_DB_NAME=AVALIACAO_PROD"

rem Producao exige TLS com certificado SQL Server confiavel; nunca use 1 neste alvo.
set "ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=0"

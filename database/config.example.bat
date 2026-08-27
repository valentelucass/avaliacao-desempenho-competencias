@echo off
rem Copie este arquivo para config.local.bat. O arquivo local nao entra no Git.
rem O bootstrap usa somente autenticacao integrada do Windows; nao coloque senha aqui.

set "ADC_DB_SERVER=localhost"
set "ADC_DB_PORT=1433"
set "ADC_DB_NAME=AVALIACAO_DEV"

rem Esta configuracao e exclusiva do banco local de desenvolvimento existente.
rem Na instancia local atual o certificado SQL Server nao e confiavel pelo Windows.
rem Use 1 somente neste alvo local; producao exige certificado valido e 0.
set "ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=1"

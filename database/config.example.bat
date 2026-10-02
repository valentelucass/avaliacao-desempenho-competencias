@echo off
rem Opcional: ADC_DATABASE_CREDENTIAL_FILE aponta para PSCredential cifrado por DPAPI fora do Git.
rem Opcional: ADC_SQLCMD_EXECUTABLE e ADC_SQLCMD_SERVER_CERTIFICATE usam sqlcmd Go com pin TLS (-J).
rem Opcional: ADC_SQLCMD_LOCAL_TLS_PROFILE aponta para perfil privado de reconciliacao local do pin.
rem Copie este arquivo para config.local.bat. O arquivo local nao entra no Git.
rem Sem ADC_DB_USER usa autenticacao Windows. Para SQL, defina o login e
rem SQLCMDPASSWORD apenas no processo. Nunca coloque senha neste arquivo.

set "ADC_DB_SERVER=localhost"
set "ADC_DB_PORT=1433"
set "ADC_DB_NAME=AVALIACAO_DEV"

rem Esta configuracao e exclusiva do banco local de desenvolvimento existente.
rem Na instancia local atual o certificado SQL Server nao e confiavel pelo Windows.
rem Use 1 somente neste alvo local; producao exige certificado valido e 0.
set "ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=1"

# Provisionamento SQL Server de produção

Esta pasta contém scripts manuais para a base de produção `AVALIACAO_PROD`. Eles não são migrations e o runner não os executa automaticamente.

## Sequência

1. Copie `database/config.production.example.bat` para `database/config.production.local.bat`.
2. Confirme que a instância SQL Server possui certificado TLS confiável; mantenha `ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=0`.
3. Para uma `AVALIACAO_PROD` nova, siga o bootstrap explícito descrito no [`../README.md`](../README.md): `--apply-bootstrap-prerequisites` até `V0009`, criação transacional do primeiro administrador supremo, depois `--apply` para `V0010` e migrations posteriores, seguida de `--validate`. Para um alvo de produção já existente e autorizado, confirme primeiro o histórico e aplique somente migrations pendentes:

   ```bat
   set ADC_DATABASE_CONFIG=%CD%\database\config.production.local.bat
   database\executar-database.bat --check
   database\executar-database.bat --apply
   database\executar-database.bat --validate
   ```

   A confirmação exigida é `APLICAR AVALIACAO_PROD`.

4. Em um terminal administrativo e seguro, crie a identidade SQL exclusiva da aplicação. Informe a senha apenas como variável do `sqlcmd`; não edite nem salve senha no script:

   ```bat
   sqlcmd -S localhost,1433 -E -N -d master -v ApplicationPassword="<senha forte e exclusiva>" -i database\production\001_criar_login_e_usuario_da_aplicacao.sql
   sqlcmd -S localhost,1433 -E -N -d master -i database\production\002_validar_login_e_usuario_da_aplicacao.sql
   ```

O login `rodogarcia_adc_app` recebe `CONNECT`, `SELECT`, `INSERT` e `UPDATE` no schema `dbo`, sem `DELETE` geral. Os únicos `DELETE` concedidos são em `dbo.ciclo_questionario` e `dbo.filial`, necessários às operações administrativas já limitadas pela API. Ele não recebe `db_owner`, `sysadmin`, DDL, acesso a outros bancos nem acesso aos scripts de migration.

## Configuração da API

Depois da validação, a configuração externa de produção deve apontar para a base nova e usar apenas a conta SQL criada acima. A URL JDBC precisa exigir TLS com certificado válido e não pode conter `trustServerCertificate=true`. Não publique enquanto a conexão TLS, os backups e o preflight não estiverem validados.

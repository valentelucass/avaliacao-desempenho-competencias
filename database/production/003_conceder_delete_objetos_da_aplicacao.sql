/*
  Reparo idempotente para um login da aplicação já provisionado. Não cria login,
  usuário ou senha e concede DELETE somente nos dois objetos usados pelas
  exclusões administrativas autorizadas pela API.
*/
:setvar DatabaseName "AVALIACAO_PROD"
:setvar ApplicationLogin "rodogarcia_adc_app"

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @database_name sysname = N'$(DatabaseName)';
DECLARE @login_name sysname = N'$(ApplicationLogin)';

IF @database_name <> N'AVALIACAO_PROD' OR @login_name <> N'rodogarcia_adc_app'
    THROW 52020, N'Parametros de reparo nao autorizados.', 1;

IF DB_ID(@database_name) IS NULL
    THROW 52021, N'O banco de producao nao existe.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.server_principals
    WHERE name = @login_name
      AND type_desc = N'SQL_LOGIN'
      AND is_disabled = 0
)
    THROW 52022, N'O login SQL ativo da aplicacao nao existe.', 1;

DECLARE @grant_sql nvarchar(max) =
    N'USE ' + QUOTENAME(@database_name) + N';
      SET XACT_ABORT ON;
      IF NOT EXISTS (
          SELECT 1
          FROM sys.database_principals
          WHERE name = @login_name
            AND type_desc = N''SQL_USER''
            AND authentication_type_desc = N''INSTANCE''
      )
          THROW 52023, N''O usuario SQL da aplicacao nao existe ou nao corresponde ao login.'', 1;
      BEGIN TRANSACTION;
      REVOKE DELETE ON SCHEMA::dbo FROM ' + QUOTENAME(@login_name) + N';
      GRANT DELETE ON OBJECT::dbo.ciclo_questionario TO ' + QUOTENAME(@login_name) + N';
      GRANT DELETE ON OBJECT::dbo.filial TO ' + QUOTENAME(@login_name) + N';
      COMMIT TRANSACTION;';

EXEC sys.sp_executesql @grant_sql, N'@login_name sysname', @login_name = @login_name;

PRINT N'Permissoes DELETE restritas aos dois objetos autorizados foram reconciliadas.';

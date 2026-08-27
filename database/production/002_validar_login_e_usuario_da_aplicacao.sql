/* Execute com uma conta administrativa depois do script 001. Esta validacao e somente leitura. */
:setvar DatabaseName "AVALIACAO_PROD"
:setvar ApplicationLogin "rodogarcia_adc_app"

SET NOCOUNT ON;

DECLARE @database_name sysname = N'$(DatabaseName)';
DECLARE @login_name sysname = N'$(ApplicationLogin)';

IF @database_name <> N'AVALIACAO_PROD' OR @login_name <> N'rodogarcia_adc_app'
    THROW 52010, N'Parametros de validacao nao autorizados.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.server_principals
    WHERE name = @login_name
      AND type_desc = N'SQL_LOGIN'
)
    THROW 52011, N'O login SQL da aplicacao nao existe.', 1;

DECLARE @validation nvarchar(max) =
    N'USE ' + QUOTENAME(@database_name) + N';
      DECLARE @user_name sysname = @login_name;
      IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @user_name)
          THROW 52012, N''O usuario da aplicacao nao existe no banco.'', 1;
      EXECUTE AS USER = @user_name;
      IF HAS_PERMS_BY_NAME(N''dbo'', N''SCHEMA'', N''SELECT'') <> 1
          THROW 52013, N''A aplicacao nao possui SELECT no schema dbo.'', 1;
      IF HAS_PERMS_BY_NAME(N''dbo'', N''SCHEMA'', N''INSERT'') <> 1
          THROW 52014, N''A aplicacao nao possui INSERT no schema dbo.'', 1;
      IF HAS_PERMS_BY_NAME(N''dbo'', N''SCHEMA'', N''UPDATE'') <> 1
          THROW 52015, N''A aplicacao nao possui UPDATE no schema dbo.'', 1;
      IF HAS_PERMS_BY_NAME(N''dbo'', N''SCHEMA'', N''DELETE'') = 1
          THROW 52016, N''A aplicacao nao deve possuir DELETE no schema dbo.'', 1;
      IF HAS_PERMS_BY_NAME(DB_NAME(), N''DATABASE'', N''ALTER'') = 1
          THROW 52017, N''A aplicacao nao deve possuir DDL no banco.'', 1;
      IF HAS_PERMS_BY_NAME(DB_NAME(), N''DATABASE'', N''CONTROL'') = 1
          THROW 52018, N''A aplicacao nao deve possuir CONTROL no banco.'', 1;
      REVERT;
      SELECT N''PRIVILEGIOS_MINIMOS_VALIDOS'';';

EXEC sys.sp_executesql @validation, N'@login_name sysname', @login_name = @login_name;

/*
  Execute com sqlcmd em uma conta administrativa, somente depois de aplicar as
  migrations no banco AVALIACAO_PROD.

  Exemplo (substitua a senha apenas no terminal seguro, nunca neste arquivo):
  sqlcmd -S localhost,1433 -E -N -d master -v ApplicationPassword="<senha forte>" -i database\production\001_criar_login_e_usuario_da_aplicacao.sql
*/
:setvar DatabaseName "AVALIACAO_PROD"
:setvar ApplicationLogin "rodogarcia_adc_app"

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @database_name sysname = N'$(DatabaseName)';
DECLARE @login_name sysname = N'$(ApplicationLogin)';
DECLARE @password nvarchar(256) = N'$(ApplicationPassword)';

IF @database_name <> N'AVALIACAO_PROD'
    THROW 52001, N'O script aceita somente o banco de producao autorizado.', 1;

IF DB_ID(@database_name) IS NULL
    THROW 52002, N'O banco de producao ainda nao existe ou as migrations nao foram aplicadas.', 1;

IF @login_name <> N'rodogarcia_adc_app'
    THROW 52003, N'O script aceita somente o login da aplicacao autorizado.', 1;

IF LEN(@password) -LT 24
    THROW 52004, N'Informe uma senha exclusiva com pelo menos 24 caracteres pelo parametro sqlcmd.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.server_principals
    WHERE name = @login_name
      AND type_desc <> N'SQL_LOGIN'
)
    THROW 52005, N'Ja existe um principal com esse nome, mas ele nao e um login SQL.', 1;

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @login_name)
BEGIN
    DECLARE @create_login nvarchar(max) =
        N'CREATE LOGIN ' + QUOTENAME(@login_name) +
        N' WITH PASSWORD = N''' + REPLACE(@password, N'''', N'''''') +
        N''', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = ' +
        QUOTENAME(@database_name) + N';';
    EXEC sys.sp_executesql @create_login;
END;

DECLARE @use_database nvarchar(max) =
    N'USE ' + QUOTENAME(@database_name) + N';
      IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @user_name)
      BEGIN
          DECLARE @create_user nvarchar(max) = N''CREATE USER '' + QUOTENAME(@user_name) + N'' FOR LOGIN '' + QUOTENAME(@login_name) + N'';'';
          EXEC sys.sp_executesql @create_user;
      END;
      ELSE IF USER_SID(@user_name) <> SUSER_SID(@login_name)
          THROW 52006, N''O usuario existente nao corresponde ao login SQL autorizado.'', 1;
      IF EXISTS (
          SELECT 1
          FROM sys.database_role_members membership
          INNER JOIN sys.database_principals role_principal
              ON role_principal.principal_id = membership.role_principal_id
          INNER JOIN sys.database_principals member_principal
              ON member_principal.principal_id = membership.member_principal_id
          WHERE member_principal.name = @user_name
            AND role_principal.name <> N''public''
      )
          THROW 52007, N''O usuario existente possui papel de banco incompativel.'', 1;
      DECLARE @grant_permissions nvarchar(max) =
          N''GRANT CONNECT TO '' + QUOTENAME(@user_name) + N'';
            GRANT SELECT, INSERT, UPDATE ON SCHEMA::dbo TO '' + QUOTENAME(@user_name) + N'';
            DENY DELETE ON SCHEMA::dbo TO '' + QUOTENAME(@user_name) + N'';'';
      EXEC sys.sp_executesql @grant_permissions;';

EXEC sys.sp_executesql
    @use_database,
    N'@user_name sysname, @login_name sysname',
    @user_name = @login_name,
    @login_name = @login_name;

PRINT N'Login e usuario da aplicacao configurados com privilegios minimos.';

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
      AND is_disabled = 0
)
    THROW 52011, N'O login SQL ativo da aplicacao nao existe.', 1;

IF IS_SRVROLEMEMBER(N'sysadmin', @login_name) = 1
    THROW 52019, N'O login SQL da aplicacao nao pode ser sysadmin.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.server_role_members
    WHERE member_principal_id = SUSER_ID(@login_name)
)
    THROW 52020, N'O login SQL da aplicacao nao pode integrar papel de servidor.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.server_permissions
    WHERE grantee_principal_id = SUSER_ID(@login_name)
      AND NOT (
          permission_name = N'CONNECT SQL'
          AND state_desc = N'GRANT'
      )
)
    THROW 52021, N'O login SQL da aplicacao possui permissao de servidor inesperada.', 1;

DECLARE @cross_database_validation nvarchar(max) =
    N'EXECUTE AS LOGIN = ' + QUOTENAME(@login_name, N'''') + N';
      IF EXISTS (
          SELECT 1
          FROM sys.databases
          WHERE database_id > 4
            AND name <> @database_name
            AND state = 0
            AND HAS_DBACCESS(name) = 1
      )
      BEGIN
          REVERT;
          THROW 52027, N''O login SQL da aplicacao acessa outro banco de usuario.'', 1;
      END;
      REVERT;';

EXEC sys.sp_executesql
    @cross_database_validation,
    N'@database_name sysname',
    @database_name = @database_name;

DECLARE @validation nvarchar(max) =
    N'USE ' + QUOTENAME(@database_name) + N';
      DECLARE @user_name sysname = @login_name;
      IF NOT EXISTS (
          SELECT 1
          FROM sys.database_principals
          WHERE name = @user_name
            AND type_desc = N''SQL_USER''
            AND authentication_type_desc = N''INSTANCE''
            AND sid = SUSER_SID(@login_name)
      )
          THROW 52012, N''O usuario da aplicacao nao existe no banco.'', 1;
      IF EXISTS (
          SELECT 1
          FROM sys.database_role_members
          WHERE member_principal_id = DATABASE_PRINCIPAL_ID(@user_name)
      )
          THROW 52022, N''O usuario da aplicacao nao pode integrar papel de banco.'', 1;
      IF EXISTS (
          SELECT 1
          FROM sys.database_permissions
          WHERE grantee_principal_id = DATABASE_PRINCIPAL_ID(@user_name)
            AND NOT (
                state_desc = N''GRANT''
                AND minor_id = 0
                AND (
                    (class_desc = N''DATABASE'' AND major_id = 0 AND permission_name = N''CONNECT'')
                    OR
                    (
                        class_desc = N''SCHEMA''
                        AND major_id = SCHEMA_ID(N''dbo'')
                        AND permission_name IN (N''SELECT'', N''INSERT'', N''UPDATE'')
                    )
                    OR
                    (
                        class_desc = N''OBJECT_OR_COLUMN''
                        AND major_id IN (
                            OBJECT_ID(N''dbo.filial''),
                            OBJECT_ID(N''dbo.ciclo_questionario'')
                        )
                        AND permission_name = N''DELETE''
                    )
                )
            )
      )
          THROW 52026, N''O usuario da aplicacao possui permissao direta fora da allowlist exata.'', 1;
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
      IF HAS_PERMS_BY_NAME(N''dbo.filial'', N''OBJECT'', N''DELETE'') <> 1
          THROW 52023, N''A aplicacao precisa de DELETE restrito em dbo.filial.'', 1;
      IF HAS_PERMS_BY_NAME(N''dbo.ciclo_questionario'', N''OBJECT'', N''DELETE'') <> 1
          THROW 52024, N''A aplicacao precisa de DELETE restrito em dbo.ciclo_questionario.'', 1;
      IF EXISTS (
          SELECT 1
          FROM sys.tables
          WHERE schema_id = SCHEMA_ID(N''dbo'')
            AND name NOT IN (N''filial'', N''ciclo_questionario'')
            AND HAS_PERMS_BY_NAME(
                QUOTENAME(SCHEMA_NAME(schema_id)) + N''.'' + QUOTENAME(name),
                N''OBJECT'',
                N''DELETE''
            ) = 1
      )
          THROW 52025, N''A aplicacao possui DELETE em objeto nao autorizado.'', 1;
      REVERT;
      SELECT N''PRIVILEGIOS_MINIMOS_VALIDOS'';';

EXEC sys.sp_executesql @validation, N'@login_name sysname', @login_name = @login_name;

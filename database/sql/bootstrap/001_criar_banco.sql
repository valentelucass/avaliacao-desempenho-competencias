:ON ERROR EXIT
SET NOCOUNT ON;

DECLARE @database_name sysname = N'$(DatabaseName)';

IF @database_name NOT IN (N'AVALIACAO_DEV', N'AVALIACAO_PROD')
    THROW 51010, N'Nome de banco nao autorizado para este bootstrap.', 1;

IF DB_ID(@database_name) IS NULL
BEGIN
    DECLARE @statement nvarchar(max) = N'CREATE DATABASE ' + QUOTENAME(@database_name) + N';';
    EXEC sys.sp_executesql @statement;
END;

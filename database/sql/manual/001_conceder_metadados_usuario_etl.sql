/*
  Uso manual e administrativo; este arquivo nao e executado pelo runner.

  Finalidade: permitir que a ferramenta local de administracao visualize a
  estrutura deste banco pelo login SQL usuario_etl. Nao concede SELECT,
  INSERT, UPDATE, DELETE, EXECUTE, papeis de banco ou acesso da aplicacao.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @login_sid varbinary(85) = SUSER_SID(N'usuario_etl');
    DECLARE @user_sid varbinary(85) =
        (SELECT sid FROM sys.database_principals WHERE name = N'usuario_etl');

    IF @login_sid IS NULL
        THROW 51050, N'O login SQL usuario_etl nao existe no servidor.', 1;

    IF @user_sid IS NOT NULL AND @user_sid <> @login_sid
        THROW 51051, N'Ja existe um usuario_etl neste banco com outro login.', 1;

    IF @user_sid IS NULL
        CREATE USER [usuario_etl] FOR LOGIN [usuario_etl];

    GRANT CONNECT TO [usuario_etl];
    GRANT VIEW DEFINITION TO [usuario_etl];

    COMMIT TRANSACTION;

    SELECT N'METADATA_ACCESS_GRANTED' AS resultado;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;

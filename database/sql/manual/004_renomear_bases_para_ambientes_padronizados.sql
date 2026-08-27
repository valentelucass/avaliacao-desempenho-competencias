:ON ERROR EXIT
SET NOCOUNT ON;
USE master;
GO

:setvar OldDevelopmentDatabase "AvaliacaoDesempenhoCompetencias"
:setvar OldProductionDatabase "RodogarciaAvaliacaoDesempenho"
:setvar DevelopmentDatabase "AVALIACAO_DEV"
:setvar ProductionDatabase "AVALIACAO_PROD"

DECLARE @old_development_database sysname = N'$(OldDevelopmentDatabase)';
DECLARE @old_production_database sysname = N'$(OldProductionDatabase)';
DECLARE @development_database sysname = N'$(DevelopmentDatabase)';
DECLARE @production_database sysname = N'$(ProductionDatabase)';
DECLARE @confirmation nvarchar(128) = N'$(Confirmation)';
DECLARE @development_renamed bit = 0;
DECLARE @production_renamed bit = 0;

IF @confirmation <> N'RENOMEAR AVALIACAO_DEV E AVALIACAO_PROD'
    THROW 51071, N'Confirmacao de renomeio invalida.', 1;

IF @old_development_database <> N'AvaliacaoDesempenhoCompetencias'
   OR @old_production_database <> N'RodogarciaAvaliacaoDesempenho'
   OR @development_database <> N'AVALIACAO_DEV'
   OR @production_database <> N'AVALIACAO_PROD'
    THROW 51072, N'Os nomes deste procedimento sao fixos e nao podem ser substituidos.', 1;

IF DB_ID(@old_development_database) IS NULL OR DB_ID(@old_production_database) IS NULL
    THROW 51073, N'Uma das bases de origem esperadas nao existe.', 1;

IF DB_ID(@development_database) IS NOT NULL OR DB_ID(@production_database) IS NOT NULL
    THROW 51074, N'Uma das bases de destino ja existe; o renomeio foi bloqueado.', 1;

BEGIN TRY
    ALTER DATABASE [AvaliacaoDesempenhoCompetencias] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    ALTER DATABASE [RodogarciaAvaliacaoDesempenho] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;

    ALTER DATABASE [AvaliacaoDesempenhoCompetencias] MODIFY NAME = [AVALIACAO_DEV];
    SET @development_renamed = 1;

    ALTER DATABASE [RodogarciaAvaliacaoDesempenho] MODIFY NAME = [AVALIACAO_PROD];
    SET @production_renamed = 1;

    ALTER DATABASE [AVALIACAO_DEV] SET MULTI_USER;
    ALTER DATABASE [AVALIACAO_PROD] SET MULTI_USER;
END TRY
BEGIN CATCH
    DECLARE @message nvarchar(2048) = ERROR_MESSAGE();

    IF @production_renamed = 1
       AND DB_ID(@production_database) IS NOT NULL
       AND DB_ID(@old_production_database) IS NULL
        ALTER DATABASE [AVALIACAO_PROD] MODIFY NAME = [RodogarciaAvaliacaoDesempenho];

    IF @development_renamed = 1
       AND DB_ID(@development_database) IS NOT NULL
       AND DB_ID(@old_development_database) IS NULL
        ALTER DATABASE [AVALIACAO_DEV] MODIFY NAME = [AvaliacaoDesempenhoCompetencias];

    IF DB_ID(@old_development_database) IS NOT NULL
        ALTER DATABASE [AvaliacaoDesempenhoCompetencias] SET MULTI_USER;

    IF DB_ID(@old_production_database) IS NOT NULL
        ALTER DATABASE [RodogarciaAvaliacaoDesempenho] SET MULTI_USER;

    THROW 51075, @message, 1;
END CATCH;

SELECT N'RENOMEIO_CONCLUIDO' AS result;

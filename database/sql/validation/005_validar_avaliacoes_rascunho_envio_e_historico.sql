SET NOCOUNT ON;

DECLARE @tabelas_necessarias TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @tabelas_necessarias (nome)
VALUES
    (N'avaliacao'),
    (N'versao_avaliacao'),
    (N'resposta_avaliacao'),
    (N'transicao_avaliacao');

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0004'
      AND script_name = N'V0004__avaliacoes_rascunho_envio_e_historico'
)
    THROW 51070, N'Migration de avaliacoes e historico ausente do historico.', 1;

IF EXISTS (
    SELECT 1
    FROM @tabelas_necessarias AS necessaria
    WHERE OBJECT_ID(N'dbo.' + necessaria.nome, N'U') IS NULL
)
    THROW 51071, N'Fundacao de avaliacoes incompleta.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_avaliacao_vinculo_gestor_colaborador'
)
    THROW 51072, N'Integridade entre avaliacao, gestor e colaborador ausente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_transicao_avaliacao_versao'
)
    THROW 51073, N'Integridade entre transicao e versao da avaliacao ausente.', 1;

SELECT
    (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas,
    (SELECT COUNT(*) FROM @tabelas_necessarias) AS tabelas_estruturais_validadas,
    (SELECT COUNT(*) FROM dbo.avaliacao) AS avaliacoes_criadas,
    (SELECT COUNT(*) FROM dbo.transicao_avaliacao) AS transicoes_registradas;


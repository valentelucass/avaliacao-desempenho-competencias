SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0007'
      AND script_name = N'V0007__atribuicao_questionario_por_colaborador_e_ciclo'
)
BEGIN
    SELECT
        N'V0007_PENDENTE' AS estado_atribuicao_questionario_por_colaborador_e_ciclo,
        (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas;
    RETURN;
END;

IF OBJECT_ID(N'dbo.atribuicao_questionario_colaborador', N'U') IS NULL
    THROW 51117, N'Tabela de atribuicao explicita de questionario ausente.', 1;

DECLARE @colunas_necessarias TABLE (
    tabela sysname NOT NULL,
    coluna sysname NOT NULL,
    permite_nulo bit NOT NULL,
    PRIMARY KEY (tabela, coluna)
);

INSERT INTO @colunas_necessarias (tabela, coluna, permite_nulo)
VALUES
    (N'atribuicao_questionario_colaborador', N'ciclo_avaliacao_id', 0),
    (N'atribuicao_questionario_colaborador', N'colaborador_id', 0),
    (N'atribuicao_questionario_colaborador', N'ciclo_questionario_id', 0),
    (N'atribuicao_questionario_colaborador', N'atribuido_por_usuario_id', 0),
    (N'atribuicao_questionario_colaborador', N'atribuido_em_utc', 0),
    (N'atribuicao_questionario_colaborador', N'revogado_por_usuario_id', 1),
    (N'atribuicao_questionario_colaborador', N'revogado_em_utc', 1),
    (N'atribuicao_questionario_colaborador', N'motivo_revogacao', 1),
    (N'avaliacao', N'atribuicao_questionario_colaborador_id', 0);

IF EXISTS (
    SELECT 1
    FROM @colunas_necessarias AS necessaria
    LEFT JOIN sys.columns AS coluna
        ON coluna.object_id = OBJECT_ID(N'dbo.' + necessaria.tabela, N'U')
       AND coluna.name = necessaria.coluna
    WHERE coluna.column_id IS NULL
       OR coluna.is_nullable <> necessaria.permite_nulo
)
    THROW 51118, N'Colunas ou nulabilidade da atribuicao de questionario divergentes.', 1;

DECLARE @checks_ativos TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @checks_ativos (nome)
VALUES
    (N'CK_atribuicao_questionario_colaborador_revogacao');

IF EXISTS (
    SELECT 1
    FROM @checks_ativos AS necessario
    LEFT JOIN sys.check_constraints AS restricao
        ON restricao.name = necessario.nome
    WHERE restricao.object_id IS NULL
       OR restricao.is_disabled = 1
       OR restricao.is_not_trusted = 1
)
    THROW 51119, N'Restricao de revogacao da atribuicao ausente ou nao confiavel.', 1;

DECLARE @chaves_estrangeiras TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @chaves_estrangeiras (nome)
VALUES
    (N'FK_atribuicao_questionario_colaborador_ciclo'),
    (N'FK_atribuicao_questionario_colaborador_colaborador'),
    (N'FK_atribuicao_questionario_colaborador_ciclo_questionario_ciclo'),
    (N'FK_atribuicao_questionario_colaborador_atribuido_por'),
    (N'FK_atribuicao_questionario_colaborador_revogado_por'),
    (N'FK_avaliacao_atribuicao_questionario_colaborador');

IF EXISTS (
    SELECT 1
    FROM @chaves_estrangeiras AS necessaria
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys AS chave
        WHERE chave.name = necessaria.nome
          AND chave.is_disabled = 0
          AND chave.is_not_trusted = 0
    )
)
    THROW 51120, N'Chave estrangeira da atribuicao de questionario ausente ou nao confiavel.', 1;

DECLARE @indices_unicos TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @indices_unicos (nome)
VALUES
    (N'UX_atribuicao_questionario_colaborador_ativa'),
    (N'UQ_atribuicao_questionario_colaborador_relacao');

IF EXISTS (
    SELECT 1
    FROM @indices_unicos AS necessario
    LEFT JOIN sys.indexes AS indice
        ON indice.name = necessario.nome
    WHERE indice.object_id IS NULL
       OR indice.is_unique = 0
)
    THROW 51121, N'Indice unico da atribuicao de questionario ausente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes AS indice
    WHERE indice.object_id = OBJECT_ID(N'dbo.atribuicao_questionario_colaborador', N'U')
      AND indice.name = N'UX_atribuicao_questionario_colaborador_ativa'
      AND indice.is_unique = 1
      AND indice.filter_definition LIKE N'%revogado_em_utc%IS NULL%'
)
    THROW 51123, N'Indice de atribuicao ativa sem filtro de revogacao.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys AS chave
    WHERE chave.name = N'FK_atribuicao_questionario_colaborador_ciclo_questionario_ciclo'
      AND chave.parent_object_id = OBJECT_ID(N'dbo.atribuicao_questionario_colaborador', N'U')
      AND chave.referenced_object_id = OBJECT_ID(N'dbo.ciclo_questionario', N'U')
      AND (SELECT COUNT(*)
           FROM sys.foreign_key_columns AS coluna
           WHERE coluna.constraint_object_id = chave.object_id) = 2
      AND EXISTS (
          SELECT 1
          FROM sys.foreign_key_columns AS coluna
          WHERE coluna.constraint_object_id = chave.object_id
            AND COL_NAME(chave.parent_object_id, coluna.parent_column_id) = N'ciclo_questionario_id'
            AND COL_NAME(chave.referenced_object_id, coluna.referenced_column_id)
                = N'ciclo_questionario_id'
      )
      AND EXISTS (
          SELECT 1
          FROM sys.foreign_key_columns AS coluna
          WHERE coluna.constraint_object_id = chave.object_id
            AND COL_NAME(chave.parent_object_id, coluna.parent_column_id) = N'ciclo_avaliacao_id'
            AND COL_NAME(chave.referenced_object_id, coluna.referenced_column_id)
                = N'ciclo_avaliacao_id'
      )
)
    THROW 51124, N'FK composta nao prova que ciclo_questionario pertence ao ciclo.', 1;

DECLARE @triggers_necessarias TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @triggers_necessarias (nome)
VALUES
    (N'TR_atribuicao_questionario_colaborador_historico'),
    (N'TR_atribuicao_questionario_colaborador_ciclo_rascunho'),
    (N'TR_avaliacao_questionario_atribuido_ativo');

IF EXISTS (
    SELECT 1
    FROM @triggers_necessarias AS necessario
    LEFT JOIN sys.triggers AS gatilho
        ON gatilho.name = necessario.nome
    WHERE gatilho.object_id IS NULL
       OR gatilho.is_disabled = 1
)
    THROW 51122, N'Gatilho da atribuicao de questionario ausente ou desabilitado.', 1;

SELECT
    (SELECT COUNT(*) FROM dbo.atribuicao_questionario_colaborador)
        AS atribuicoes_questionario,
    (SELECT COUNT(*)
     FROM dbo.atribuicao_questionario_colaborador
     WHERE revogado_em_utc IS NULL) AS atribuicoes_ativas;

SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0005'
      AND script_name = N'V0005__regra_operacional_2024_1_ciclos_questionarios_e_avaliacoes'
)
BEGIN
    SELECT
        N'V0005_PENDENTE' AS estado_regra_operacional_2024_1,
        (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas;
    RETURN;
END;

DECLARE @tabelas_necessarias TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @tabelas_necessarias (nome)
VALUES
    (N'vinculo_usuario_colaborador'),
    (N'configuracao_calculo_versao'),
    (N'matriz_classificacao_versao'),
    (N'faixa_classificacao'),
    (N'resultado_avaliacao');

IF EXISTS (
    SELECT 1
    FROM @tabelas_necessarias AS necessaria
    WHERE OBJECT_ID(N'dbo.' + necessaria.nome, N'U') IS NULL
)
    THROW 51093, N'Estruturas da regra operacional 2024.1 incompletas.', 1;

DECLARE @colunas_necessarias TABLE (
    tabela sysname NOT NULL,
    coluna sysname NOT NULL,
    permite_nulo bit NOT NULL,
    PRIMARY KEY (tabela, coluna)
);

INSERT INTO @colunas_necessarias (tabela, coluna, permite_nulo)
VALUES
    (N'pergunta_questionario', N'obrigatoria', 0),
    (N'opcao_resposta', N'pontos', 0),
    (N'ciclo_avaliacao', N'fuso_horario_iana', 0),
    (N'ciclo_avaliacao', N'autoavaliacao_habilitada', 0),
    (N'ciclo_questionario', N'configuracao_calculo_versao_id', 0),
    (N'ciclo_questionario', N'matriz_classificacao_versao_id', 0),
    (N'avaliacao', N'ciclo_avaliacao_id', 0),
    (N'avaliacao', N'vinculo_usuario_colaborador_id', 1),
    (N'avaliacao', N'vinculo_gestor_colaborador_id', 1),
    (N'versao_avaliacao', N'comentario', 1),
    (N'versao_avaliacao', N'plano_acao', 1);

IF EXISTS (
    SELECT 1
    FROM @colunas_necessarias AS necessaria
    LEFT JOIN sys.columns AS coluna
        ON coluna.object_id = OBJECT_ID(N'dbo.' + necessaria.tabela, N'U')
       AND coluna.name = necessaria.coluna
    WHERE coluna.column_id IS NULL
       OR coluna.is_nullable <> necessaria.permite_nulo
)
    THROW 51094, N'Colunas ou nulabilidade da regra operacional 2024.1 divergentes.', 1;

DECLARE @checks_ativos TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @checks_ativos (nome)
VALUES
    (N'CK_opcao_resposta_pontos_2024_1'),
    (N'CK_ciclo_avaliacao_fuso_2024_1'),
    (N'CK_ciclo_avaliacao_janela_2024_1'),
    (N'CK_avaliacao_tipo_2024_1'),
    (N'CK_avaliacao_relacao_por_tipo_2024_1'),
    (N'CK_versao_avaliacao_origem_2024_1'),
    (N'CK_versao_avaliacao_origem_situacao_2024_1'),
    (N'CK_transicao_avaliacao_acao_2024_1'),
    (N'CK_transicao_avaliacao_fluxo_2024_1'),
    (N'CK_transicao_avaliacao_motivo_reabertura_2024_1'),
    (N'CK_resultado_avaliacao_nota'),
    (N'CK_resultado_avaliacao_classificacao');

IF EXISTS (
    SELECT 1
    FROM @checks_ativos AS necessario
    LEFT JOIN sys.check_constraints AS restricao
        ON restricao.name = necessario.nome
    WHERE restricao.object_id IS NULL
       OR restricao.is_disabled = 1
       OR restricao.is_not_trusted = 1
)
    THROW 51095, N'Restricao ativa da regra operacional 2024.1 ausente ou nao confiavel.', 1;

DECLARE @checks_substituidos TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @checks_substituidos (nome)
VALUES
    (N'CK_avaliacao_tipo'),
    (N'CK_versao_avaliacao_origem'),
    (N'CK_versao_avaliacao_origem_situacao'),
    (N'CK_transicao_avaliacao_acao'),
    (N'CK_transicao_avaliacao_fluxo');

IF EXISTS (
    SELECT 1
    FROM @checks_substituidos AS substituido
    LEFT JOIN sys.check_constraints AS restricao
        ON restricao.name = substituido.nome
    WHERE restricao.object_id IS NULL
       OR restricao.is_disabled = 0
)
    THROW 51096, N'Restricao anterior incompatível com a regra 2024.1 permaneceu ativa.', 1;

DECLARE @chaves_estrangeiras TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @chaves_estrangeiras (nome)
VALUES
    (N'FK_vinculo_usuario_colaborador_usuario'),
    (N'FK_vinculo_usuario_colaborador_colaborador'),
    (N'FK_ciclo_questionario_configuracao'),
    (N'FK_ciclo_questionario_matriz_configuracao'),
    (N'FK_avaliacao_ciclo_questionario_ciclo'),
    (N'FK_avaliacao_vinculo_usuario_colaborador'),
    (N'FK_resultado_avaliacao_versao'),
    (N'FK_resultado_avaliacao_matriz_configuracao');

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
    THROW 51097, N'Chave estrangeira da regra operacional 2024.1 ausente ou nao confiavel.', 1;

DECLARE @indices_unicos TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @indices_unicos (nome)
VALUES
    (N'UX_vinculo_usuario_colaborador_usuario_ativo'),
    (N'UX_vinculo_usuario_colaborador_colaborador_ativo'),
    (N'UX_vinculo_gestor_colaborador_colaborador_ativo'),
    (N'UQ_avaliacao_ciclo_colaborador_tipo'),
    (N'UQ_resultado_avaliacao_versao');

IF EXISTS (
    SELECT 1
    FROM @indices_unicos AS necessario
    LEFT JOIN sys.indexes AS indice
        ON indice.name = necessario.nome
    WHERE indice.object_id IS NULL
       OR indice.is_unique = 0
)
    THROW 51098, N'Indice de unicidade da regra operacional 2024.1 ausente.', 1;

DECLARE @triggers_necessarias TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @triggers_necessarias (nome)
VALUES
    (N'TR_ciclo_avaliacao_janela_immutavel_apos_abertura'),
    (N'TR_ciclo_questionario_immutavel_apos_abertura'),
    (N'TR_versao_questionario_immutavel_apos_aprovacao'),
    (N'TR_questionario_competencia_immutavel_apos_aprovacao'),
    (N'TR_pergunta_questionario_immutavel_apos_aprovacao'),
    (N'TR_opcao_resposta_immutavel_apos_aprovacao'),
    (N'TR_versao_competencia_immutavel_apos_aprovacao'),
    (N'TR_resultado_avaliacao_imutavel');

IF EXISTS (
    SELECT 1
    FROM @triggers_necessarias AS necessario
    LEFT JOIN sys.triggers AS gatilho
        ON gatilho.name = necessario.nome
    WHERE gatilho.object_id IS NULL
       OR gatilho.is_disabled = 1
)
    THROW 51099, N'Gatilho de imutabilidade da regra operacional 2024.1 ausente ou desabilitado.', 1;

SELECT
    (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas,
    (SELECT COUNT(*) FROM @tabelas_necessarias) AS tabelas_estruturais_validadas,
    (SELECT COUNT(*) FROM dbo.configuracao_calculo_versao) AS configuracoes_calculo,
    (SELECT COUNT(*) FROM dbo.matriz_classificacao_versao) AS matrizes_classificacao,
    (SELECT COUNT(*) FROM dbo.resultado_avaliacao) AS resultados_calculados;

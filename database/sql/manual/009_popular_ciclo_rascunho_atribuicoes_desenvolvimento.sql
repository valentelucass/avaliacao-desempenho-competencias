/*
 * Cria um ciclo exclusivamente fictício em rascunho para testar a criação de
 * atribuições de questionário. Execute explicitamente e somente em AVALIACAO_DEV.
 * A operação é transacional e pode ser reexecutada sem duplicar a massa.
 */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'AVALIACAO_DEV'
    THROW 51250, N'O ciclo fictício de atribuições só pode ser criado em AVALIACAO_DEV.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0011'
      AND script_name = N'V0011__restringir_autoridade_administrador_plataforma'
)
    THROW 51251, N'O ciclo fictício exige a migração V0011 aplicada.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.ciclo_avaliacao
    WHERE codigo = N'DEV-ATRIBUICOES-RASCUNHO-2026'
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ciclo_avaliacao AS ciclo
        INNER JOIN dbo.ciclo_questionario AS ciclo_questionario
            ON ciclo_questionario.ciclo_avaliacao_id = ciclo.ciclo_avaliacao_id
        INNER JOIN dbo.versao_questionario AS versao
            ON versao.versao_questionario_id = ciclo_questionario.versao_questionario_id
        WHERE ciclo.codigo = N'DEV-ATRIBUICOES-RASCUNHO-2026'
          AND ciclo.situacao = 'RASCUNHO'
          AND versao.aprovado_em_utc IS NOT NULL
    )
        THROW 51252, N'O ciclo fictício existente não está pronto para criar atribuições.', 1;

    SELECT
        N'CICLO_FICTICIO_ATRIBUICOES_JA_PRONTO' AS resultado,
        (SELECT COUNT(*)
         FROM dbo.ciclo_avaliacao AS ciclo
         INNER JOIN dbo.ciclo_questionario AS ciclo_questionario
             ON ciclo_questionario.ciclo_avaliacao_id = ciclo.ciclo_avaliacao_id
         WHERE ciclo.situacao = 'RASCUNHO') AS opcoes_atribuicao_elegiveis,
        (SELECT COUNT(*) FROM dbo.colaborador WHERE ativo = 1) AS colaboradores_ativos;
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @ator_usuario_id uniqueidentifier = (
        SELECT TOP (1) usuario_id
        FROM dbo.usuario
        WHERE administrador_supremo = 1
          AND situacao = 'ATIVO'
          AND excluido_logicamente = 0
        ORDER BY criado_em_utc, usuario_id
    );
    DECLARE @versao_questionario_id uniqueidentifier = (
        SELECT versao.versao_questionario_id
        FROM dbo.questionario AS questionario
        INNER JOIN dbo.versao_questionario AS versao
            ON versao.questionario_id = questionario.questionario_id
        WHERE questionario.codigo = N'OPERACIONAL'
          AND versao.aprovado_em_utc IS NOT NULL
    );
    DECLARE @configuracao_calculo_versao_id uniqueidentifier = (
        SELECT configuracao_calculo_versao_id
        FROM dbo.configuracao_calculo_versao
        WHERE codigo = N'MEDIA_SIMPLES_2024_1'
          AND numero_versao = 1
          AND aprovado_em_utc IS NOT NULL
    );
    DECLARE @matriz_classificacao_versao_id uniqueidentifier = (
        SELECT matriz_classificacao_versao_id
        FROM dbo.matriz_classificacao_versao
        WHERE codigo = N'GERAL'
          AND numero_versao = 1
          AND configuracao_calculo_versao_id = @configuracao_calculo_versao_id
          AND aprovado_em_utc IS NOT NULL
    );

    IF @ator_usuario_id IS NULL
        THROW 51253, N'É necessário um administrador supremo ativo no ambiente DEV.', 1;

    IF @versao_questionario_id IS NULL
        THROW 51254, N'A versão aprovada do questionário OPERACIONAL não foi encontrada no ambiente DEV.', 1;

    IF @configuracao_calculo_versao_id IS NULL OR @matriz_classificacao_versao_id IS NULL
        THROW 51255, N'A configuração de cálculo ou matriz aprovada 2024.1 não foi encontrada no ambiente DEV.', 1;

    DECLARE @ciclo_avaliacao_id uniqueidentifier = NEWID();

    INSERT INTO dbo.ciclo_avaliacao (
        ciclo_avaliacao_id,
        codigo,
        nome,
        situacao,
        janela_abertura_em_utc,
        janela_encerramento_em_utc,
        fuso_horario_iana,
        autoavaliacao_habilitada
    )
    VALUES (
        @ciclo_avaliacao_id,
        N'DEV-ATRIBUICOES-RASCUNHO-2026',
        N'Ciclo fictício DEV — atribuições em rascunho',
        'RASCUNHO',
        '2026-01-01T03:00:00.000',
        '2026-12-31T02:59:59.000',
        N'America/Sao_Paulo',
        0
    );

    INSERT INTO dbo.transicao_ciclo_avaliacao (
        ciclo_avaliacao_id,
        situacao_origem,
        situacao_destino,
        ator_usuario_id,
        motivo_reduzido,
        request_id
    )
    VALUES (
        @ciclo_avaliacao_id,
        NULL,
        'RASCUNHO',
        @ator_usuario_id,
        N'Criação de massa fictícia para testar atribuições administrativas.',
        'DEV-ATRIBUICOES-2026'
    );

    INSERT INTO dbo.ciclo_questionario (
        ciclo_avaliacao_id,
        versao_questionario_id,
        criado_por_usuario_id,
        configuracao_calculo_versao_id,
        matriz_classificacao_versao_id
    )
    VALUES (
        @ciclo_avaliacao_id,
        @versao_questionario_id,
        @ator_usuario_id,
        @configuracao_calculo_versao_id,
        @matriz_classificacao_versao_id
    );

    INSERT INTO dbo.evento_auditoria (
        ator_usuario_id,
        acao,
        tipo_recurso,
        recurso_id,
        resultado,
        request_id,
        detalhe_reduzido
    )
    VALUES (
        @ator_usuario_id,
        'DADOS_TESTE.POPULAR_CICLO_RASCUNHO',
        'CICLO_AVALIACAO',
        @ciclo_avaliacao_id,
        'SUCESSO',
        'DEV-ATRIBUICOES-2026',
        N'Ciclo e questionário aprovados, estritamente fictícios, criados para testar atribuições no DEV.'
    );

    COMMIT TRANSACTION;

    SELECT
        N'CICLO_FICTICIO_ATRIBUICOES_CRIADO' AS resultado,
        (SELECT COUNT(*)
         FROM dbo.ciclo_avaliacao AS ciclo
         INNER JOIN dbo.ciclo_questionario AS ciclo_questionario
             ON ciclo_questionario.ciclo_avaliacao_id = ciclo.ciclo_avaliacao_id
         WHERE ciclo.situacao = 'RASCUNHO') AS opcoes_atribuicao_elegiveis,
        (SELECT COUNT(*) FROM dbo.colaborador WHERE ativo = 1) AS colaboradores_ativos;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

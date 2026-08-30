/*
 * Cenário efêmero e exclusivamente fictício para o teste autenticado do fluxo
 * de feedback. Execute somente pelo script de teste automatizado em AVALIACAO_DEV.
 * As variáveis são validadas antes de serem usadas; nenhuma senha é gravada aqui.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_NAME() <> N'AVALIACAO_DEV'
    THROW 51280, N'O cenário automatizado de feedback só pode ser criado em AVALIACAO_DEV.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.schema_migrations
    WHERE (version = N'V0012' AND script_name = N'V0012__feedback_integrado_e_vinculo_diretoria_gerencia')
       OR (version = N'V0013' AND script_name = N'V0013__restringir_acesso_avaliacoes_administrador_plataforma')
) <> 2
    THROW 51281, N'O cenário automatizado exige as migrations V0012 e V0013 aplicadas.', 1;

DECLARE @sufixo varchar(32) = '$(ADC_E2E_RUN_ID)';
DECLARE @senha_hash varchar(255) = '$(ADC_E2E_BCRYPT_HASH)';

IF @sufixo IS NULL OR LEN(@sufixo) <> 16 OR @sufixo LIKE '%[^A-F0-9]%'
    THROW 51282, N'Identificador de execução do cenário inválido.', 1;

IF @senha_hash IS NULL
   OR LEN(@senha_hash) <> 60
   OR @senha_hash NOT LIKE '$2[aby]$12$%'
    THROW 51283, N'O hash BCrypt efêmero é obrigatório e deve usar custo 12.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.usuario
    WHERE login_normalizado IN (
        N'qa.feedback.rh.' + @sufixo,
        N'qa.feedback.gestor.' + @sufixo,
        N'qa.feedback.diretoria.' + @sufixo,
        N'qa.feedback.tecnico.' + @sufixo
    )
)
    THROW 51284, N'O identificador de execução já foi utilizado no DEV.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @papel_rh_id uniqueidentifier = (
        SELECT papel_id FROM dbo.papel WHERE codigo = N'GERENCIA_RH' AND ativo = 1
    );
    DECLARE @papel_gestor_id uniqueidentifier = (
        SELECT papel_id FROM dbo.papel WHERE codigo = N'GESTOR' AND ativo = 1
    );
    DECLARE @papel_diretoria_id uniqueidentifier = (
        SELECT papel_id FROM dbo.papel WHERE codigo = N'DIRETORIA' AND ativo = 1
    );
    DECLARE @papel_tecnico_id uniqueidentifier = (
        SELECT papel_id FROM dbo.papel WHERE codigo = N'ADMINISTRADOR_PLATAFORMA' AND ativo = 1
    );

    IF @papel_rh_id IS NULL OR @papel_gestor_id IS NULL
       OR @papel_diretoria_id IS NULL OR @papel_tecnico_id IS NULL
        THROW 51285, N'Os perfis necessários para o cenário não estão ativos.', 1;

    DECLARE @contas TABLE (
        codigo varchar(16) NOT NULL PRIMARY KEY,
        usuario_id uniqueidentifier NOT NULL,
        login_normalizado nvarchar(128) NOT NULL,
        papel_id uniqueidentifier NOT NULL
    );

    INSERT INTO @contas (codigo, usuario_id, login_normalizado, papel_id)
    VALUES
        ('RH', NEWID(), N'qa.feedback.rh.' + @sufixo, @papel_rh_id),
        ('GESTOR', NEWID(), N'qa.feedback.gestor.' + @sufixo, @papel_gestor_id),
        ('DIRETORIA', NEWID(), N'qa.feedback.diretoria.' + @sufixo, @papel_diretoria_id),
        ('TECNICO', NEWID(), N'qa.feedback.tecnico.' + @sufixo, @papel_tecnico_id);

    INSERT INTO dbo.usuario (
        usuario_id, login_normalizado, nome_exibicao, situacao,
        administrador_supremo, protegido_fluxo_normal, excluido_logicamente
    )
    SELECT
        usuario_id,
        login_normalizado,
        N'Conta QA feedback ' + codigo + N' ' + @sufixo,
        'ATIVO', 0, 0, 0
    FROM @contas;

    INSERT INTO dbo.credencial_local (
        usuario_id, senha_hash, algoritmo, parametros, senha_deve_ser_trocada
    )
    SELECT usuario_id, @senha_hash, 'BCRYPT', 'strength=12', 0
    FROM @contas;

    INSERT INTO dbo.atribuicao_papel (usuario_id, papel_id, concedido_por_usuario_id)
    SELECT usuario_id, papel_id, usuario_id
    FROM @contas;

    DECLARE @rh_usuario_id uniqueidentifier = (
        SELECT usuario_id FROM @contas WHERE codigo = 'RH'
    );
    DECLARE @gestor_usuario_id uniqueidentifier = (
        SELECT usuario_id FROM @contas WHERE codigo = 'GESTOR'
    );
    DECLARE @diretoria_usuario_id uniqueidentifier = (
        SELECT usuario_id FROM @contas WHERE codigo = 'DIRETORIA'
    );

    DECLARE @colaboradores TABLE (
        codigo varchar(24) NOT NULL PRIMARY KEY,
        colaborador_id uniqueidentifier NOT NULL
    );

    INSERT INTO @colaboradores (codigo, colaborador_id)
    VALUES
        ('AVALIADO_GESTOR', NEWID()),
        ('AVALIADO_GESTOR_02', NEWID()),
        ('AVALIADO_GESTOR_03', NEWID()),
        ('AVALIADO_GESTOR_04', NEWID()),
        ('AVALIADO_GESTOR_05', NEWID()),
        ('GERENCIA_AVALIADA', NEWID()),
        ('GESTOR_AUTO', NEWID()),
        ('DIRETORIA_AUTO', NEWID());

    INSERT INTO dbo.colaborador (colaborador_id, nome_exibicao, ativo)
    SELECT
        colaborador_id,
        N'Pessoa QA feedback ' + codigo + N' ' + @sufixo,
        1
    FROM @colaboradores;

    DECLARE @avaliado_gestor_id uniqueidentifier = (
        SELECT colaborador_id FROM @colaboradores WHERE codigo = 'AVALIADO_GESTOR'
    );
    DECLARE @gerencia_avaliada_id uniqueidentifier = (
        SELECT colaborador_id FROM @colaboradores WHERE codigo = 'GERENCIA_AVALIADA'
    );
    DECLARE @gestor_auto_id uniqueidentifier = (
        SELECT colaborador_id FROM @colaboradores WHERE codigo = 'GESTOR_AUTO'
    );
    DECLARE @diretoria_auto_id uniqueidentifier = (
        SELECT colaborador_id FROM @colaboradores WHERE codigo = 'DIRETORIA_AUTO'
    );

    DECLARE @filial_restrita_id uniqueidentifier = NEWID();

    INSERT INTO dbo.filial (filial_id, nome, ativa)
    VALUES (@filial_restrita_id, N'Filial QA privacidade ' + @sufixo, 1);

    INSERT INTO dbo.lotacao_colaborador (
        lotacao_colaborador_id, colaborador_id, filial_id, inicio_vigencia, criado_por_usuario_id
    )
    VALUES (
        NEWID(), @avaliado_gestor_id, @filial_restrita_id, '2026-01-01', @rh_usuario_id
    );

    INSERT INTO dbo.vinculo_gestor_colaborador (
        vinculo_gestor_colaborador_id, gestor_usuario_id, colaborador_id,
        inicio_vigencia, criado_por_usuario_id
    )
    SELECT NEWID(), @gestor_usuario_id, colaborador_id, '2026-01-01', @rh_usuario_id
    FROM @colaboradores
    WHERE codigo LIKE 'AVALIADO_GESTOR%';

    INSERT INTO dbo.vinculo_diretoria_gerencia (
        vinculo_diretoria_gerencia_id, diretoria_usuario_id, gerencia_colaborador_id,
        inicio_vigencia, criado_por_usuario_id
    ) VALUES (
        NEWID(), @diretoria_usuario_id, @gerencia_avaliada_id, '2026-01-01', @rh_usuario_id
    );

    INSERT INTO dbo.vinculo_usuario_colaborador (
        vinculo_usuario_colaborador_id, usuario_id, colaborador_id,
        inicio_vigencia, criado_por_usuario_id
    ) VALUES
        (NEWID(), @gestor_usuario_id, @gestor_auto_id, '2026-01-01', @rh_usuario_id),
        (NEWID(), @diretoria_usuario_id, @diretoria_auto_id, '2026-01-01', @rh_usuario_id);

    DECLARE @configuracao_calculo_id uniqueidentifier = (
        SELECT configuracao_calculo_versao_id
        FROM dbo.configuracao_calculo_versao
        WHERE codigo = N'MEDIA_SIMPLES_2024_1' AND numero_versao = 1
    );
    DECLARE @matriz_classificacao_id uniqueidentifier = (
        SELECT matriz_classificacao_versao_id
        FROM dbo.matriz_classificacao_versao
        WHERE codigo = N'GERAL'
          AND numero_versao = 1
          AND configuracao_calculo_versao_id = @configuracao_calculo_id
    );
    DECLARE @versao_questionario_id uniqueidentifier = (
        SELECT versao.versao_questionario_id
        FROM dbo.versao_questionario AS versao
        JOIN dbo.questionario AS questionario ON questionario.questionario_id = versao.questionario_id
        WHERE questionario.codigo = N'OPERACIONAL'
          AND versao.numero_versao = 1
          AND versao.aprovado_em_utc IS NOT NULL
    );

    IF @configuracao_calculo_id IS NULL OR @matriz_classificacao_id IS NULL
       OR @versao_questionario_id IS NULL
        THROW 51286, N'A configuração de cálculo, matriz ou questionário de teste não está disponível.', 1;

    DECLARE @ciclo_id uniqueidentifier = NEWID();
    DECLARE @ciclo_questionario_id uniqueidentifier = NEWID();

    INSERT INTO dbo.ciclo_avaliacao (
        ciclo_avaliacao_id, codigo, nome, situacao,
        janela_abertura_em_utc, janela_encerramento_em_utc, fuso_horario_iana,
        autoavaliacao_habilitada
    ) VALUES (
        @ciclo_id,
        N'QA-FEEDBACK-' + @sufixo,
        N'Ciclo QA feedback ' + @sufixo,
        'RASCUNHO',
        '2026-01-01T03:00:00.000',
        '2026-12-31T02:59:59.000',
        N'America/Sao_Paulo',
        1
    );

    INSERT INTO dbo.ciclo_questionario (
        ciclo_questionario_id, ciclo_avaliacao_id, versao_questionario_id,
        configuracao_calculo_versao_id, matriz_classificacao_versao_id, criado_por_usuario_id
    ) VALUES (
        @ciclo_questionario_id, @ciclo_id, @versao_questionario_id,
        @configuracao_calculo_id, @matriz_classificacao_id, @rh_usuario_id
    );

    INSERT INTO dbo.atribuicao_questionario_colaborador (
        atribuicao_questionario_colaborador_id, ciclo_avaliacao_id, colaborador_id,
        ciclo_questionario_id, atribuido_por_usuario_id
    )
    SELECT NEWID(), @ciclo_id, colaborador_id, @ciclo_questionario_id, @rh_usuario_id
    FROM @colaboradores;

    UPDATE dbo.ciclo_avaliacao
    SET situacao = 'ABERTO',
        aberto_por_usuario_id = @rh_usuario_id,
        aberto_em_utc = SYSUTCDATETIME()
    WHERE ciclo_avaliacao_id = @ciclo_id;

    INSERT INTO dbo.transicao_ciclo_avaliacao (
        ciclo_avaliacao_id,
        situacao_origem, situacao_destino, ator_usuario_id, motivo_reduzido, request_id
    ) VALUES (
        @ciclo_id, 'RASCUNHO', 'ABERTO', @rh_usuario_id,
        N'Cenário automatizado de feedback.', N'E2E-FEEDBACK-' + @sufixo
    );

    INSERT INTO dbo.evento_auditoria (
        ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
    ) VALUES (
        @rh_usuario_id,
        'DADOS_TESTE.PREPARAR_CENARIO_FEEDBACK',
        'CICLO_AVALIACAO',
        @ciclo_id,
        'SUCESSO',
        'E2E-FEEDBACK-' + @sufixo,
        N'Cenário fictício e isolado para teste autenticado do fluxo de feedback.'
    );

    COMMIT TRANSACTION;

    SELECT
        @ciclo_id AS ciclo_id,
        @avaliado_gestor_id AS colaborador_gestor_id,
        @gerencia_avaliada_id AS gerencia_diretoria_id,
        @gestor_auto_id AS colaborador_auto_gestor_id,
        @diretoria_auto_id AS colaborador_auto_diretoria_id;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

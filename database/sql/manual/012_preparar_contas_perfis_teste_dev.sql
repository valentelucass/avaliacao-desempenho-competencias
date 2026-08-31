/*
 * Contas persistentes, inteiramente fictícias, para demonstração manual dos
 * quatro perfis de negócio em desenvolvimento. Este arquivo só é chamado por
 * scripts/provisionar-contas-teste-dev.ps1 e recusa qualquer banco que não
 * seja AVALIACAO_DEV. As senhas chegam somente como hashes BCrypt em variáveis
 * sqlcmd; nenhum segredo é versionado neste script.
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
    THROW 51290, N'As contas fictícias de perfis só podem ser preparadas em AVALIACAO_DEV.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.schema_migrations
    WHERE (version = N'V0012' AND script_name = N'V0012__feedback_integrado_e_vinculo_diretoria_gerencia')
       OR (version = N'V0013' AND script_name = N'V0013__restringir_acesso_avaliacoes_administrador_plataforma')
) <> 2
    THROW 51291, N'As contas fictícias exigem as migrations V0012 e V0013 aplicadas.', 1;

DECLARE @senha_rh_hash varchar(255) = '$(ADC_TEST_RH_BCRYPT_HASH)';
DECLARE @senha_gestor_hash varchar(255) = '$(ADC_TEST_GESTOR_BCRYPT_HASH)';
DECLARE @senha_diretoria_hash varchar(255) = '$(ADC_TEST_DIRETORIA_BCRYPT_HASH)';
DECLARE @senha_colaborador_hash varchar(255) = '$(ADC_TEST_COLABORADOR_BCRYPT_HASH)';

IF EXISTS (
    SELECT 1
    FROM (VALUES (@senha_rh_hash), (@senha_gestor_hash), (@senha_diretoria_hash), (@senha_colaborador_hash)) AS senha(senha_hash)
    WHERE senha_hash IS NULL
       OR LEN(senha_hash) <> 60
       OR senha_hash NOT LIKE '$2[aby]$12$%'
)
    THROW 51292, N'Cada conta fictícia exige hash BCrypt de custo 12.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.usuario
    WHERE login_normalizado IN (
        N'teste.rh@avaliacao.test',
        N'teste.gestor@avaliacao.test',
        N'teste.diretoria@avaliacao.test',
        N'teste.colaborador@avaliacao.test'
    )
)
    THROW 51293, N'Uma ou mais contas fictícias já existem; nenhuma conta foi alterada.', 1;

IF EXISTS (SELECT 1 FROM dbo.ciclo_avaliacao WHERE codigo = N'TESTE-PERFIS-DEV')
    THROW 51294, N'O ciclo fictício TESTE-PERFIS-DEV já existe; nenhum dado foi alterado.', 1;

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
    DECLARE @papel_colaborador_id uniqueidentifier = (
        SELECT papel_id FROM dbo.papel WHERE codigo = N'COLABORADOR' AND ativo = 1
    );

    IF @papel_rh_id IS NULL OR @papel_gestor_id IS NULL
       OR @papel_diretoria_id IS NULL OR @papel_colaborador_id IS NULL
        THROW 51295, N'Os quatro perfis de negócio necessários não estão ativos.', 1;

    DECLARE @contas TABLE (
        codigo varchar(16) NOT NULL PRIMARY KEY,
        usuario_id uniqueidentifier NOT NULL,
        login_normalizado nvarchar(128) NOT NULL,
        papel_id uniqueidentifier NOT NULL,
        senha_hash varchar(255) NOT NULL
    );

    INSERT INTO @contas (codigo, usuario_id, login_normalizado, papel_id, senha_hash)
    VALUES
        ('RH', NEWID(), N'teste.rh@avaliacao.test', @papel_rh_id, @senha_rh_hash),
        ('GESTOR', NEWID(), N'teste.gestor@avaliacao.test', @papel_gestor_id, @senha_gestor_hash),
        ('DIRETORIA', NEWID(), N'teste.diretoria@avaliacao.test', @papel_diretoria_id, @senha_diretoria_hash),
        ('COLABORADOR', NEWID(), N'teste.colaborador@avaliacao.test', @papel_colaborador_id, @senha_colaborador_hash);

    INSERT INTO dbo.usuario (
        usuario_id, login_normalizado, nome_exibicao, situacao,
        administrador_supremo, protegido_fluxo_normal, excluido_logicamente
    )
    SELECT
        usuario_id,
        login_normalizado,
        N'Conta de teste DEV — ' + codigo,
        'ATIVO', 0, 0, 0
    FROM @contas;

    INSERT INTO dbo.credencial_local (
        usuario_id, senha_hash, algoritmo, parametros, senha_deve_ser_trocada
    )
    SELECT usuario_id, senha_hash, 'BCRYPT', 'strength=12', 0
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
    DECLARE @colaborador_usuario_id uniqueidentifier = (
        SELECT usuario_id FROM @contas WHERE codigo = 'COLABORADOR'
    );

    DECLARE @colaboradores TABLE (
        codigo varchar(32) NOT NULL PRIMARY KEY,
        colaborador_id uniqueidentifier NOT NULL
    );

    INSERT INTO @colaboradores (codigo, colaborador_id)
    VALUES
        ('EQUIPE_GESTOR_01', NEWID()),
        ('EQUIPE_GESTOR_02', NEWID()),
        ('EQUIPE_GESTOR_03', NEWID()),
        ('EQUIPE_GESTOR_04', NEWID()),
        ('EQUIPE_GESTOR_05', NEWID()),
        ('GERENCIA_DIRETORIA', NEWID()),
        ('AUTO_GESTOR', NEWID()),
        ('AUTO_DIRETORIA', NEWID()),
        ('AUTO_COLABORADOR', NEWID());

    INSERT INTO dbo.colaborador (colaborador_id, nome_exibicao, ativo)
    SELECT colaborador_id, N'Pessoa de teste DEV — ' + codigo, 1
    FROM @colaboradores;

    INSERT INTO dbo.vinculo_gestor_colaborador (
        vinculo_gestor_colaborador_id, gestor_usuario_id, colaborador_id,
        inicio_vigencia, criado_por_usuario_id
    )
    SELECT NEWID(), @gestor_usuario_id, colaborador_id, '2026-01-01', @rh_usuario_id
    FROM @colaboradores
    WHERE codigo LIKE 'EQUIPE_GESTOR_%';

    INSERT INTO dbo.vinculo_diretoria_gerencia (
        vinculo_diretoria_gerencia_id, diretoria_usuario_id, gerencia_colaborador_id,
        inicio_vigencia, criado_por_usuario_id
    ) VALUES (
        NEWID(), @diretoria_usuario_id,
        (SELECT colaborador_id FROM @colaboradores WHERE codigo = 'GERENCIA_DIRETORIA'),
        '2026-01-01', @rh_usuario_id
    );

    INSERT INTO dbo.vinculo_usuario_colaborador (
        vinculo_usuario_colaborador_id, usuario_id, colaborador_id,
        inicio_vigencia, criado_por_usuario_id
    ) VALUES
        (NEWID(), @gestor_usuario_id,
            (SELECT colaborador_id FROM @colaboradores WHERE codigo = 'AUTO_GESTOR'),
            '2026-01-01', @rh_usuario_id),
        (NEWID(), @diretoria_usuario_id,
            (SELECT colaborador_id FROM @colaboradores WHERE codigo = 'AUTO_DIRETORIA'),
            '2026-01-01', @rh_usuario_id),
        (NEWID(), @colaborador_usuario_id,
            (SELECT colaborador_id FROM @colaboradores WHERE codigo = 'AUTO_COLABORADOR'),
            '2026-01-01', @rh_usuario_id);

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
        THROW 51296, N'A configuração de cálculo, matriz ou questionário de teste não está disponível.', 1;

    DECLARE @ciclo_id uniqueidentifier = NEWID();
    DECLARE @ciclo_questionario_id uniqueidentifier = NEWID();

    INSERT INTO dbo.ciclo_avaliacao (
        ciclo_avaliacao_id, codigo, nome, situacao,
        janela_abertura_em_utc, janela_encerramento_em_utc, fuso_horario_iana,
        autoavaliacao_habilitada
    ) VALUES (
        @ciclo_id,
        N'TESTE-PERFIS-DEV',
        N'Ciclo de teste de perfis DEV',
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
        N'Cenário fictício para demonstração dos perfis.', N'TESTE-PERFIS-DEV-2026'
    );

    INSERT INTO dbo.evento_auditoria (
        ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
    ) VALUES (
        @rh_usuario_id,
        'DADOS_TESTE.PREPARAR_CONTAS_PERFIS',
        'CICLO_AVALIACAO',
        @ciclo_id,
        'SUCESSO',
        'TESTE-PERFIS-DEV-2026',
        N'Contas e vínculos fictícios preparados exclusivamente para teste manual em DEV.'
    );

    COMMIT TRANSACTION;

    SELECT
        N'CONTAS_TESTE_DEV_CRIADAS' AS resultado,
        (SELECT COUNT(*) FROM @contas) AS quantidade_contas,
        (SELECT COUNT(*) FROM @colaboradores) AS quantidade_colaboradores;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

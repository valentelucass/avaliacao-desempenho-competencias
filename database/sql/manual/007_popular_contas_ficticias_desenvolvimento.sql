/*
 * Contas exclusivamente ficticias para demonstrar a tela de Contas locais.
 * Execute somente de forma explicita, fora do runner de migrations e no banco
 * AVALIACAO_DEV. O hash BCrypt e informado em tempo de execucao por sqlcmd;
 * nenhuma senha ou hash e mantido neste arquivo.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'AVALIACAO_DEV'
    THROW 51230, N'As contas ficticias so podem ser criadas em AVALIACAO_DEV.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0010'
      AND script_name = N'V0010__catalogo_inicial_rodogarcia_2024_1'
)
    THROW 51231, N'As contas ficticias exigem o catalogo V0010 aplicado.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.usuario
    WHERE login_normalizado = N'dev.demo.conta.admin'
)
BEGIN
    SELECT N'CONTAS_DEV_JA_EXISTEM' AS resultado;
    RETURN;
END;

DECLARE @senha_hash varchar(255) = '$(ADC_DEV_BCRYPT_HASH)';

IF @senha_hash IS NULL
   OR LEN(@senha_hash) <> 60
   OR @senha_hash NOT LIKE '$2[aby]$12$%'
    THROW 51232, N'O hash BCrypt de execucao e obrigatorio e deve usar custo 12.', 1;

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

    IF @ator_usuario_id IS NULL
        THROW 51233, N'As contas ficticias exigem um administrador supremo ativo no ambiente DEV.', 1;

    DECLARE @papel_administrador_id uniqueidentifier = (
        SELECT papel_id
        FROM dbo.papel
        WHERE codigo = N'ADMINISTRADOR_PLATAFORMA'
          AND ativo = 1
    );
    DECLARE @papel_colaborador_id uniqueidentifier = (
        SELECT papel_id
        FROM dbo.papel
        WHERE codigo = N'COLABORADOR'
          AND ativo = 1
    );

    IF @papel_administrador_id IS NULL OR @papel_colaborador_id IS NULL
        THROW 51234, N'Os papeis necessarios nao estao ativos no catalogo DEV.', 1;

    DECLARE @contas TABLE (
        codigo varchar(32) NOT NULL PRIMARY KEY,
        login_normalizado nvarchar(128) NOT NULL UNIQUE,
        nome_exibicao nvarchar(200) NOT NULL,
        situacao varchar(16) NOT NULL,
        papel_id uniqueidentifier NOT NULL,
        usuario_id uniqueidentifier NULL
    );

    INSERT INTO @contas (codigo, login_normalizado, nome_exibicao, situacao, papel_id)
    VALUES
        ('ADMIN', N'dev.demo.conta.admin', N'Conta ficticia DEV - administracao', 'ATIVO', @papel_administrador_id),
        ('GESTOR', N'dev.demo.conta.gestor', N'Conta ficticia DEV - gestor', 'ATIVO', @papel_colaborador_id),
        ('COLAB', N'dev.demo.conta.colaborador', N'Conta ficticia DEV - colaborador', 'ATIVO', @papel_colaborador_id),
        ('RH', N'dev.demo.conta.rh', N'Conta ficticia DEV - RH', 'ATIVO', @papel_administrador_id),
        ('BLOQ', N'dev.demo.conta.bloqueada', N'Conta ficticia DEV - bloqueada', 'BLOQUEADO', @papel_colaborador_id),
        ('INAT', N'dev.demo.conta.desativada', N'Conta ficticia DEV - desativada', 'DESATIVADO', @papel_colaborador_id);

    INSERT INTO dbo.usuario (
        login_normalizado,
        nome_exibicao,
        situacao,
        administrador_supremo,
        protegido_fluxo_normal,
        excluido_logicamente
    )
    SELECT
        conta.login_normalizado,
        conta.nome_exibicao,
        conta.situacao,
        0,
        0,
        0
    FROM @contas AS conta;

    UPDATE conta
    SET usuario_id = usuario.usuario_id
    FROM @contas AS conta
    JOIN dbo.usuario AS usuario ON usuario.login_normalizado = conta.login_normalizado;

    IF EXISTS (SELECT 1 FROM @contas WHERE usuario_id IS NULL)
        THROW 51235, N'Nao foi possivel identificar todas as contas ficticias criadas.', 1;

    INSERT INTO dbo.credencial_local (
        usuario_id,
        senha_hash,
        algoritmo,
        parametros,
        senha_deve_ser_trocada
    )
    SELECT
        conta.usuario_id,
        @senha_hash,
        'BCRYPT',
        'strength=12',
        1
    FROM @contas AS conta;

    INSERT INTO dbo.atribuicao_papel (usuario_id, papel_id, concedido_por_usuario_id)
    SELECT conta.usuario_id, conta.papel_id, @ator_usuario_id
    FROM @contas AS conta;

    INSERT INTO dbo.evento_auditoria (
        ator_usuario_id,
        acao,
        tipo_recurso,
        recurso_id,
        resultado,
        detalhe_reduzido
    )
    VALUES (
        @ator_usuario_id,
        'DADOS_TESTE.POPULAR_CONTAS',
        'USUARIO',
        @ator_usuario_id,
        'SUCESSO',
        N'Seis contas locais exclusivamente ficticias foram criadas em AVALIACAO_DEV.'
    );

    COMMIT TRANSACTION;

    SELECT N'CONTAS_DEV_CRIADAS' AS resultado, COUNT(*) AS total_contas
    FROM @contas;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;

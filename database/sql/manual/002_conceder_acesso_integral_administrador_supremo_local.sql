/*
  Uso manual, excepcional e exclusivo do banco local de desenvolvimento.

  Concede à única conta ativa, protegida e administradora suprema os papéis
  COLABORADOR, GESTOR e GERENCIA_RH, preservando ADMINISTRADOR_PLATAFORMA.
  Não cria colaborador, vínculo, ciclo, questionário, avaliação ou dado real.

  O script falha se houver mais de uma conta-alvo ou qualquer dado de negócio,
  revoga as sessões da conta-alvo e registra a concessão na auditoria.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;

IF DB_NAME() <> N'AVALIACAO_DEV'
    THROW 51060, N'Este procedimento só pode ser executado no banco local autorizado.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    IF (SELECT COUNT(*)
        FROM dbo.usuario
        WHERE administrador_supremo = 1
          AND protegido_fluxo_normal = 1
          AND situacao = 'ATIVO') <> 1
        THROW 51061, N'É exigida exatamente uma conta suprema protegida e ativa.', 1;

    IF EXISTS (SELECT 1 FROM dbo.colaborador)
       OR EXISTS (SELECT 1 FROM dbo.ciclo_avaliacao)
       OR EXISTS (SELECT 1 FROM dbo.avaliacao)
        THROW 51062, N'O acesso excepcional só é permitido no ambiente local sem dados de negócio.', 1;

    DECLARE @usuario_id uniqueidentifier = (
        SELECT usuario_id
        FROM dbo.usuario
        WHERE administrador_supremo = 1
          AND protegido_fluxo_normal = 1
          AND situacao = 'ATIVO'
    );

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.atribuicao_papel AS atribuicao
        INNER JOIN dbo.papel AS papel
            ON papel.papel_id = atribuicao.papel_id
        WHERE atribuicao.usuario_id = @usuario_id
          AND atribuicao.revogado_em_utc IS NULL
          AND papel.codigo = N'ADMINISTRADOR_PLATAFORMA'
          AND papel.ativo = 1
    )
        THROW 51063, N'A conta-alvo não possui o papel técnico de administrador de plataforma ativo.', 1;

    DECLARE @papeis_requeridos TABLE (
        codigo nvarchar(100) NOT NULL PRIMARY KEY
    );

    INSERT INTO @papeis_requeridos (codigo)
    VALUES
        (N'COLABORADOR'),
        (N'GESTOR'),
        (N'GERENCIA_RH');

    IF EXISTS (
        SELECT 1
        FROM @papeis_requeridos AS requerido
        LEFT JOIN dbo.papel AS papel
            ON papel.codigo = requerido.codigo
           AND papel.ativo = 1
        WHERE papel.papel_id IS NULL
    )
        THROW 51064, N'O catálogo de papéis de negócio necessário não está ativo.', 1;

    INSERT INTO dbo.atribuicao_papel (
        usuario_id,
        papel_id,
        concedido_por_usuario_id
    )
    SELECT
        @usuario_id,
        papel.papel_id,
        @usuario_id
    FROM @papeis_requeridos AS requerido
    INNER JOIN dbo.papel AS papel
        ON papel.codigo = requerido.codigo
       AND papel.ativo = 1
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.atribuicao_papel AS existente
        WHERE existente.usuario_id = @usuario_id
          AND existente.papel_id = papel.papel_id
          AND existente.revogado_em_utc IS NULL
    );

    DECLARE @papeis_concedidos int = @@ROWCOUNT;

    UPDATE dbo.sessao_autenticacao
    SET revogada_em_utc = SYSUTCDATETIME(),
        motivo_revogacao = 'ALTERACAO_ACESSO_LOCAL'
    WHERE usuario_id = @usuario_id
      AND revogada_em_utc IS NULL;

    INSERT INTO dbo.evento_auditoria (
        ator_usuario_id,
        acao,
        tipo_recurso,
        recurso_id,
        resultado,
        detalhe_reduzido
    )
    VALUES (
        @usuario_id,
        'ACESSO_LOCAL_INTEGRAL_CONCEDIDO',
        'USUARIO',
        @usuario_id,
        'SUCESSO',
        CONCAT(N'Concessão excepcional local de ', @papeis_concedidos, N' papel(is) de negócio para testes.')
    );

    COMMIT TRANSACTION;

    SELECT
        N'DEVELOPMENT_FULL_ACCESS_GRANTED' AS resultado,
        @papeis_concedidos AS papeis_novos;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;

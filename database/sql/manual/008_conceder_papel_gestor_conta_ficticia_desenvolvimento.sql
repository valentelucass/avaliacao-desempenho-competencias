/*
 * Restaura a conta fictícia de gestor para testar vínculos administrativos.
 * Execute explicitamente e somente em AVALIACAO_DEV. O script não cria dados
 * reais, é transacional e pode ser reexecutado sem duplicar a atribuição.
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
    THROW 51240, N'A atribuição fictícia de gestor só pode ser feita em AVALIACAO_DEV.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0011'
      AND script_name = N'V0011__restringir_autoridade_administrador_plataforma'
)
    THROW 51241, N'A atribuição fictícia exige a migração V0011 aplicada.', 1;

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
    DECLARE @gestor_usuario_id uniqueidentifier = (
        SELECT usuario_id
        FROM dbo.usuario
        WHERE login_normalizado = N'dev.demo.conta.gestor'
          AND situacao = 'ATIVO'
          AND excluido_logicamente = 0
    );
    DECLARE @papel_gestor_id uniqueidentifier = (
        SELECT papel_id
        FROM dbo.papel
        WHERE codigo = N'GESTOR'
          AND ativo = 1
    );

    IF @ator_usuario_id IS NULL
        THROW 51242, N'É necessário um administrador supremo ativo no ambiente DEV.', 1;

    IF @gestor_usuario_id IS NULL
        THROW 51243, N'A conta fictícia dev.demo.conta.gestor ativa não foi encontrada no ambiente DEV.', 1;

    IF @papel_gestor_id IS NULL
        THROW 51244, N'O papel GESTOR ativo não foi encontrado no ambiente DEV.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.atribuicao_papel
        WHERE usuario_id = @gestor_usuario_id
          AND papel_id = @papel_gestor_id
          AND revogado_em_utc IS NULL
    )
    BEGIN
        INSERT INTO dbo.atribuicao_papel (
            usuario_id,
            papel_id,
            concedido_por_usuario_id
        )
        VALUES (
            @gestor_usuario_id,
            @papel_gestor_id,
            @ator_usuario_id
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
            'DADOS_TESTE.CONCEDER_PAPEL_GESTOR',
            'USUARIO',
            @gestor_usuario_id,
            'SUCESSO',
            'DEV-VINCULOS-2026',
            N'Papel GESTOR concedido exclusivamente à conta fictícia de desenvolvimento para testar vínculos.'
        );
    END;

    COMMIT TRANSACTION;

    SELECT
        N'CONTA_FICTICIA_GESTOR_PRONTA' AS resultado,
        (SELECT COUNT(*)
         FROM dbo.usuario AS usuario
         INNER JOIN dbo.atribuicao_papel AS atribuicao
             ON atribuicao.usuario_id = usuario.usuario_id
         INNER JOIN dbo.papel AS papel ON papel.papel_id = atribuicao.papel_id
         WHERE usuario.situacao = 'ATIVO'
           AND atribuicao.revogado_em_utc IS NULL
           AND papel.codigo = 'GESTOR'
           AND papel.ativo = 1) AS gestores_elegiveis,
        (SELECT COUNT(*) FROM dbo.colaborador WHERE ativo = 1) AS colaboradores_ativos,
        (SELECT COUNT(*) FROM dbo.usuario WHERE situacao = 'ATIVO') AS usuarios_ativos;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

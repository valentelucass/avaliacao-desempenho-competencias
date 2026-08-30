SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0012'
      AND script_name = N'V0012__feedback_integrado_e_vinculo_diretoria_gerencia'
)
BEGIN
    SELECT
        N'V0012_PENDENTE' AS estado_feedback_integrado,
        (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas;
    RETURN;
END;

IF OBJECT_ID(N'dbo.vinculo_diretoria_gerencia', N'U') IS NULL
    THROW 51270, N'Vinculo Diretoria-Gerencia ausente apos V0012.', 1;

IF OBJECT_ID(N'dbo.feedback_avaliacao', N'U') IS NULL
    THROW 51271, N'Registro de feedback por versao ausente apos V0012.', 1;

IF COL_LENGTH(N'dbo.avaliacao', N'vinculo_diretoria_gerencia_id') IS NULL
    THROW 51272, N'Relacao Diretoria-Gerencia ausente na avaliacao.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.avaliacao')
      AND name = N'CK_avaliacao_tipo_2026_feedback'
)
    THROW 51273, N'Tipos de avaliacao da V0012 nao estao protegidos.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.feedback_avaliacao')
      AND name = N'CK_feedback_avaliacao_conclusao'
)
    THROW 51274, N'Conclusao de feedback nao esta protegida por restricao.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.avaliacao')
      AND name = N'FK_avaliacao_vinculo_diretoria_gerencia'
)
    THROW 51275, N'Integridade entre avaliacao e vinculo Diretoria-Gerencia ausente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.vinculo_diretoria_gerencia')
      AND name = N'UX_vinculo_diretoria_gerencia_gerencia_ativo'
      AND is_unique = 1
      AND has_filter = 1
)
    THROW 51276, N'Exclusividade do vinculo ativo da Gerencia ausente.', 1;

DECLARE @concessoes_esperadas TABLE (
    papel_codigo nvarchar(100) NOT NULL,
    permissao_codigo nvarchar(150) NOT NULL,
    PRIMARY KEY (papel_codigo, permissao_codigo)
);

INSERT INTO @concessoes_esperadas (papel_codigo, permissao_codigo)
VALUES
    (N'GESTOR', N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'),
    (N'DIRETORIA', N'AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS'),
    (N'DIRETORIA', N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'),
    (N'GERENCIA_RH', N'VINCULOS_DIRETORIA_GERENCIA.GERIR'),
    (N'ADMINISTRADOR_PLATAFORMA', N'VINCULOS_DIRETORIA_GERENCIA.GERIR');

IF EXISTS (
    SELECT 1
    FROM @concessoes_esperadas AS esperada
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.papel_permissao AS concessao
        JOIN dbo.papel AS papel ON papel.papel_id = concessao.papel_id
        JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
        WHERE papel.codigo = esperada.papel_codigo
          AND permissao.codigo = esperada.permissao_codigo
          AND concessao.revogado_em_utc IS NULL
    )
)
    THROW 51277, N'Catalogo ativo de permissoes da V0012 esta incompleto.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.papel_permissao AS concessao
    JOIN dbo.papel AS papel ON papel.papel_id = concessao.papel_id
    JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
    WHERE papel.codigo = N'COLABORADOR'
      AND permissao.codigo IN (
          N'AUTOAVALIACOES.PREENCHER_PROPRIA',
          N'AUTOAVALIACOES.ENVIAR_PROPRIA',
          N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'
      )
      AND concessao.revogado_em_utc IS NULL
)
    THROW 51278, N'Perfil colaborador legado ainda possui acesso a autoavaliacao.', 1;

PRINT N'Feedback integrado e vinculo Diretoria-Gerencia validados.';

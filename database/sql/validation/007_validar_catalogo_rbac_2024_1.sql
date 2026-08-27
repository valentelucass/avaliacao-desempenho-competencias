SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0006'
      AND script_name = N'V0006__catalogo_rbac_2024_1_autoavaliacao_e_administracao'
)
BEGIN
    SELECT
        N'V0006_PENDENTE' AS estado_catalogo_rbac_2024_1,
        (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas;
    RETURN;
END;

DECLARE @papeis TABLE (codigo nvarchar(100) NOT NULL PRIMARY KEY);

INSERT INTO @papeis (codigo)
VALUES
    (N'COLABORADOR');

DECLARE @permissoes TABLE (codigo nvarchar(150) NOT NULL PRIMARY KEY);

INSERT INTO @permissoes (codigo)
VALUES
    (N'AUTOAVALIACOES.PREENCHER_PROPRIA'),
    (N'AUTOAVALIACOES.ENVIAR_PROPRIA'),
    (N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'),
    (N'CADASTROS.GERIR'),
    (N'ACESSOS.NEGOCIO.GERIR'),
    (N'CICLOS.GERIR'),
    (N'QUESTIONARIOS.GERIR'),
    (N'VINCULOS_GESTOR_COLABORADOR.GERIR'),
    (N'VINCULOS_USUARIO_COLABORADOR.GERIR');

DECLARE @concessoes TABLE (
    papel_codigo nvarchar(100) NOT NULL,
    permissao_codigo nvarchar(150) NOT NULL,
    PRIMARY KEY (papel_codigo, permissao_codigo)
);

INSERT INTO @concessoes (papel_codigo, permissao_codigo)
VALUES
    (N'COLABORADOR', N'AUTOAVALIACOES.PREENCHER_PROPRIA'),
    (N'COLABORADOR', N'AUTOAVALIACOES.ENVIAR_PROPRIA'),
    (N'COLABORADOR', N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'),
    (N'ADMINISTRADOR_PLATAFORMA', N'CADASTROS.GERIR'),
    (N'ADMINISTRADOR_PLATAFORMA', N'VINCULOS_GESTOR_COLABORADOR.GERIR'),
    (N'ADMINISTRADOR_PLATAFORMA', N'VINCULOS_USUARIO_COLABORADOR.GERIR'),
    (N'GERENCIA_RH', N'ACESSOS.NEGOCIO.GERIR'),
    (N'GERENCIA_RH', N'CICLOS.GERIR'),
    (N'GERENCIA_RH', N'QUESTIONARIOS.GERIR'),
    (N'DIRETORIA', N'ACESSOS.NEGOCIO.GERIR'),
    (N'DIRETORIA', N'CICLOS.GERIR');

IF EXISTS (
    SELECT 1
    FROM @papeis AS esperado
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.papel AS existente
        WHERE existente.codigo = esperado.codigo
          AND existente.ativo = 1
    )
)
    THROW 51103, N'Papel RBAC 2024.1 ausente ou inativo.', 1;

IF EXISTS (
    SELECT 1
    FROM @permissoes AS esperada
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.permissao AS existente
        WHERE existente.codigo = esperada.codigo
          AND existente.ativo = 1
    )
)
    THROW 51104, N'Permissao RBAC 2024.1 ausente ou inativa.', 1;

IF EXISTS (
    SELECT 1
    FROM @concessoes AS esperada
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.papel_permissao AS existente
        JOIN dbo.papel AS papel ON papel.papel_id = existente.papel_id
        JOIN dbo.permissao AS permissao ON permissao.permissao_id = existente.permissao_id
        WHERE papel.codigo = esperada.papel_codigo
          AND permissao.codigo = esperada.permissao_codigo
          AND existente.revogado_em_utc IS NULL
    )
)
    THROW 51105, N'Concessao RBAC 2024.1 ausente ou revogada.', 1;

SELECT
    (SELECT COUNT(*) FROM dbo.papel WHERE codigo IN (SELECT codigo FROM @papeis))
        AS papeis_rbac_2024_1,
    (SELECT COUNT(*) FROM dbo.permissao WHERE codigo IN (SELECT codigo FROM @permissoes))
        AS permissoes_rbac_2024_1,
    (SELECT COUNT(*) FROM @concessoes) AS concessoes_rbac_2024_1;

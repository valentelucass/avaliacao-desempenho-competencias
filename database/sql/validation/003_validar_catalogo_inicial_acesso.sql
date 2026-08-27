SET NOCOUNT ON;

DECLARE @papeis TABLE (codigo nvarchar(100) NOT NULL PRIMARY KEY);

INSERT INTO @papeis (codigo)
VALUES
    (N'ADMINISTRADOR_PLATAFORMA'),
    (N'GESTOR'),
    (N'GERENCIA_RH'),
    (N'DIRETORIA');

DECLARE @permissoes TABLE (codigo nvarchar(150) NOT NULL PRIMARY KEY);

INSERT INTO @permissoes (codigo)
VALUES
    (N'USUARIOS.LER'),
    (N'USUARIOS.CRIAR'),
    (N'USUARIOS.ALTERAR'),
    (N'ACESSOS.GERIR'),
    (N'AVALIACOES.AVALIAR_VINCULADOS'),
    (N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'),
    (N'AVALIACOES.VISUALIZAR_TODAS'),
    (N'AVALIACOES.PUBLICAR'),
    (N'AVALIACOES.REABRIR'),
    (N'INDICADORES.VISUALIZAR'),
    (N'DADOS.EXPORTAR');

DECLARE @concessoes TABLE (
    papel_codigo nvarchar(100) NOT NULL,
    permissao_codigo nvarchar(150) NOT NULL,
    PRIMARY KEY (papel_codigo, permissao_codigo)
);

INSERT INTO @concessoes (papel_codigo, permissao_codigo)
VALUES
    (N'ADMINISTRADOR_PLATAFORMA', N'USUARIOS.LER'),
    (N'ADMINISTRADOR_PLATAFORMA', N'USUARIOS.CRIAR'),
    (N'ADMINISTRADOR_PLATAFORMA', N'USUARIOS.ALTERAR'),
    (N'ADMINISTRADOR_PLATAFORMA', N'ACESSOS.GERIR'),
    (N'GESTOR', N'AVALIACOES.AVALIAR_VINCULADOS'),
    (N'GESTOR', N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'),
    (N'GERENCIA_RH', N'AVALIACOES.VISUALIZAR_TODAS'),
    (N'GERENCIA_RH', N'AVALIACOES.PUBLICAR'),
    (N'GERENCIA_RH', N'AVALIACOES.REABRIR'),
    (N'GERENCIA_RH', N'INDICADORES.VISUALIZAR'),
    (N'GERENCIA_RH', N'DADOS.EXPORTAR'),
    (N'DIRETORIA', N'AVALIACOES.VISUALIZAR_TODAS'),
    (N'DIRETORIA', N'AVALIACOES.PUBLICAR'),
    (N'DIRETORIA', N'AVALIACOES.REABRIR'),
    (N'DIRETORIA', N'INDICADORES.VISUALIZAR'),
    (N'DIRETORIA', N'DADOS.EXPORTAR');

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0002'
      AND script_name = N'V0002__catalogo_inicial_de_papeis_e_permissoes'
)
    THROW 51053, N'Migration do catalogo inicial de acesso ausente.', 1;

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
    THROW 51054, N'Papel inicial ausente ou inativo.', 1;

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
    THROW 51055, N'Permissao inicial ausente ou inativa.', 1;

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
    THROW 51056, N'Concessao inicial de papel ausente.', 1;

SELECT
    (SELECT COUNT(*) FROM dbo.papel WHERE codigo IN (SELECT codigo FROM @papeis))
        AS papeis_iniciais,
    (SELECT COUNT(*) FROM dbo.permissao WHERE codigo IN (SELECT codigo FROM @permissoes))
        AS permissoes_iniciais,
    (SELECT COUNT(*) FROM @concessoes) AS concessoes_iniciais;

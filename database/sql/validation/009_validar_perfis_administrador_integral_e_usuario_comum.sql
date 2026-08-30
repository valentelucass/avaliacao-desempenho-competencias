SET NOCOUNT ON;

DECLARE @v0011_aplicada bit = CASE WHEN EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0011'
      AND script_name = N'V0011__restringir_autoridade_administrador_plataforma'
) THEN 1 ELSE 0 END;

DECLARE @v0012_aplicada bit = CASE WHEN EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0012'
      AND script_name = N'V0012__feedback_integrado_e_vinculo_diretoria_gerencia'
) THEN 1 ELSE 0 END;

DECLARE @v0013_aplicada bit = CASE WHEN EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0013'
      AND script_name = N'V0013__restringir_acesso_avaliacoes_administrador_plataforma'
) THEN 1 ELSE 0 END;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0009'
      AND script_name = N'V0009__perfis_administrador_integral_e_usuario_comum'
)
BEGIN
    SELECT
        N'V0009_PENDENTE' AS estado_perfis_de_acesso,
        (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas;
    RETURN;
END;

DECLARE @permissoes_administrador TABLE (
    codigo nvarchar(150) NOT NULL PRIMARY KEY
);

INSERT INTO @permissoes_administrador (codigo)
VALUES
    (N'USUARIOS.LER'),
    (N'USUARIOS.CRIAR'),
    (N'USUARIOS.ALTERAR'),
    (N'ACESSOS.GERIR'),
    (N'ACESSOS.NEGOCIO.GERIR'),
    (N'CADASTROS.GERIR'),
    (N'CICLOS.GERIR'),
    (N'QUESTIONARIOS.GERIR'),
    (N'VINCULOS_GESTOR_COLABORADOR.GERIR'),
    (N'VINCULOS_USUARIO_COLABORADOR.GERIR');

IF @v0013_aplicada = 0
    INSERT INTO @permissoes_administrador (codigo)
    VALUES
        (N'AVALIACOES.AVALIAR_VINCULADOS'),
        (N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'),
        (N'AVALIACOES.VISUALIZAR_TODAS'),
        (N'AUTOAVALIACOES.PREENCHER_PROPRIA'),
        (N'AUTOAVALIACOES.ENVIAR_PROPRIA'),
        (N'AUTOAVALIACOES.VISUALIZAR_PROPRIA');

IF @v0011_aplicada = 0
    INSERT INTO @permissoes_administrador (codigo)
    VALUES
        (N'AVALIACOES.PUBLICAR'),
        (N'AVALIACOES.REABRIR'),
        (N'INDICADORES.VISUALIZAR'),
        (N'DADOS.EXPORTAR');

IF @v0012_aplicada = 1
    INSERT INTO @permissoes_administrador (codigo)
    VALUES (N'VINCULOS_DIRETORIA_GERENCIA.GERIR');

DECLARE @papel_administrador_id uniqueidentifier = (
    SELECT papel_id
    FROM dbo.papel
    WHERE codigo = N'ADMINISTRADOR_PLATAFORMA'
);

IF @papel_administrador_id IS NULL
    THROW 51127, N'Papel administrador integral ausente.', 1;

IF EXISTS (
    SELECT 1
    FROM @permissoes_administrador AS esperada
    LEFT JOIN dbo.permissao AS permissao
        ON permissao.codigo = esperada.codigo
    LEFT JOIN dbo.papel_permissao AS concessao
        ON concessao.permissao_id = permissao.permissao_id
       AND concessao.papel_id = @papel_administrador_id
       AND concessao.revogado_em_utc IS NULL
    WHERE concessao.papel_id IS NULL
)
    THROW 51128, N'Administrador sem uma permissao obrigatoria do perfil integral.', 1;

IF (SELECT COUNT(*)
    FROM dbo.papel_permissao
    WHERE papel_id = @papel_administrador_id
      AND revogado_em_utc IS NULL) <> (SELECT COUNT(*) FROM @permissoes_administrador)
    THROW 51129, N'Administrador possui concessao fora do catalogo integral aprovado.', 1;

SELECT
    @v0011_aplicada AS v0011_aplicada,
    @v0012_aplicada AS v0012_aplicada,
    @v0013_aplicada AS v0013_aplicada,
    (SELECT COUNT(*) FROM @permissoes_administrador) AS permissoes_administrador_ativas_esperadas,
    (SELECT COUNT(*)
     FROM dbo.papel_permissao
     WHERE papel_id = @papel_administrador_id
       AND revogado_em_utc IS NULL) AS permissoes_administrador_ativas;

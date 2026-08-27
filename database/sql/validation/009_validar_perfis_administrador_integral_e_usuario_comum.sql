SET NOCOUNT ON;

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
    (N'AVALIACOES.AVALIAR_VINCULADOS'),
    (N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'),
    (N'AVALIACOES.VISUALIZAR_TODAS'),
    (N'AVALIACOES.PUBLICAR'),
    (N'AVALIACOES.REABRIR'),
    (N'INDICADORES.VISUALIZAR'),
    (N'DADOS.EXPORTAR'),
    (N'AUTOAVALIACOES.PREENCHER_PROPRIA'),
    (N'AUTOAVALIACOES.ENVIAR_PROPRIA'),
    (N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'),
    (N'CADASTROS.GERIR'),
    (N'CICLOS.GERIR'),
    (N'QUESTIONARIOS.GERIR'),
    (N'VINCULOS_GESTOR_COLABORADOR.GERIR'),
    (N'VINCULOS_USUARIO_COLABORADOR.GERIR');

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
    WHERE concessao.papel_id IS NULL
)
    THROW 51128, N'Administrador sem uma permissao obrigatoria do perfil integral.', 1;

IF (SELECT COUNT(*)
    FROM dbo.papel_permissao
    WHERE papel_id = @papel_administrador_id) <> (SELECT COUNT(*) FROM @permissoes_administrador)
    THROW 51129, N'Administrador possui concessao fora do catalogo integral aprovado.', 1;

SELECT
    (SELECT COUNT(*) FROM @permissoes_administrador) AS permissoes_administrador_integral,
    (SELECT COUNT(*)
     FROM dbo.papel_permissao
     WHERE papel_id = @papel_administrador_id) AS permissoes_administrador_aplicadas;

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0013'
      AND script_name = N'V0013__restringir_acesso_avaliacoes_administrador_plataforma'
)
BEGIN
    SELECT
        N'V0013_PENDENTE' AS estado_restricao_avaliacoes_administrador,
        (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas;
    RETURN;
END;

DECLARE @permissoes_restritas TABLE (
    codigo nvarchar(150) NOT NULL PRIMARY KEY
);

INSERT INTO @permissoes_restritas (codigo)
VALUES
    (N'AVALIACOES.AVALIAR_VINCULADOS'),
    (N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'),
    (N'AVALIACOES.VISUALIZAR_TODAS'),
    (N'AUTOAVALIACOES.PREENCHER_PROPRIA'),
    (N'AUTOAVALIACOES.ENVIAR_PROPRIA'),
    (N'AUTOAVALIACOES.VISUALIZAR_PROPRIA');

IF EXISTS (
    SELECT 1
    FROM dbo.papel_permissao AS concessao
    JOIN dbo.papel AS papel ON papel.papel_id = concessao.papel_id
    JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
    JOIN @permissoes_restritas AS restrita ON restrita.codigo = permissao.codigo
    WHERE papel.codigo = N'ADMINISTRADOR_PLATAFORMA'
      AND concessao.revogado_em_utc IS NULL
)
    THROW 51290, N'Administrador tecnico ainda possui acesso ao dominio de avaliacoes.', 1;

DECLARE @permissoes_tecnicas_esperadas TABLE (
    codigo nvarchar(150) NOT NULL PRIMARY KEY
);

INSERT INTO @permissoes_tecnicas_esperadas (codigo)
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
    (N'VINCULOS_USUARIO_COLABORADOR.GERIR'),
    (N'VINCULOS_DIRETORIA_GERENCIA.GERIR');

DECLARE @papel_administrador_id uniqueidentifier = (
    SELECT papel_id
    FROM dbo.papel
    WHERE codigo = N'ADMINISTRADOR_PLATAFORMA'
);

IF @papel_administrador_id IS NULL
    THROW 51291, N'Papel administrador tecnico ausente.', 1;

IF (SELECT COUNT(*)
    FROM dbo.papel_permissao
    WHERE papel_id = @papel_administrador_id
      AND revogado_em_utc IS NULL) <> (SELECT COUNT(*) FROM @permissoes_tecnicas_esperadas)
    THROW 51292, N'Administrador tecnico possui permissao fora do catalogo aprovado.', 1;

PRINT N'Restricao de acesso a avaliacoes do administrador tecnico validada.';

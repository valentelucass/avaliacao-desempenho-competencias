/*
 * Consolida o perfil ADMINISTRADOR_PLATAFORMA como acesso integral do produto.
 * A lista e explicita para que uma permissao futura nunca seja concedida sem uma
 * decisao e migration especificas.
 */
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

IF EXISTS (
    SELECT 1
    FROM @permissoes_administrador AS esperada
    LEFT JOIN dbo.permissao AS permissao
        ON permissao.codigo = esperada.codigo
    WHERE permissao.permissao_id IS NULL
)
    THROW 51125, N'Catalogo de permissoes esperado para o administrador esta incompleto.', 1;

DECLARE @papel_administrador_id uniqueidentifier = (
    SELECT papel_id
    FROM dbo.papel
    WHERE codigo = N'ADMINISTRADOR_PLATAFORMA'
);

IF @papel_administrador_id IS NULL
    THROW 51126, N'Papel administrador da plataforma ausente.', 1;

INSERT INTO dbo.papel_permissao (papel_id, permissao_id)
SELECT @papel_administrador_id, permissao.permissao_id
FROM @permissoes_administrador AS esperada
JOIN dbo.permissao AS permissao
    ON permissao.codigo = esperada.codigo
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.papel_permissao AS existente
    WHERE existente.papel_id = @papel_administrador_id
      AND existente.permissao_id = permissao.permissao_id
);

UPDATE dbo.papel
SET descricao = N'Administrador integral do produto, com acesso a todos os modulos e operacoes autorizadas.'
WHERE papel_id = @papel_administrador_id;

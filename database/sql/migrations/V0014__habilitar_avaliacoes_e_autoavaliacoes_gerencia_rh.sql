/*
 * A Gerencia de RH pode atuar tambem como avaliadora quando possuir os mesmos
 * vinculos ativos exigidos de um gestor. A concessao nao substitui a validacao
 * por recurso: o servidor continua exigindo vinculo, ciclo e questionario.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @ator_usuario_id uniqueidentifier = (
    SELECT TOP (1) usuario_id
    FROM dbo.usuario
    WHERE administrador_supremo = 1
      AND situacao = 'ATIVO'
      AND excluido_logicamente = 0
    ORDER BY criado_em_utc, usuario_id
);

IF @ator_usuario_id IS NULL
    THROW 51180, N'A habilitacao de avaliacoes da Gerencia de RH exige administrador supremo ativo.', 1;

DECLARE @papel_rh_id uniqueidentifier = (
    SELECT papel_id
    FROM dbo.papel
    WHERE codigo = N'GERENCIA_RH'
      AND ativo = 1
);

IF @papel_rh_id IS NULL
    THROW 51181, N'Papel Gerencia de RH ausente ou inativo.', 1;

DECLARE @permissoes TABLE (
    codigo nvarchar(150) NOT NULL PRIMARY KEY
);

INSERT INTO @permissoes (codigo)
VALUES
    (N'AVALIACOES.AVALIAR_VINCULADOS'),
    (N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'),
    (N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'),
    (N'AUTOAVALIACOES.PREENCHER_PROPRIA'),
    (N'AUTOAVALIACOES.ENVIAR_PROPRIA'),
    (N'AUTOAVALIACOES.VISUALIZAR_PROPRIA');

IF EXISTS (
    SELECT 1
    FROM @permissoes AS esperada
    LEFT JOIN dbo.permissao AS permissao ON permissao.codigo = esperada.codigo
    WHERE permissao.permissao_id IS NULL
       OR permissao.ativo = 0
)
    THROW 51182, N'Catalogo de permissoes para avaliacao da Gerencia de RH esta incompleto.', 1;

INSERT INTO dbo.papel_permissao (papel_id, permissao_id, concedido_por_usuario_id)
SELECT @papel_rh_id, permissao.permissao_id, @ator_usuario_id
FROM @permissoes AS esperada
JOIN dbo.permissao AS permissao ON permissao.codigo = esperada.codigo
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.papel_permissao AS existente
    WHERE existente.papel_id = @papel_rh_id
      AND existente.permissao_id = permissao.permissao_id
      AND existente.revogado_em_utc IS NULL
);

INSERT INTO dbo.evento_auditoria (
    ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
)
VALUES (
    @ator_usuario_id,
    'MIGRACAO.HABILITAR_AVALIACOES_GERENCIA_RH',
    'PAPEL',
    @papel_rh_id,
    'SUCESSO',
    'MIGRACAO-V0014',
    N'Gerencia de RH pode avaliar somente colaboradores vinculados e realizar a propria autoavaliacao.'
);

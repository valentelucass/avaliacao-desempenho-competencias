/*
 * Separa definitivamente a administracao tecnica da visualizacao e da execucao
 * de avaliacoes. A V0011 ja havia reservado decisao, indicadores e exportacao;
 * esta revisao remove os acessos restantes ao dominio de avaliacao.
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
    THROW 51170, N'A segregacao de avaliacoes exige administrador supremo ativo.', 1;

DECLARE @papel_administrador_id uniqueidentifier = (
    SELECT papel_id
    FROM dbo.papel
    WHERE codigo = N'ADMINISTRADOR_PLATAFORMA'
);

IF @papel_administrador_id IS NULL
    THROW 51171, N'Papel administrador da plataforma ausente.', 1;

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
    FROM @permissoes_restritas AS restrita
    LEFT JOIN dbo.permissao AS permissao ON permissao.codigo = restrita.codigo
    WHERE permissao.permissao_id IS NULL
)
    THROW 51172, N'Catalogo de permissoes de avaliacao esta incompleto.', 1;

UPDATE concessao
SET revogado_por_usuario_id = @ator_usuario_id,
    revogado_em_utc = SYSUTCDATETIME()
FROM dbo.papel_permissao AS concessao
JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
JOIN @permissoes_restritas AS restrita ON restrita.codigo = permissao.codigo
WHERE concessao.papel_id = @papel_administrador_id
  AND concessao.revogado_em_utc IS NULL;

UPDATE dbo.papel
SET descricao = N'Administrador tecnico da plataforma, sem autoridade para consultar, executar ou decidir avaliacoes e autoavaliacoes.'
WHERE papel_id = @papel_administrador_id;

INSERT INTO dbo.evento_auditoria (
    ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
)
VALUES (
    @ator_usuario_id,
    'MIGRACAO.RESTRINGIR_AVALIACOES_ADMINISTRADOR',
    'PAPEL',
    @papel_administrador_id,
    'SUCESSO',
    'MIGRACAO-V0013',
    N'Permissoes de avaliacao e autoavaliacao removidas do administrador tecnico.'
);

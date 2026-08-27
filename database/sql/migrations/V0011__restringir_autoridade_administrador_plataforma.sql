/*
 * Mantem a administracao tecnica separada das decisoes de RH/Diretoria.
 * A revogacao preserva o historico em papel_permissao e usa o administrador
 * supremo exigido pela V0010 como ator auditavel da migracao.
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
    THROW 51150, N'A restricao de autoridade exige um administrador supremo ativo.', 1;

DECLARE @papel_administrador_id uniqueidentifier = (
    SELECT papel_id
    FROM dbo.papel
    WHERE codigo = N'ADMINISTRADOR_PLATAFORMA'
);

IF @papel_administrador_id IS NULL
    THROW 51151, N'Papel administrador da plataforma ausente.', 1;

DECLARE @permissoes_restritas TABLE (
    codigo nvarchar(150) NOT NULL PRIMARY KEY
);

INSERT INTO @permissoes_restritas (codigo)
VALUES
    (N'AVALIACOES.PUBLICAR'),
    (N'AVALIACOES.REABRIR'),
    (N'INDICADORES.VISUALIZAR'),
    (N'DADOS.EXPORTAR');

IF EXISTS (
    SELECT 1
    FROM @permissoes_restritas AS esperada
    LEFT JOIN dbo.permissao AS permissao
      ON permissao.codigo = esperada.codigo
    WHERE permissao.permissao_id IS NULL
)
    THROW 51152, N'Catalogo de permissoes esperado para restricao administrativa esta incompleto.', 1;

UPDATE papel_permissao
SET revogado_por_usuario_id = @ator_usuario_id,
    revogado_em_utc = SYSUTCDATETIME()
FROM dbo.papel_permissao AS papel_permissao
JOIN dbo.permissao AS permissao
  ON permissao.permissao_id = papel_permissao.permissao_id
JOIN @permissoes_restritas AS restrita
  ON restrita.codigo = permissao.codigo
WHERE papel_permissao.papel_id = @papel_administrador_id
  AND papel_permissao.revogado_em_utc IS NULL;

DECLARE @papeis_negocio TABLE (
    codigo nvarchar(100) NOT NULL PRIMARY KEY
);

INSERT INTO @papeis_negocio (codigo)
VALUES
    (N'GESTOR'),
    (N'GERENCIA_RH'),
    (N'DIRETORIA'),
    (N'COLABORADOR');

UPDATE atribuicao
SET revogado_por_usuario_id = @ator_usuario_id,
    revogado_em_utc = SYSUTCDATETIME()
FROM dbo.atribuicao_papel AS atribuicao
JOIN dbo.papel AS papel_atribuido
  ON papel_atribuido.papel_id = atribuicao.papel_id
JOIN @papeis_negocio AS negocio
  ON negocio.codigo = papel_atribuido.codigo
WHERE atribuicao.revogado_em_utc IS NULL
  AND EXISTS (
      SELECT 1
      FROM dbo.atribuicao_papel AS atribuicao_administrador
      WHERE atribuicao_administrador.usuario_id = atribuicao.usuario_id
        AND atribuicao_administrador.papel_id = @papel_administrador_id
        AND atribuicao_administrador.revogado_em_utc IS NULL
  );

UPDATE dbo.papel
SET descricao = N'Administrador tecnico da plataforma, sem autoridade para publicar, reabrir, consultar indicadores ou exportar resultados.'
WHERE papel_id = @papel_administrador_id;

INSERT INTO dbo.evento_auditoria (
    ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
)
VALUES (
    @ator_usuario_id,
    'ACESSO.PAPEL.RESTRINGIR_AUTORIDADE',
    'PAPEL',
    @papel_administrador_id,
    'SUCESSO',
    'MIGRACAO-V0011',
    N'Permissoes de decisao e perfis de negocio foram reservados a RH e Diretoria.'
);

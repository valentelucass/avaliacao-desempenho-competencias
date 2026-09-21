/*
 * Capacidades de senha concedidas somente por conta. Nenhum perfil recebe essas
 * permissões por herança: o administrador supremo decide cada delegação.
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
    THROW 51190, N'O catálogo de delegação de senha exige administrador supremo ativo.', 1;

DECLARE @permissoes TABLE (
    codigo nvarchar(150) NOT NULL PRIMARY KEY,
    descricao nvarchar(300) NOT NULL
);

INSERT INTO @permissoes (codigo, descricao)
VALUES
    (N'SENHAS.REDEFINIR', N'Redefine senha temporária de contas elegíveis, mediante delegação individual auditada.'),
    (N'SENHAS.DELEGAR_REDEFINICAO', N'Concede ou revoga individualmente a capacidade de redefinir senhas; não concede nova delegação.');

IF EXISTS (
    SELECT 1
    FROM @permissoes AS esperada
    JOIN dbo.permissao AS existente ON existente.codigo = esperada.codigo
    WHERE existente.ativo = 0
)
    THROW 51191, N'Permissão de delegação de senha existe, mas está inativa.', 1;

INSERT INTO dbo.permissao (codigo, descricao)
SELECT esperada.codigo, esperada.descricao
FROM @permissoes AS esperada
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.permissao AS existente
    WHERE existente.codigo = esperada.codigo
);

INSERT INTO dbo.evento_auditoria (
    ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
)
VALUES (
    @ator_usuario_id,
    'MIGRACAO.CATALOGO_DELEGACAO_SENHA',
    'CATALOGO_PERMISSAO',
    NULL,
    'SUCESSO',
    'MIGRACAO-V0015',
    N'Capacidades individuais para redefinir e delegar redefinição de senha, sem concessão por perfil.'
);

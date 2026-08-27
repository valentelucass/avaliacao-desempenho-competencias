DECLARE @papeis TABLE (
    codigo nvarchar(100) NOT NULL PRIMARY KEY,
    descricao nvarchar(300) NOT NULL
);

INSERT INTO @papeis (codigo, descricao)
VALUES
    (N'COLABORADOR', N'Preenche e consulta somente a propria autoavaliacao vinculada a sua conta ativa.');

INSERT INTO dbo.papel (codigo, descricao)
SELECT catalogo.codigo, catalogo.descricao
FROM @papeis AS catalogo
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.papel AS existente
    WHERE existente.codigo = catalogo.codigo
);

DECLARE @permissoes TABLE (
    codigo nvarchar(150) NOT NULL PRIMARY KEY,
    descricao nvarchar(300) NOT NULL
);

INSERT INTO @permissoes (codigo, descricao)
VALUES
    (N'AUTOAVALIACOES.PREENCHER_PROPRIA', N'Cria, edita e salva rascunhos somente da propria autoavaliacao.'),
    (N'AUTOAVALIACOES.ENVIAR_PROPRIA', N'Envia somente a propria autoavaliacao dentro da janela autorizada do ciclo.'),
    (N'AUTOAVALIACOES.VISUALIZAR_PROPRIA', N'Consulta somente a propria autoavaliacao.'),
    (N'CADASTROS.GERIR', N'Mantem cadastros operacionais de filiais, areas, colaboradores e lotacoes mediante solicitacao registrada.'),
    (N'ACESSOS.NEGOCIO.GERIR', N'Concede ou revoga acesso de negocio por RH ou Diretoria sem permitir autoatribuicao.'),
    (N'CICLOS.GERIR', N'Cria, configura, abre e encerra ciclos de avaliacao, inclusive a habilitacao de autoavaliacao.'),
    (N'QUESTIONARIOS.GERIR', N'Cria, versiona e aprova questionarios, competencias, perguntas e opcoes de resposta.'),
    (N'VINCULOS_GESTOR_COLABORADOR.GERIR', N'Cria, encerra e consulta vinculos gestor-colaborador com vigencia e autoria.'),
    (N'VINCULOS_USUARIO_COLABORADOR.GERIR', N'Cria, encerra e consulta vinculos entre conta local e colaborador com vigencia e autoria.');

INSERT INTO dbo.permissao (codigo, descricao)
SELECT catalogo.codigo, catalogo.descricao
FROM @permissoes AS catalogo
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.permissao AS existente
    WHERE existente.codigo = catalogo.codigo
);

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

INSERT INTO dbo.papel_permissao (papel_id, permissao_id)
SELECT papel.papel_id, permissao.permissao_id
FROM @concessoes AS concessao
JOIN dbo.papel AS papel ON papel.codigo = concessao.papel_codigo
JOIN dbo.permissao AS permissao ON permissao.codigo = concessao.permissao_codigo
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.papel_permissao AS existente
    WHERE existente.papel_id = papel.papel_id
      AND existente.permissao_id = permissao.permissao_id
      AND existente.revogado_em_utc IS NULL
);

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
    THROW 51100, N'Catalogo RBAC 2024.1 sem o papel COLABORADOR ativo.', 1;

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
    THROW 51101, N'Catalogo RBAC 2024.1 com permissao ausente ou inativa.', 1;

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
    THROW 51102, N'Concessao RBAC 2024.1 ausente ou revogada.', 1;

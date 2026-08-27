DECLARE @papeis TABLE (
    codigo nvarchar(100) NOT NULL PRIMARY KEY,
    descricao nvarchar(300) NOT NULL
);

INSERT INTO @papeis (codigo, descricao)
VALUES
    (N'ADMINISTRADOR_PLATAFORMA', N'Administra usuários, papéis e permissões sem acesso de negócio automático.'),
    (N'GESTOR', N'Realiza avaliações somente no escopo de colaboradores vinculados.'),
    (N'GERENCIA_RH', N'Consulta avaliações completas, publica, reabre e consulta/exporta dados autorizados.'),
    (N'DIRETORIA', N'Consulta avaliações completas, publica, reabre e consulta/exporta dados autorizados.');

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
    (N'USUARIOS.LER', N'Consulta usuários para administração da plataforma.'),
    (N'USUARIOS.CRIAR', N'Cria usuários locais conforme fluxo de credencial aprovado.'),
    (N'USUARIOS.ALTERAR', N'Altera dados e situação de usuários conforme regras de administrador supremo.'),
    (N'ACESSOS.GERIR', N'Concede ou revoga papéis e permissões conforme regras de segregação.'),
    (N'AVALIACOES.AVALIAR_VINCULADOS', N'Cria, edita e envia avaliação de gestor dentro do vínculo autorizado.'),
    (N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS', N'Consulta somente respostas registradas pelo próprio gestor.'),
    (N'AVALIACOES.VISUALIZAR_TODAS', N'Consulta avaliações completas no escopo de RH ou Diretoria.'),
    (N'AVALIACOES.PUBLICAR', N'Publica avaliações no escopo de RH ou Diretoria.'),
    (N'AVALIACOES.REABRIR', N'Reabre avaliações no escopo de RH ou Diretoria.'),
    (N'INDICADORES.VISUALIZAR', N'Consulta indicadores sujeitos às regras de privacidade.'),
    (N'DADOS.EXPORTAR', N'Exporta dados autorizados no escopo de RH ou Diretoria.');

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
    THROW 51050, N'Catalogo inicial de papeis incompleto.', 1;

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
    THROW 51051, N'Catalogo inicial de permissoes incompleto.', 1;

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
    THROW 51052, N'Concessoes iniciais de papel incompletas.', 1;

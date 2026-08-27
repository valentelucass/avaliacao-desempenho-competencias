SET NOCOUNT ON;

DECLARE @tabelas_necessarias TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @tabelas_necessarias (nome)
VALUES
    (N'schema_migrations'),
    (N'aplicacao_metadata'),
    (N'usuario'),
    (N'credencial_local'),
    (N'papel'),
    (N'permissao'),
    (N'atribuicao_papel'),
    (N'papel_permissao'),
    (N'concessao_permissao_usuario'),
    (N'sessao_autenticacao'),
    (N'token_renovacao'),
    (N'evento_auditoria'),
    (N'chave_idempotencia');

IF EXISTS (
    SELECT 1
    FROM @tabelas_necessarias AS necessaria
    WHERE OBJECT_ID(N'dbo.' + necessaria.nome, N'U') IS NULL
)
    THROW 51020, N'Fundacao de identidade incompleta.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.usuario')
      AND name = N'UQ_usuario_login_normalizado'
)
    THROW 51021, N'Indice de login normalizado ausente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.token_renovacao')
      AND name = N'UQ_token_renovacao_hash'
)
    THROW 51022, N'Indice de token de renovacao ausente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.aplicacao_metadata
    WHERE project_code = N'avaliacao-desempenho-competencias'
)
    THROW 51023, N'Marcador de propriedade do projeto ausente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0001'
      AND script_name = N'V0001__fundacao_identidade_acesso_e_auditoria'
)
    THROW 51024, N'Migration inicial de identidade ausente do historico.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_credencial_local_usuario'
)
    THROW 51025, N'Chave estrangeira de credencial local ausente.', 1;

SELECT
    (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas,
    (SELECT COUNT(*) FROM dbo.usuario) AS usuarios_criados,
    (SELECT COUNT(*) FROM dbo.sessao_autenticacao) AS sessoes_ativas_ou_historicas;

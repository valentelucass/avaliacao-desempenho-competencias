SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0015'
      AND script_name = N'V0015__delegacao_individual_de_redefinicao_de_senha'
)
BEGIN
    SELECT
        N'V0015_PENDENTE' AS estado_delegacao_redefinicao_senha,
        (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas;
    RETURN;
END;

DECLARE @permissoes_esperadas TABLE (
    codigo nvarchar(150) NOT NULL PRIMARY KEY
);

INSERT INTO @permissoes_esperadas (codigo)
VALUES
    (N'SENHAS.REDEFINIR'),
    (N'SENHAS.DELEGAR_REDEFINICAO');

IF EXISTS (
    SELECT 1
    FROM @permissoes_esperadas AS esperada
    LEFT JOIN dbo.permissao AS permissao ON permissao.codigo = esperada.codigo
    WHERE permissao.permissao_id IS NULL
       OR permissao.ativo = 0
)
    THROW 51192, N'Catalogo de delegacao individual de senha incompleto ou inativo.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.papel_permissao AS concessao
    JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
    JOIN @permissoes_esperadas AS esperada ON esperada.codigo = permissao.codigo
    WHERE concessao.revogado_em_utc IS NULL
)
    THROW 51193, N'Delegacao de senha nao pode ser concedida por perfil.', 1;

PRINT N'Delegacao individual de redefinicao de senha validada.';

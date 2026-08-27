SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0011'
      AND script_name = N'V0011__restringir_autoridade_administrador_plataforma'
)
BEGIN
    SELECT
        N'V0011_PENDENTE' AS estado_restricao_autoridade,
        (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas;
    RETURN;
END;

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
    FROM dbo.papel_permissao AS concessao
    JOIN dbo.papel AS papel
      ON papel.papel_id = concessao.papel_id
    JOIN dbo.permissao AS permissao
      ON permissao.permissao_id = concessao.permissao_id
    JOIN @permissoes_restritas AS restrita
      ON restrita.codigo = permissao.codigo
    WHERE papel.codigo = N'ADMINISTRADOR_PLATAFORMA'
      AND concessao.revogado_em_utc IS NULL
)
    THROW 51260, N'Administrador da plataforma ainda possui permissao reservada a RH ou Diretoria.', 1;

IF EXISTS (
    SELECT 1
    FROM (VALUES (N'GERENCIA_RH'), (N'DIRETORIA')) AS papel_esperado(codigo)
    CROSS JOIN @permissoes_restritas AS permissao_esperada
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.papel_permissao AS concessao
        JOIN dbo.papel AS papel
          ON papel.papel_id = concessao.papel_id
        JOIN dbo.permissao AS permissao
          ON permissao.permissao_id = concessao.permissao_id
        WHERE papel.codigo = papel_esperado.codigo
          AND permissao.codigo = permissao_esperada.codigo
          AND concessao.revogado_em_utc IS NULL
    )
)
    THROW 51261, N'RH ou Diretoria nao possui a permissao de decisao esperada.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.atribuicao_papel AS atribuicao_negocio
    JOIN dbo.papel AS papel_negocio
      ON papel_negocio.papel_id = atribuicao_negocio.papel_id
    WHERE papel_negocio.codigo IN (N'GESTOR', N'GERENCIA_RH', N'DIRETORIA', N'COLABORADOR')
      AND atribuicao_negocio.revogado_em_utc IS NULL
      AND EXISTS (
          SELECT 1
          FROM dbo.atribuicao_papel AS atribuicao_administrador
          JOIN dbo.papel AS papel_administrador
            ON papel_administrador.papel_id = atribuicao_administrador.papel_id
          WHERE atribuicao_administrador.usuario_id = atribuicao_negocio.usuario_id
            AND papel_administrador.codigo = N'ADMINISTRADOR_PLATAFORMA'
            AND atribuicao_administrador.revogado_em_utc IS NULL
      )
)
    THROW 51262, N'Conta administradora ainda possui perfil de negocio ativo.', 1;

PRINT N'Restricao de autoridade do administrador da plataforma validada.';

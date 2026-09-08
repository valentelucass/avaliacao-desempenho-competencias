SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0014'
      AND script_name = N'V0014__habilitar_avaliacoes_e_autoavaliacoes_gerencia_rh'
)
BEGIN
    SELECT
        N'V0014_PENDENTE' AS estado_avaliacoes_gerencia_rh,
        (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas;
    RETURN;
END;

DECLARE @concessoes_esperadas TABLE (
    permissao_codigo nvarchar(150) NOT NULL PRIMARY KEY
);

INSERT INTO @concessoes_esperadas (permissao_codigo)
VALUES
    (N'AVALIACOES.AVALIAR_VINCULADOS'),
    (N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'),
    (N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'),
    (N'AUTOAVALIACOES.PREENCHER_PROPRIA'),
    (N'AUTOAVALIACOES.ENVIAR_PROPRIA'),
    (N'AUTOAVALIACOES.VISUALIZAR_PROPRIA');

IF EXISTS (
    SELECT 1
    FROM @concessoes_esperadas AS esperada
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.papel_permissao AS concessao
        JOIN dbo.papel AS papel ON papel.papel_id = concessao.papel_id
        JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
        WHERE papel.codigo = N'GERENCIA_RH'
          AND papel.ativo = 1
          AND permissao.codigo = esperada.permissao_codigo
          AND permissao.ativo = 1
          AND concessao.revogado_em_utc IS NULL
    )
)
    THROW 51294, N'Gerencia de RH sem concessao obrigatoria para avaliacao e autoavaliacao.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.papel_permissao AS concessao
    JOIN dbo.papel AS papel ON papel.papel_id = concessao.papel_id
    JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
    JOIN @concessoes_esperadas AS esperada ON esperada.permissao_codigo = permissao.codigo
    WHERE papel.codigo = N'ADMINISTRADOR_PLATAFORMA'
      AND concessao.revogado_em_utc IS NULL
)
    THROW 51295, N'Administrador tecnico recebeu permissao de avaliacao indevida.', 1;

PRINT N'Avaliacoes e autoavaliacoes da Gerencia de RH validadas.';

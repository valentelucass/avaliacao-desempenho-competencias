SET NOCOUNT ON;

DECLARE @historico_v0001 bit = CASE
    WHEN EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'V0001') THEN 1
    ELSE 0
END;

DECLARE @tabelas_fundacao int = (
    SELECT COUNT(*)
    FROM sys.tables AS tabela
    JOIN sys.schemas AS esquema ON esquema.schema_id = tabela.schema_id
    WHERE esquema.name = N'dbo'
      AND tabela.name IN (
          N'usuario', N'credencial_local', N'papel', N'permissao', N'atribuicao_papel',
          N'papel_permissao', N'concessao_permissao_usuario', N'sessao_autenticacao',
          N'token_renovacao', N'evento_auditoria', N'chave_idempotencia'
      )
);

IF @historico_v0001 = 1 AND @tabelas_fundacao = 11
    SELECT N'APLICADA';
ELSE IF @historico_v0001 = 1
    SELECT N'INCONSISTENTE';
ELSE IF @tabelas_fundacao = 0
    SELECT N'LIMPA';
ELSE
    SELECT N'PARCIAL';

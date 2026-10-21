SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (
    SELECT 1 FROM dbo.schema_migrations
    WHERE version = N'V0016'
      AND script_name = N'V0016__prorrogacao_auditada_encerramento_ciclo'
)
BEGIN
    THROW 51213, N'V0016 pendente: aplique e valide a prorrogacao antes de publicar a aplicacao.', 1;
END;

IF OBJECT_ID(N'dbo.prorrogacao_ciclo_avaliacao', N'U') IS NULL
    THROW 51213, N'Tabela de prorrogacao ausente.', 1;

IF (SELECT COUNT(*) FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.prorrogacao_ciclo_avaliacao')
      AND is_disabled = 0 AND is_not_trusted = 0) <> 2
    THROW 51213, N'Referencias da prorrogacao incompletas.', 1;

IF (SELECT COUNT(*) FROM sys.triggers
    WHERE object_id IN (
        OBJECT_ID(N'dbo.TR_prorrogacao_ciclo_aplicar'),
        OBJECT_ID(N'dbo.TR_prorrogacao_ciclo_imutavel'),
        OBJECT_ID(N'dbo.TR_ciclo_avaliacao_janela_immutavel_apos_abertura')
    ) AND is_disabled = 0) <> 3
    THROW 51213, N'Protecoes de prorrogacao ausentes ou desabilitadas.', 1;

IF (SELECT COUNT(*) FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.prorrogacao_ciclo_avaliacao')
      AND name IN (N'IX_prorrogacao_ciclo_data', N'IX_prorrogacao_ciclo_ator_data')
      AND is_disabled = 0) <> 2
    THROW 51213, N'Indices da auditoria de prorrogacao ausentes.', 1;

IF COALESCE(CHARINDEX(N'TRIGGER_NESTLEVEL', OBJECT_DEFINITION(OBJECT_ID(N'dbo.TR_ciclo_avaliacao_janela_immutavel_apos_abertura'))), 0) = 0
   OR COALESCE(CHARINDEX(N'UPDLOCK, HOLDLOCK', OBJECT_DEFINITION(OBJECT_ID(N'dbo.TR_prorrogacao_ciclo_aplicar'))), 0) = 0
   OR COALESCE(CHARINDEX(N'SYSUTCDATETIME()', OBJECT_DEFINITION(OBJECT_ID(N'dbo.TR_prorrogacao_ciclo_aplicar'))), 0) = 0
    THROW 51213, N'Protocolo transacional de prorrogacao incompleto.', 1;

SELECT N'V0016_VALIDADA' AS estado_prorrogacao_ciclo;

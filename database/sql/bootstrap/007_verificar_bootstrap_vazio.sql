SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NOT NULL
   OR OBJECT_ID(N'dbo.aplicacao_metadata', N'U') IS NOT NULL
   OR EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0)
   OR EXISTS (SELECT 1 FROM sys.extended_properties WHERE class = 0)
    SELECT N'NOT_EMPTY';
ELSE
    SELECT N'SAFE_EMPTY_BOOTSTRAP';

SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.aplicacao_metadata', N'U') IS NULL
    SELECT N'UNMARKED';
ELSE IF EXISTS (
    SELECT 1
    FROM dbo.aplicacao_metadata
    WHERE project_code = N'avaliacao-desempenho-competencias'
)
    SELECT N'OWNED';
ELSE
    SELECT N'OTHER_PROJECT';

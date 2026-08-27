SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @lock_result int;
DECLARE @lock_resource nvarchar(255) = CONCAT(DB_NAME(), N':bootstrap');

EXEC @lock_result = sys.sp_getapplock
    @Resource = @lock_resource,
    @LockMode = N'Exclusive',
    @LockOwner = N'Transaction',
    @LockTimeout = 15000;

IF @lock_result < 0
    THROW 51011, N'Nao foi possivel obter bloqueio para bootstrap.', 1;

IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.schema_migrations (
        version nvarchar(20) NOT NULL,
        script_name nvarchar(260) NOT NULL,
        checksum_sha256 char(64) NOT NULL,
        applied_at_utc datetime2(3) NOT NULL
            CONSTRAINT DF_schema_migrations_applied_at_utc DEFAULT SYSUTCDATETIME(),
        applied_by sysname NOT NULL
            CONSTRAINT DF_schema_migrations_applied_by DEFAULT SUSER_SNAME(),
        CONSTRAINT PK_schema_migrations PRIMARY KEY (version),
        CONSTRAINT UQ_schema_migrations_script_name UNIQUE (script_name),
        CONSTRAINT CK_schema_migrations_version CHECK (version LIKE N'V[0-9][0-9][0-9][0-9]'),
        CONSTRAINT CK_schema_migrations_checksum CHECK (checksum_sha256 NOT LIKE '%[^0-9a-f]%')
    );
END;

IF OBJECT_ID(N'dbo.aplicacao_metadata', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.aplicacao_metadata (
        project_code nvarchar(100) NOT NULL
            CONSTRAINT PK_aplicacao_metadata PRIMARY KEY,
        criado_em_utc datetime2(3) NOT NULL
            CONSTRAINT DF_aplicacao_metadata_criado_em_utc DEFAULT SYSUTCDATETIME(),
        criado_por sysname NOT NULL
            CONSTRAINT DF_aplicacao_metadata_criado_por DEFAULT SUSER_SNAME()
    );
END;

IF EXISTS (
    SELECT 1
    FROM dbo.aplicacao_metadata
    WHERE project_code <> N'avaliacao-desempenho-competencias'
)
    THROW 51012, N'Marcador de propriedade pertence a outro projeto.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.aplicacao_metadata
    WHERE project_code = N'avaliacao-desempenho-competencias'
)
    INSERT INTO dbo.aplicacao_metadata (project_code)
    VALUES (N'avaliacao-desempenho-competencias');

COMMIT TRANSACTION;

SET NOCOUNT ON;

DECLARE @version nvarchar(20) = N'$(MigrationVersion)';
DECLARE @checksum char(64) = '$(MigrationChecksum)';

IF EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = @version
      AND checksum_sha256 <> @checksum
)
    SELECT N'CHECKSUM_MISMATCH';
ELSE IF EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = @version
      AND checksum_sha256 = @checksum
)
    SELECT N'APPLIED';
ELSE
    SELECT N'PENDING';

SET NOCOUNT ON;

SELECT version, script_name, checksum_sha256
FROM dbo.schema_migrations
ORDER BY version;

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$MigrationPath,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ExpectedChecksum,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$OutputPath,

  [switch]$RecoverPartialV0001
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Sha256Lower([string]$Path) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $algorithm.Dispose()
  }
}

function Add-Lines([System.Collections.Generic.List[string]]$Lines, [string]$Text) {
  foreach ($line in ($Text -split "`r?`n")) {
    $Lines.Add($line)
  }
}

try {
  if ($ExpectedChecksum -notmatch '^[0-9a-f]{64}$') {
    throw 'Checksum SHA-256 esperado invalido.'
  }

  $resolvedMigrationPath = (Resolve-Path -LiteralPath $MigrationPath).Path
  $migrationName = [System.IO.Path]::GetFileNameWithoutExtension($resolvedMigrationPath)
  if ($migrationName -notmatch '^V\d{4}__[a-z0-9_]+$') {
    throw "Nome de migration invalido: $migrationName"
  }

  $migrationVersion = $migrationName.Split('__')[0]
  $actualChecksum = Get-Sha256Lower $resolvedMigrationPath
  if ($actualChecksum -ne $ExpectedChecksum) {
    throw 'O checksum da copia de migration nao corresponde ao checksum validado.'
  }

  if ($RecoverPartialV0001.IsPresent -and $migrationName -ne 'V0001__fundacao_identidade_acesso_e_auditoria') {
    throw 'A recuperacao controlada aceita somente a migration V0001 da fundacao de identidade.'
  }

  $migrationContent = [System.IO.File]::ReadAllText($resolvedMigrationPath)
  $forbiddenPatterns = @(
    '(?im)^\s*GO\s*(?:--.*)?$',
    '(?im)^\s*:(?:r|setvar|on\s+error)\b',
    '\$\(',
    '(?i)\bUSE\b',
    '(?i)\bDROP\b',
    '(?i)\bCREATE\s+DATABASE\b',
    '(?i)\bALTER\s+DATABASE\b',
    '(?i)\bCREATE\s+LOGIN\b',
    '(?i)\bALTER\s+LOGIN\b',
    '(?im)^\s*CREATE\s+(?:OR\s+ALTER\s+)?TRIGGER\b',
    '(?i)\bBEGIN\s+TRANSACTION\b',
    '(?i)\bCOMMIT(?:\s+TRANSACTION)?\b',
    '(?i)\bROLLBACK\b'
  )

  foreach ($pattern in $forbiddenPatterns) {
    if ([regex]::IsMatch($migrationContent, $pattern)) {
      throw "Conteudo de migration incompativel com o wrapper atomico: $migrationName"
    }
  }

  $resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
  $outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutputPath)
  if ([string]::IsNullOrWhiteSpace($outputDirectory) -or -not [System.IO.Directory]::Exists($outputDirectory)) {
    throw 'Diretorio temporario de saida inexistente.'
  }
  if ([System.IO.File]::Exists($resolvedOutputPath)) {
    throw 'O arquivo mestre de migration ja existe; a execucao foi interrompida.'
  }

  $lines = [System.Collections.Generic.List[string]]::new()
  Add-Lines $lines @'
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @lock_result int;
    DECLARE @lock_resource nvarchar(255) = CONCAT(DB_NAME(), N':migrations');
    DECLARE @migration_outcome nvarchar(16) = N'SKIPPED';

    EXEC @lock_result = sys.sp_getapplock
        @Resource = @lock_resource,
        @LockMode = N'Exclusive',
        @LockOwner = N'Transaction',
        @LockTimeout = 15000;

    IF @lock_result < 0
        THROW 51000, N'Nao foi possivel obter bloqueio de migration.', 1;
'@

  if ($RecoverPartialV0001.IsPresent) {
    Add-Lines $lines @'

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.aplicacao_metadata
        WHERE project_code = N'avaliacao-desempenho-competencias'
    )
        THROW 51030, N'Marcador de propriedade do projeto ausente.', 1;

    IF EXISTS (SELECT 1 FROM dbo.schema_migrations)
        THROW 51031, N'A recuperacao exige historico de migrations vazio.', 1;

    IF (SELECT COUNT(*)
        FROM sys.tables AS tabela
        JOIN sys.schemas AS esquema ON esquema.schema_id = tabela.schema_id
        WHERE esquema.name = N'dbo') <> 7
        THROW 51032, N'A recuperacao exige somente as tabelas tecnicas e o prefixo parcial conhecido.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables AS tabela
        JOIN sys.schemas AS esquema ON esquema.schema_id = tabela.schema_id
        WHERE esquema.name = N'dbo'
          AND tabela.name NOT IN (
              N'schema_migrations', N'aplicacao_metadata', N'usuario', N'credencial_local',
              N'papel', N'permissao', N'atribuicao_papel'
          )
    )
        THROW 51033, N'A recuperacao encontrou tabela nao esperada.', 1;

    IF OBJECT_ID(N'dbo.usuario', N'U') IS NULL
       OR OBJECT_ID(N'dbo.credencial_local', N'U') IS NULL
       OR OBJECT_ID(N'dbo.papel', N'U') IS NULL
       OR OBJECT_ID(N'dbo.permissao', N'U') IS NULL
       OR OBJECT_ID(N'dbo.atribuicao_papel', N'U') IS NULL
        THROW 51034, N'O prefixo parcial esperado da V0001 nao esta presente.', 1;

    IF OBJECT_ID(N'dbo.papel_permissao', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.concessao_permissao_usuario', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.sessao_autenticacao', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.token_renovacao', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.evento_auditoria', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.chave_idempotencia', N'U') IS NOT NULL
        THROW 51035, N'A recuperacao encontrou fundacao fora do prefixo parcial conhecido.', 1;

    IF EXISTS (SELECT TOP (1) 1 FROM dbo.usuario WITH (TABLOCKX, HOLDLOCK))
       OR EXISTS (SELECT TOP (1) 1 FROM dbo.credencial_local WITH (TABLOCKX, HOLDLOCK))
       OR EXISTS (SELECT TOP (1) 1 FROM dbo.papel WITH (TABLOCKX, HOLDLOCK))
       OR EXISTS (SELECT TOP (1) 1 FROM dbo.permissao WITH (TABLOCKX, HOLDLOCK))
       OR EXISTS (SELECT TOP (1) 1 FROM dbo.atribuicao_papel WITH (TABLOCKX, HOLDLOCK))
        THROW 51036, N'A recuperacao nao remove tabelas que contenham dados.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.database_permissions
        WHERE major_id IN (
            OBJECT_ID(N'dbo.usuario'), OBJECT_ID(N'dbo.credencial_local'), OBJECT_ID(N'dbo.papel'),
            OBJECT_ID(N'dbo.permissao'), OBJECT_ID(N'dbo.atribuicao_papel')
        )
    )
        THROW 51037, N'A recuperacao encontrou permissao por objeto nao esperada.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.triggers
        WHERE parent_id IN (
            OBJECT_ID(N'dbo.usuario'), OBJECT_ID(N'dbo.credencial_local'), OBJECT_ID(N'dbo.papel'),
            OBJECT_ID(N'dbo.permissao'), OBJECT_ID(N'dbo.atribuicao_papel')
        )
    )
        THROW 51038, N'A recuperacao encontrou trigger nao esperado.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.extended_properties
        WHERE class = 1
          AND major_id IN (
              OBJECT_ID(N'dbo.usuario'), OBJECT_ID(N'dbo.credencial_local'), OBJECT_ID(N'dbo.papel'),
              OBJECT_ID(N'dbo.permissao'), OBJECT_ID(N'dbo.atribuicao_papel')
          )
    )
        THROW 51039, N'A recuperacao encontrou propriedade estendida nao esperada.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE (parent_object_id IN (
                  OBJECT_ID(N'dbo.usuario'), OBJECT_ID(N'dbo.credencial_local'), OBJECT_ID(N'dbo.papel'),
                  OBJECT_ID(N'dbo.permissao'), OBJECT_ID(N'dbo.atribuicao_papel')
               )
               OR referenced_object_id IN (
                  OBJECT_ID(N'dbo.usuario'), OBJECT_ID(N'dbo.credencial_local'), OBJECT_ID(N'dbo.papel'),
                  OBJECT_ID(N'dbo.permissao'), OBJECT_ID(N'dbo.atribuicao_papel')
               ))
          AND NOT (
              parent_object_id IN (
                  OBJECT_ID(N'dbo.usuario'), OBJECT_ID(N'dbo.credencial_local'), OBJECT_ID(N'dbo.papel'),
                  OBJECT_ID(N'dbo.permissao'), OBJECT_ID(N'dbo.atribuicao_papel')
              )
              AND referenced_object_id IN (
                  OBJECT_ID(N'dbo.usuario'), OBJECT_ID(N'dbo.credencial_local'), OBJECT_ID(N'dbo.papel'),
                  OBJECT_ID(N'dbo.permissao'), OBJECT_ID(N'dbo.atribuicao_papel')
              )
          )
    )
        THROW 51040, N'A recuperacao encontrou dependencia externa.', 1;

    DROP TABLE dbo.atribuicao_papel;
    DROP TABLE dbo.credencial_local;
    DROP TABLE dbo.permissao;
    DROP TABLE dbo.papel;
    DROP TABLE dbo.usuario;
'@
  }

  Add-Lines $lines @"

    IF EXISTS (
        SELECT 1
        FROM dbo.schema_migrations
        WHERE version = N'$migrationVersion'
          AND checksum_sha256 <> '$ExpectedChecksum'
    )
        THROW 51001, N'Checksum de migration divergente.', 1;
"@

  if (-not $RecoverPartialV0001.IsPresent -and $migrationVersion -eq 'V0001') {
    Add-Lines $lines @'

    IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'V0001')
       AND EXISTS (
            SELECT 1
            FROM sys.tables AS tabela
            JOIN sys.schemas AS esquema ON esquema.schema_id = tabela.schema_id
            WHERE esquema.name = N'dbo'
              AND tabela.name IN (
                  N'usuario', N'credencial_local', N'papel', N'permissao', N'atribuicao_papel',
                  N'papel_permissao', N'concessao_permissao_usuario', N'sessao_autenticacao',
                  N'token_renovacao', N'evento_auditoria', N'chave_idempotencia'
              )
       )
        THROW 51041, N'Fundacao V0001 parcial detectada; use a recuperacao controlada.', 1;
'@
  }

  Add-Lines $lines @"

    IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'$migrationVersion')
    BEGIN
"@
  foreach ($line in ($migrationContent -split "`r?`n")) {
    $lines.Add("        $line")
  }
  Add-Lines $lines @"
        INSERT INTO dbo.schema_migrations (version, script_name, checksum_sha256)
        VALUES (N'$migrationVersion', N'$migrationName', '$ExpectedChecksum');
        SET @migration_outcome = N'APPLIED';
    END;

    COMMIT TRANSACTION;

    IF @migration_outcome = N'APPLIED'
        SELECT N'__ADC_MIGRATION_APPLIED__';
    ELSE
        SELECT N'__ADC_MIGRATION_SKIPPED__';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
"@

  $temporaryOutputPath = Join-Path $outputDirectory ('.' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText(
      $temporaryOutputPath,
      (($lines -join [Environment]::NewLine) + [Environment]::NewLine),
      $encoding
    )
    [System.IO.File]::Move($temporaryOutputPath, $resolvedOutputPath)
  } finally {
    if ([System.IO.File]::Exists($temporaryOutputPath)) {
      [System.IO.File]::Delete($temporaryOutputPath)
    }
  }
} catch {
  [Console]::Error.WriteLine("Falha ao preparar master de migration: $($_.Exception.Message)")
  exit 1
}

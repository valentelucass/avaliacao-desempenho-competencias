[CmdletBinding()]
param(
    [string]$Server = 'localhost,1433',

    [string]$Database = 'AVALIACAO_PROD',

    [string]$ConfirmationText = '',

    [switch]$Execute,

    [switch]$RemoveBackupAfterValidation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedServer = 'localhost,1433'
$expectedDatabase = 'AVALIACAO_PROD'
$expectedConfirmation = 'TESTAR BACKUP E RESTAURACAO AVALIACAO_PROD'
$clonePrefix = 'ADC_RESTORE_TEST_'
$recoveryMarkerName = 'ADC_RECOVERY_TEST_RUN_ID'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$migrationDirectory = Join-Path $PSScriptRoot '..\sql\migrations'

function Stop-Guard {
    param([Parameter(Mandatory)][string]$Message)

    [Console]::Error.WriteLine($Message)
    exit 2
}

function Quote-SqlIdentifier {
    param([Parameter(Mandatory)][string]$Value)

    return '[' + $Value.Replace(']', ']]') + ']'
}

function Quote-SqlString {
    param([Parameter(Mandatory)][string]$Value)

    return "N'$($Value.Replace("'", "''"))'"
}

function Get-Sha256Lower {
    param([Parameter(Mandatory)][string]$Path)

    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        try {
            return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
        }
        finally {
            $stream.Dispose()
        }
    }
    finally {
        $algorithm.Dispose()
    }
}

function Get-ExpectedMigrationHistory {
    param([Parameter(Mandatory)][string]$Directory)

    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        throw [System.InvalidOperationException]::new('O diretório versionado de migrations não está disponível.')
    }

    $files = @(Get-ChildItem -LiteralPath $Directory -File -Filter 'V*.sql' | Sort-Object Name)
    if ($files.Count -eq 0) {
        throw [System.InvalidOperationException]::new('Nenhuma migration versionada foi encontrada.')
    }

    $seenVersions = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $history = [System.Collections.Generic.List[object]]::new()
    foreach ($file in $files) {
        $match = [regex]::Match($file.Name, '^(?<version>V[0-9]{4})__(?<description>[a-z0-9_]+)\.sql$')
        if (-not $match.Success) {
            throw [System.InvalidOperationException]::new('Existe migration com nome incompatível com o padrão versionado.')
        }

        $version = $match.Groups['version'].Value
        if (-not $seenVersions.Add($version)) {
            throw [System.InvalidOperationException]::new('Existe versão de migration duplicada na fonte.')
        }

        $history.Add([pscustomobject]@{
                Version = $version
                ScriptName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
                Checksum = Get-Sha256Lower -Path $file.FullName
            })
    }

    return @($history)
}

function New-MasterConnection {
    param(
        [Parameter(Mandatory)][string]$DataSource,
        [Parameter(Mandatory)][string]$ApplicationName
    )

    $builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
    $builder['Data Source'] = $DataSource
    $builder['Initial Catalog'] = 'master'
    $builder['Integrated Security'] = $true
    $builder['Encrypt'] = $true
    $builder['TrustServerCertificate'] = $false
    $builder['Connect Timeout'] = 15
    $builder['Application Name'] = $ApplicationName
    return [System.Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
}

function Add-NVarCharParameter {
    param(
        [Parameter(Mandatory)][System.Data.SqlClient.SqlCommand]$Command,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][int]$Size,
        [Parameter(Mandatory)][string]$Value
    )

    $parameter = $Command.Parameters.Add($Name, [System.Data.SqlDbType]::NVarChar, $Size)
    $parameter.Value = $Value
}

function Get-DataTable {
    param(
        [Parameter(Mandatory)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory)][string]$CommandText,
        [hashtable]$StringParameters = @{},
        [int]$CommandTimeout = 60
    )

    $command = $Connection.CreateCommand()
    $command.CommandText = $CommandText
    $command.CommandTimeout = $CommandTimeout
    foreach ($entry in $StringParameters.GetEnumerator()) {
        Add-NVarCharParameter -Command $command -Name $entry.Key -Size 4000 -Value ([string]$entry.Value)
    }

    $table = [System.Data.DataTable]::new()
    $adapter = [System.Data.SqlClient.SqlDataAdapter]::new($command)
    try {
        [void]$adapter.Fill($table)
        return (, $table)
    }
    finally {
        $adapter.Dispose()
        $command.Dispose()
    }
}

function Invoke-SqlNonQuery {
    param(
        [Parameter(Mandatory)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory)][string]$CommandText,
        [hashtable]$StringParameters = @{},
        [int]$CommandTimeout = 60
    )

    $command = $Connection.CreateCommand()
    $command.CommandText = $CommandText
    $command.CommandTimeout = $CommandTimeout
    foreach ($entry in $StringParameters.GetEnumerator()) {
        Add-NVarCharParameter -Command $command -Name $entry.Key -Size 4000 -Value ([string]$entry.Value)
    }

    try {
        [void]$command.ExecuteNonQuery()
    }
    finally {
        $command.Dispose()
    }
}

function Assert-ExternalDirectory {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Description
    )

    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        throw [System.InvalidOperationException]::new("$Description não é absoluto.")
    }

    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    if (-not [System.IO.Directory]::Exists($fullPath)) {
        throw [System.InvalidOperationException]::new("$Description não está disponível.")
    }

    $repositoryPrefix = $repositoryRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if ($fullPath.Equals($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.StartsWith($repositoryPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw [System.InvalidOperationException]::new("$Description não pode ficar dentro do repositório.")
    }

    return $fullPath
}

function Join-VerifiedChildPath {
    param(
        [Parameter(Mandatory)][string]$Parent,
        [Parameter(Mandatory)][string]$ChildName
    )

    if ([System.IO.Path]::GetFileName($ChildName) -cne $ChildName) {
        throw [System.InvalidOperationException]::new('O nome técnico do artefato contém separador de diretório.')
    }

    $candidate = [System.IO.Path]::GetFullPath((Join-Path $Parent $ChildName))
    $expectedParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
    $actualParent = [System.IO.Path]::GetDirectoryName($candidate).TrimEnd('\', '/')
    if (-not $actualParent.Equals($expectedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw [System.InvalidOperationException]::new('O artefato técnico ficou fora do diretório aprovado.')
    }

    return $candidate
}

function Assert-MigrationHistory {
    param(
        [Parameter(Mandatory)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory)][string]$DatabaseName,
        [Parameter(Mandatory)][object[]]$ExpectedHistory
    )

    if ($DatabaseName -cne $expectedDatabase -and
        $DatabaseName -notmatch '^ADC_RESTORE_TEST_[0-9]{14}_[0-9a-f]{12}$') {
        throw [System.InvalidOperationException]::new('O nome do banco para validação técnica não é permitido.')
    }

    $quotedDatabase = Quote-SqlIdentifier -Value $DatabaseName
    $actual = Get-DataTable -Connection $Connection -CommandText @"
SELECT version, script_name, checksum_sha256
FROM $quotedDatabase.dbo.schema_migrations
ORDER BY version;
"@
    try {
        if ($actual.Rows.Count -ne $ExpectedHistory.Count) {
            throw [System.InvalidOperationException]::new('A quantidade de migrations não corresponde à fonte versionada.')
        }

        $actualByVersion = [System.Collections.Generic.Dictionary[string, object]]::new(
            [System.StringComparer]::Ordinal
        )
        foreach ($row in $actual.Rows) {
            $version = [string]$row.version
            if (-not $actualByVersion.TryAdd($version, $row)) {
                throw [System.InvalidOperationException]::new('O histórico restaurado contém versão duplicada.')
            }
        }

        foreach ($expected in $ExpectedHistory) {
            $row = $null
            if (-not $actualByVersion.TryGetValue($expected.Version, [ref]$row)) {
                throw [System.InvalidOperationException]::new('O histórico restaurado não contém todas as versões esperadas.')
            }
            if ([string]$row.script_name -cne $expected.ScriptName -or
                [string]$row.checksum_sha256 -cne $expected.Checksum) {
                throw [System.InvalidOperationException]::new('O histórico restaurado diverge da fonte versionada.')
            }
        }
    }
    finally {
        $actual.Dispose()
    }
}

function Assert-DatabaseOwnershipMarker {
    param(
        [Parameter(Mandatory)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory)][string]$DatabaseName
    )

    $quotedDatabase = Quote-SqlIdentifier -Value $DatabaseName
    $table = Get-DataTable -Connection $Connection -CommandText @"
SELECT COUNT(*) AS marker_count
FROM $quotedDatabase.dbo.aplicacao_metadata
WHERE project_code = N'avaliacao-desempenho-competencias';
"@
    try {
        if ($table.Rows.Count -ne 1 -or [int]$table.Rows[0].marker_count -ne 1) {
            throw [System.InvalidOperationException]::new('O marcador de propriedade do banco não foi confirmado.')
        }
    }
    finally {
        $table.Dispose()
    }
}

function Assert-CheckDbClean {
    param(
        [Parameter(Mandatory)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory)][string]$DatabaseName
    )

    $quotedDatabase = Quote-SqlIdentifier -Value $DatabaseName
    $command = $Connection.CreateCommand()
    $command.CommandText = "DBCC CHECKDB ($quotedDatabase) WITH NO_INFOMSGS, ALL_ERRORMSGS, TABLERESULTS;"
    $command.CommandTimeout = 1800
    try {
        $reader = $command.ExecuteReader()
        try {
            do {
                if ($reader.HasRows) {
                    throw [System.InvalidOperationException]::new('DBCC CHECKDB encontrou inconsistência no clone restaurado.')
                }
            } while ($reader.NextResult())
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $command.Dispose()
    }
}

function Get-SafeFailureReference {
    param([Parameter(Mandatory)][System.Exception]$Exception)

    if ($Exception -is [System.Data.SqlClient.SqlException]) {
        $numbers = @(
            $Exception.Errors |
                ForEach-Object { $_.Number } |
                Sort-Object -Unique
        )
        return 'SQL-' + ($numbers -join '-')
    }

    return $Exception.GetType().Name + '-' + $Exception.HResult
}

function Remove-ExactBackupArtifact {
    param(
        [Parameter(Mandatory)][string]$DataSource,
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ExpectedDirectory,
        [Parameter(Mandatory)][string]$ExpectedFileName,
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][datetime]$OperationStartedLocal
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullDirectory = [System.IO.Path]::GetFullPath($ExpectedDirectory).TrimEnd('\', '/')
    $actualDirectory = [System.IO.Path]::GetDirectoryName($fullPath).TrimEnd('\', '/')
    if (-not $actualDirectory.Equals($fullDirectory, [System.StringComparison]::OrdinalIgnoreCase) -or
        [System.IO.Path]::GetFileName($fullPath) -cne $ExpectedFileName -or
        [System.IO.Path]::GetExtension($fullPath) -cne '.bak' -or
        $ExpectedFileName.IndexOf($RunId, [System.StringComparison]::Ordinal) -lt 0) {
        throw [System.InvalidOperationException]::new(
            'A remoção recusou um artefato que não pertence exatamente a esta execução.'
        )
    }

    $connection = New-MasterConnection -DataSource $DataSource -ApplicationName 'ADC backup test cleanup'
    try {
        $connection.Open()
        $metadata = Get-DataTable -Connection $connection -CommandText @'
SELECT
    COUNT(*) AS artifact_count,
    MIN(bs.backup_start_date) AS backup_started_at,
    MAX(bs.backup_finish_date) AS backup_finished_at,
    MIN(bs.backup_size) AS backup_size,
    MIN(bs.compressed_backup_size) AS compressed_backup_size,
    MIN(CONVERT(int, bs.has_backup_checksums)) AS has_backup_checksums,
    MIN(CONVERT(int, bs.is_copy_only)) AS is_copy_only
FROM msdb.dbo.backupset AS bs
INNER JOIN msdb.dbo.backupmediafamily AS bmf
    ON bmf.media_set_id = bs.media_set_id
WHERE bs.database_name = N'AVALIACAO_PROD'
  AND bs.type = N'D'
  AND bmf.physical_device_name = @backupPath;
'@ -StringParameters @{ '@backupPath' = $fullPath }
        try {
            $row = $metadata.Rows[0]
            if ([int]$row.artifact_count -ne 1 -or
                [datetime]$row.backup_started_at -lt $OperationStartedLocal.AddMinutes(-1) -or
                [datetime]$row.backup_finished_at -gt (Get-Date).AddMinutes(1) -or
                [int64]$row.backup_size -le 0 -or
                [int64]$row.compressed_backup_size -le 0 -or
                [int]$row.has_backup_checksums -ne 1 -or
                [int]$row.is_copy_only -ne 1) {
                throw [System.InvalidOperationException]::new(
                    'O catálogo de backup não confirma o artefato único desta execução.'
                )
            }
        }
        finally {
            $metadata.Dispose()
        }

        $existence = Get-DataTable -Connection $connection -CommandText @'
SELECT file_exists
FROM sys.dm_os_file_exists(@backupPath);
'@ -StringParameters @{ '@backupPath' = $fullPath }
        try {
            if ($existence.Rows.Count -ne 1 -or [int]$existence.Rows[0].file_exists -ne 1) {
                throw [System.InvalidOperationException]::new(
                    'O serviço SQL não confirmou a presença do backup para remoção exata.'
                )
            }
        }
        finally {
            $existence.Dispose()
        }

        Invoke-SqlNonQuery -Connection $connection -CommandText @'
EXEC master.dbo.xp_delete_file 0, @backupPath, N'bak';
'@ -StringParameters @{ '@backupPath' = $fullPath }

        $confirmation = Get-DataTable -Connection $connection -CommandText @'
SELECT file_exists
FROM sys.dm_os_file_exists(@backupPath);
'@ -StringParameters @{ '@backupPath' = $fullPath }
        try {
            if ($confirmation.Rows.Count -ne 1 -or [int]$confirmation.Rows[0].file_exists -ne 0) {
                throw [System.InvalidOperationException]::new('A remoção exata do backup não foi confirmada.')
            }
        }
        finally {
            $confirmation.Dispose()
        }
    }
    finally {
        $connection.Dispose()
    }
}

function Remove-ExactRecoveryClone {
    param(
        [Parameter(Mandatory)][string]$DataSource,
        [Parameter(Mandatory)][string]$DatabaseName,
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][datetime]$OperationStartedLocal,
        [Parameter(Mandatory)][bool]$RestoreWasAttempted,
        [Parameter(Mandatory)][bool]$MarkerWasApplied
    )

    if (-not $RestoreWasAttempted -or
        $DatabaseName -notmatch '^ADC_RESTORE_TEST_[0-9]{14}_[0-9a-f]{12}$' -or
        $DatabaseName -eq $expectedDatabase) {
        throw [System.InvalidOperationException]::new('A limpeza recusou um alvo que não pertence a esta execução.')
    }

    $connection = New-MasterConnection -DataSource $DataSource -ApplicationName 'ADC recovery test cleanup'
    try {
        $connection.Open()
        $metadata = Get-DataTable -Connection $connection -CommandText @'
SELECT create_date, state_desc
FROM sys.databases
WHERE name = @databaseName;
'@ -StringParameters @{ '@databaseName' = $DatabaseName }
        try {
            if ($metadata.Rows.Count -eq 0) {
                return
            }
            if ($metadata.Rows.Count -ne 1) {
                throw [System.InvalidOperationException]::new('A limpeza encontrou estado ambíguo para o clone.')
            }

            $markerMatches = $false
            if ([string]$metadata.Rows[0].state_desc -eq 'ONLINE') {
                $quotedDatabase = Quote-SqlIdentifier -Value $DatabaseName
                $marker = Get-DataTable -Connection $connection -CommandText @"
SELECT TRY_CONVERT(nvarchar(64), value) AS run_id
FROM $quotedDatabase.sys.extended_properties
WHERE class = 0
  AND name = N'$recoveryMarkerName';
"@
                try {
                    if ($marker.Rows.Count -gt 1) {
                        throw [System.InvalidOperationException]::new('O clone contém marcador de recuperação ambíguo.')
                    }
                    if ($marker.Rows.Count -eq 1 -and [string]$marker.Rows[0].run_id -cne $RunId) {
                        throw [System.InvalidOperationException]::new('O marcador do clone pertence a outra execução.')
                    }
                    if ($marker.Rows.Count -eq 1) {
                        $markerMatches = $true
                    }
                    if ($MarkerWasApplied -and $marker.Rows.Count -ne 1) {
                        throw [System.InvalidOperationException]::new('O marcador esperado do clone não foi encontrado.')
                    }
                }
                finally {
                    $marker.Dispose()
                }
            }

            $createdAt = [datetime]$metadata.Rows[0].create_date
            if (-not $markerMatches -and
                ($createdAt -lt $OperationStartedLocal.AddMinutes(-1) -or
                    $createdAt -gt (Get-Date).AddMinutes(1))) {
                throw [System.InvalidOperationException]::new(
                    'O clone sem marcador não corresponde ao horário desta execução.'
                )
            }
        }
        finally {
            $metadata.Dispose()
        }

        $quotedClone = Quote-SqlIdentifier -Value $DatabaseName
        Invoke-SqlNonQuery -Connection $connection -CommandText @"
IF DB_ID(N'$DatabaseName') IS NOT NULL
BEGIN
    ALTER DATABASE $quotedClone SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE $quotedClone;
END;
"@ -CommandTimeout 300
    }
    finally {
        $connection.Dispose()
    }
}

if ($Server -cne $expectedServer) {
    Stop-Guard -Message 'O procedimento aceita somente localhost,1433.'
}
if ($Database -cne $expectedDatabase) {
    Stop-Guard -Message 'O procedimento aceita somente AVALIACAO_PROD.'
}
if (-not $Execute.IsPresent) {
    Stop-Guard -Message 'O procedimento é opt-in; informe -Execute somente em uma janela autorizada.'
}
if ($ConfirmationText -cne $expectedConfirmation) {
    Stop-Guard -Message "Confirmação inválida. Informe exatamente: $expectedConfirmation"
}

Add-Type -AssemblyName System.Data

$operationStartedLocal = Get-Date
$runId = [guid]::NewGuid().ToString('N')
$temporaryDatabaseName = '{0}{1:yyyyMMddHHmmss}_{2}' -f `
    $clonePrefix,
    $operationStartedLocal,
    $runId.Substring(0, 12)
$backupFileName = 'ADC_AVALIACAO_PROD_COPYONLY_{0:yyyyMMddHHmmss}_{1}.bak' -f `
    $operationStartedLocal,
    $runId
$expectedMigrations = $null
$connection = $null
$restoreWasAttempted = $false
$markerWasApplied = $false
$operationSucceeded = $false
$operationFailureReference = $null
$cleanupFailureReference = $null
$backupCreated = $false
$backupWasAttempted = $false
$backupDirectory = $null
$backupPath = $null
$operationStage = 'preflight'

Write-Output 'Teste operacional de backup e restauração iniciado.'
Write-Output "Identificador técnico da execução: $runId"

try {
    $expectedMigrations = Get-ExpectedMigrationHistory -Directory $migrationDirectory
    $connection = New-MasterConnection -DataSource $Server -ApplicationName 'ADC backup and recovery test'
    $connection.Open()

    $preflight = Get-DataTable -Connection $connection -CommandText @'
SELECT
    CONVERT(nvarchar(128), SERVERPROPERTY('ComputerNamePhysicalNetBIOS')) AS physical_host,
    CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultBackupPath')) AS backup_path,
    CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultDataPath')) AS data_path,
    CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultLogPath')) AS log_path,
    ISNULL(IS_SRVROLEMEMBER(N'sysadmin'), 0) AS is_sysadmin,
    (SELECT state_desc FROM sys.databases WHERE name = N'AVALIACAO_PROD') AS source_state,
    (SELECT user_access_desc FROM sys.databases WHERE name = N'AVALIACAO_PROD') AS source_access,
    (SELECT is_read_only FROM sys.databases WHERE name = N'AVALIACAO_PROD') AS source_read_only,
    (SELECT COUNT(*) FROM sys.databases WHERE name LIKE N'ADC[_]RESTORE[_]TEST[_]%') AS previous_clones;
'@
    try {
        if ($preflight.Rows.Count -ne 1 -or
            [string]$preflight.Rows[0].physical_host -ine $env:COMPUTERNAME) {
            throw [System.InvalidOperationException]::new('A instância SQL não corresponde à máquina local autorizada.')
        }
        if ([int]$preflight.Rows[0].is_sysadmin -ne 1) {
            throw [System.InvalidOperationException]::new('O procedimento exige uma sessão DBA local autorizada.')
        }
        if ([string]$preflight.Rows[0].source_state -cne 'ONLINE' -or
            [string]$preflight.Rows[0].source_access -cne 'MULTI_USER' -or
            [bool]$preflight.Rows[0].source_read_only) {
            throw [System.InvalidOperationException]::new('O banco-fonte não está no estado operacional esperado.')
        }
        if ([int]$preflight.Rows[0].previous_clones -ne 0) {
            throw [System.InvalidOperationException]::new('Existe clone de recuperação anterior; revise-o antes de iniciar outro teste.')
        }

        $backupDirectory = Assert-ExternalDirectory `
            -Path ([string]$preflight.Rows[0].backup_path) `
            -Description 'O diretório padrão de backup da instância'
        $dataDirectory = Assert-ExternalDirectory `
            -Path ([string]$preflight.Rows[0].data_path) `
            -Description 'O diretório padrão de dados da instância'
        $logDirectory = Assert-ExternalDirectory `
            -Path ([string]$preflight.Rows[0].log_path) `
            -Description 'O diretório padrão de log da instância'
    }
    finally {
        $preflight.Dispose()
    }

    Assert-DatabaseOwnershipMarker -Connection $connection -DatabaseName $Database
    Assert-MigrationHistory `
        -Connection $connection `
        -DatabaseName $Database `
        -ExpectedHistory $expectedMigrations

    $backupPath = Join-VerifiedChildPath -Parent $backupDirectory -ChildName $backupFileName
    if ([System.IO.File]::Exists($backupPath)) {
        throw [System.InvalidOperationException]::new('O artefato de backup desta execução já existe.')
    }

    $operationStage = 'backup'
    Write-Output 'Criando backup completo COPY_ONLY com CHECKSUM e COMPRESSION.'
    $backupWasAttempted = $true
    Invoke-SqlNonQuery -Connection $connection -CommandText @'
BACKUP DATABASE [AVALIACAO_PROD]
TO DISK = @backupPath
WITH COPY_ONLY, CHECKSUM, COMPRESSION, INIT;
'@ -StringParameters @{ '@backupPath' = $backupPath } -CommandTimeout 1800
    $backupCreated = $true

    $operationStage = 'verify'
    Write-Output 'Executando RESTORE VERIFYONLY com CHECKSUM.'
    Invoke-SqlNonQuery -Connection $connection -CommandText @'
RESTORE VERIFYONLY
FROM DISK = @backupPath
WITH CHECKSUM;
'@ -StringParameters @{ '@backupPath' = $backupPath } -CommandTimeout 1800

    $operationStage = 'header'
    $header = Get-DataTable -Connection $connection -CommandText @'
RESTORE HEADERONLY
FROM DISK = @backupPath;
'@ -StringParameters @{ '@backupPath' = $backupPath } -CommandTimeout 300
    try {
        if ($header.Rows.Count -ne 1 -or
            [string]$header.Rows[0].DatabaseName -cne $Database -or
            -not [bool]$header.Rows[0].IsCopyOnly -or
            -not [bool]$header.Rows[0].HasBackupChecksums -or
            -not [bool]$header.Rows[0].Compressed) {
            throw [System.InvalidOperationException]::new('O cabeçalho do backup não confirma todas as proteções exigidas.')
        }
    }
    finally {
        $header.Dispose()
    }

    $operationStage = 'file-list-query'
    $fileList = Get-DataTable -Connection $connection -CommandText @'
RESTORE FILELISTONLY
FROM DISK = @backupPath;
'@ -StringParameters @{ '@backupPath' = $backupPath } -CommandTimeout 300
    try {
        $operationStage = 'file-list-initialize'
        if ($fileList.Rows.Count -lt 2) {
            throw [System.InvalidOperationException]::new('A lista de arquivos do backup está incompleta.')
        }

        $moves = [System.Collections.Generic.List[string]]::new()
        $dataOrdinal = 0
        $logOrdinal = 0
        foreach ($row in $fileList.Rows) {
            $operationStage = 'file-list-read-item'
            $logicalName = [string]$row.LogicalName
            $type = [string]$row.Type
            if ([string]::IsNullOrWhiteSpace($logicalName) -or $type -notin @('D', 'L')) {
                throw [System.InvalidOperationException]::new('O backup contém tipo de arquivo não previsto pelo procedimento.')
            }

            if ($type -eq 'L') {
                $operationStage = 'file-list-log-path'
                $logOrdinal++
                $physicalName = '{0}_{1}.ldf' -f $temporaryDatabaseName, $logOrdinal
                $physicalPath = Join-VerifiedChildPath -Parent $logDirectory -ChildName $physicalName
            }
            else {
                $operationStage = 'file-list-data-path'
                $dataOrdinal++
                $extension = if ($dataOrdinal -eq 1) { '.mdf' } else { '.ndf' }
                $physicalName = '{0}_{1}{2}' -f $temporaryDatabaseName, $dataOrdinal, $extension
                $physicalPath = Join-VerifiedChildPath -Parent $dataDirectory -ChildName $physicalName
            }

            $operationStage = 'file-list-path-collision'
            if ([System.IO.File]::Exists($physicalPath) -or [System.IO.Directory]::Exists($physicalPath)) {
                throw [System.InvalidOperationException]::new('Um arquivo físico planejado para o clone já existe.')
            }
            $operationStage = 'file-list-compose-move'
            $quotedLogicalName = Quote-SqlString -Value $logicalName
            $quotedPhysicalPath = Quote-SqlString -Value $physicalPath
            $moves.Add(('MOVE {0} TO {1}' -f $quotedLogicalName, $quotedPhysicalPath))
        }
        $operationStage = 'file-list-cardinality'
        if ($dataOrdinal -eq 0 -or $logOrdinal -eq 0) {
            throw [System.InvalidOperationException]::new('O backup precisa conter ao menos um arquivo de dados e um de log.')
        }
    }
    finally {
        $fileList.Dispose()
    }

    $operationStage = 'clone-name'
    $quotedClone = Quote-SqlIdentifier -Value $temporaryDatabaseName
    $operationStage = 'restore'
    $restoreWasAttempted = $true
    Write-Output 'Restaurando clone temporário isolado nos diretórios padrão da instância.'
    $operationStage = 'isolate-clone'
    Invoke-SqlNonQuery -Connection $connection -CommandText @"
RESTORE DATABASE $quotedClone
FROM DISK = @backupPath
WITH CHECKSUM, RECOVERY, $($moves -join ', ');
"@ -StringParameters @{ '@backupPath' = $backupPath } -CommandTimeout 1800

    Invoke-SqlNonQuery -Connection $connection -CommandText @"
USE $quotedClone;
EXEC sys.sp_addextendedproperty
    @name = N'$recoveryMarkerName',
    @value = @runId;
USE [master];
ALTER DATABASE $quotedClone SET RESTRICTED_USER WITH ROLLBACK IMMEDIATE;
ALTER DATABASE $quotedClone SET READ_ONLY WITH ROLLBACK IMMEDIATE;
"@ -StringParameters @{ '@runId' = $runId } -CommandTimeout 300
    $markerWasApplied = $true

    $operationStage = 'checkdb'
    Write-Output 'Executando DBCC CHECKDB no clone restaurado.'
    Assert-CheckDbClean -Connection $connection -DatabaseName $temporaryDatabaseName

    $operationStage = 'restored-contract'
    Assert-DatabaseOwnershipMarker -Connection $connection -DatabaseName $temporaryDatabaseName
    Assert-MigrationHistory `
        -Connection $connection `
        -DatabaseName $temporaryDatabaseName `
        -ExpectedHistory $expectedMigrations

    $operationSucceeded = $true
}
catch {
    $operationFailureReference =
        $operationStage + '-' + $_.FullyQualifiedErrorId + '-' + (Get-SafeFailureReference -Exception $_.Exception)
}
finally {
    if ($null -ne $connection) {
        $connection.Dispose()
    }

    if ($restoreWasAttempted) {
        try {
            Remove-ExactRecoveryClone `
                -DataSource $Server `
                -DatabaseName $temporaryDatabaseName `
                -RunId $runId `
                -OperationStartedLocal $operationStartedLocal `
                -RestoreWasAttempted $restoreWasAttempted `
                -MarkerWasApplied $markerWasApplied
            Write-Output 'Clone temporário desta execução descartado.'
        }
        catch {
            $cleanupFailureReference = Get-SafeFailureReference -Exception $_.Exception
        }
    }

    if ($operationSucceeded -and
        $null -eq $cleanupFailureReference -and
        $RemoveBackupAfterValidation.IsPresent) {
        try {
            if (-not $backupCreated -or $null -eq $backupDirectory -or $null -eq $backupPath) {
                throw [System.InvalidOperationException]::new(
                    'O backup não atingiu o estado necessário para remoção automática.'
                )
            }
            Remove-ExactBackupArtifact `
                -DataSource $Server `
                -Path $backupPath `
                -ExpectedDirectory $backupDirectory `
                -ExpectedFileName $backupFileName `
                -RunId $runId `
                -OperationStartedLocal $operationStartedLocal
            Write-Output 'O arquivo único de backup desta execução foi removido de forma irreversível.'
        }
        catch {
            $cleanupFailureReference = Get-SafeFailureReference -Exception $_.Exception
        }
    }
}

if ($null -ne $cleanupFailureReference) {
    [Console]::Error.WriteLine(
        "A limpeza automática desta execução falhou ($cleanupFailureReference). " +
        "Interrompa novas execuções e use o identificador técnico em uma recuperação DBA protegida."
    )
    exit 1
}
if (-not $operationSucceeded) {
    [Console]::Error.WriteLine(
        "O teste operacional falhou ($operationFailureReference). " +
        'Nenhum detalhe sensível foi impresso; diagnostique em sessão DBA protegida.'
    )
    if ($backupWasAttempted) {
        [Console]::Error.WriteLine(
            'Um artefato de backup pode permanecer no diretório padrão; trate-o pela política de retenção autorizada.'
        )
    }
    exit 1
}

Write-Output 'Backup verificado, restauração isolada, DBCC CHECKDB e histórico de migrations validados.'
if ($RemoveBackupAfterValidation.IsPresent) {
    Write-Output 'O clone e o backup desta execução foram descartados; a remoção do arquivo não é recuperável.'
}
else {
    Write-Output 'O clone foi descartado; o backup permanece no diretório padrão sujeito à retenção autorizada.'
}
exit 0

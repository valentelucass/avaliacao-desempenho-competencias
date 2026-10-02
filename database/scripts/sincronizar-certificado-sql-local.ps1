[CmdletBinding()]
param([string]$ProfilePath = $env:ADC_SQLCMD_LOCAL_TLS_PROFILE)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'scripts/prepare-production-config.ps1')

function Assert-DatabaseSqlIdentity {
    param($Profile, [string]$MachineGuid, [string]$AccountSid, $Service, $Process, $Signature, [array]$Listeners)
    if ($MachineGuid -ine $Profile.machineGuid -or $AccountSid -cne $Profile.accountSid) { throw 'VM_ACCOUNT_IDENTITY' }
    if ($Service.State -ne 'Running' -or $Service.ProcessId -lt 1 -or $Process.ProcessId -ne $Service.ProcessId) { throw 'SQL_NOT_RUNNING' }
    if ([string]::IsNullOrWhiteSpace($Process.ExecutablePath) -or
        [IO.Path]::GetFullPath($Process.ExecutablePath) -ine [IO.Path]::GetFullPath($Profile.sqlExecutable)) { throw 'SQL_EXECUTABLE_IDENTITY' }
    if ($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch '^CN=Microsoft Corporation,') { throw 'SQL_SIGNATURE' }
    if (-not $Listeners.Count -or @($Listeners | Where-Object {
        $_.OwningProcess -ne $Service.ProcessId -or $_.LocalPort -ne 1433 -or
        $_.LocalAddress -notin @('0.0.0.0', '::', '127.0.0.1', '::1')
    }).Count) { throw 'SQL_ENDPOINT_IDENTITY' }
}

function Get-VerifiedDatabaseSqlIdentity {
    param($Profile)
    $service = Get-CimInstance Win32_Service -Filter "Name='MSSQLSERVER'"
    $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $service.ProcessId)
    $receipt = $null
    if ([string]::IsNullOrWhiteSpace($process.ExecutablePath)) {
        # An unelevated operator must also match the protected proof produced by the verified boot.
        Assert-DatabaseTlsArtifact $Profile.sqlIdentityReceipt
        $receipt = Get-Content -LiteralPath $Profile.sqlIdentityReceipt -Encoding UTF8 -Raw | ConvertFrom-Json
        Assert-DatabaseSqlBootReceipt $receipt $service.ProcessId $process.CreationDate
        $image = $null
        if ($service.PathName -match '^"([^"]+)"(?:\s|$)') { $image = $Matches[1] }
        elseif ($service.PathName -match '^(.+?\.exe)(?:\s|$)') { $image = $Matches[1] }
        $process = [pscustomobject]@{ProcessId = $process.ProcessId; CreationDate = $process.CreationDate;
            ExecutablePath = $image}
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $Profile.sqlExecutable
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 1433 -ErrorAction Stop)
    $machine = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    Assert-DatabaseSqlIdentity $Profile $machine $sid $service $process $signature $listeners
    [pscustomobject]@{Pid = $service.ProcessId; Created = $process.CreationDate; Executable = $process.ExecutablePath;
        CertificateSha256 = $(if ($null -ne $receipt) { $receipt.certificateSHA256 } else { $null })}
}

function Assert-DatabaseSqlBootReceipt {
    param($Receipt, [int]$ProcessId, [DateTime]$Created)
    if ($Receipt.status -cne 'TLS_PRIVATE_TRUST_REFRESHED_AND_PROBED' -or
        $Receipt.sqlServicePID -ne $ProcessId -or -not $Receipt.tlsCertificateValidated -or
        $Receipt.queriesExecuted -ne 0 -or $Receipt.sqlChanges -or $Receipt.globalTrustChanges -or
        $Receipt.certificateSHA256 -notmatch '^[a-f0-9]{64}$' -or
        [DateTimeOffset]::Parse($Receipt.observedAtUTC).UtcDateTime -lt $Created.ToUniversalTime() -or
        [DateTimeOffset]::Parse($Receipt.observedAtUTC).UtcDateTime -gt [DateTime]::UtcNow.AddMinutes(1)) {
        throw 'VERIFIED_SQL_BOOT_RECEIPT_REQUIRED'
    }
}

function Assert-DatabaseSqlIdentityUnchanged {
    param($Before, $After)
    if ($Before.Pid -ne $After.Pid -or $Before.Created -ne $After.Created -or $Before.Executable -ine $After.Executable) {
        throw 'SQL_ENDPOINT_CHANGED'
    }
}

function Assert-DatabaseCertificateCapture {
    param($Metadata, [string]$CertificateSha256)
    if (-not $Metadata.captured -or $Metadata.handshakeAccepted -or $Metadata.credentialsSent -ne 0 -or
        $Metadata.queriesExecuted -ne 0 -or $Metadata.sha256 -notmatch '^[a-f0-9]{64}$' -or
        $Metadata.sha256 -cne $CertificateSha256) { throw 'PUBLIC_CERTIFICATE_CAPTURE_CONTRACT' }
}

function Assert-DatabaseTlsArtifact {
    param([string]$Path, [string]$Sha256)
    Assert-NoReparsePoint $Path
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'TLS_ARTIFACT_MISSING' }
    $allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
    if (@((Get-Acl -LiteralPath $Path).Access | Where-Object {
        $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed
    }).Count) { throw 'TLS_ARTIFACT_ACL' }
    if ($Sha256 -and ($Sha256 -notmatch '^[a-fA-F0-9]{64}$' -or
        (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ine $Sha256)) { throw 'TLS_ARTIFACT_CHANGED' }
}

function Sync-DatabaseLocalCertificate {
    param([Parameter(Mandatory)][string]$ProfilePath)
    if ($env:ADC_DB_SERVER -notin @('localhost', '127.0.0.1') -or $env:ADC_DB_PORT -ne '1433' -or
        $env:ADC_DB_NAME -notin @('AVALIACAO_DEV', 'AVALIACAO_PROD')) { throw 'LOCAL_SQL_TARGET_REQUIRED' }
    Assert-DatabaseTlsArtifact $ProfilePath
    $profileHash = (Get-FileHash -LiteralPath $ProfilePath).Hash
    $profile = Get-Content -LiteralPath $ProfilePath -Encoding UTF8 -Raw | ConvertFrom-Json
    $privateRoot = Join-Path $env:ProgramData 'Rodogarcia/AvaliacaoDesempenho'
    $certificatePath = Join-Path $privateRoot 'database-runner/sql-server-public.pem'
    $captureDirectory = Join-Path $privateRoot 'production'
    if ($profile.version -ne 1 -or $profile.machineGuid -notmatch '^[a-fA-F0-9-]{36}$' -or
        $profile.accountSid -notmatch '^S-1-5-21-[0-9-]+$' -or
        [IO.Path]::GetFullPath($profile.certificatePath) -ine [IO.Path]::GetFullPath($certificatePath) -or
        [IO.Path]::GetFullPath($env:ADC_SQLCMD_SERVER_CERTIFICATE) -ine [IO.Path]::GetFullPath($certificatePath)) { throw 'TLS_PROFILE_SCOPE' }
    foreach ($directory in @([IO.Path]::GetDirectoryName($ProfilePath), [IO.Path]::GetDirectoryName($certificatePath),
        $captureDirectory, $profile.collectorDirectory)) {
        Assert-NoReparsePoint $directory
        Assert-PrivateAcl $directory
    }
    Assert-DatabaseTlsArtifact $certificatePath
    $collector = Join-Path $profile.collectorDirectory 'CaptureSqlPublicCertificate.class'
    $driver = Join-Path $profile.collectorDirectory 'mssql-jdbc-13.4.0.jre11.jar'
    Assert-DatabaseTlsArtifact $collector $profile.collectorSha256
    Assert-DatabaseTlsArtifact $driver $profile.driverSha256
    Assert-NoReparsePoint $profile.javaExecutable
    Assert-NoReparsePoint $profile.sqlExecutable
    if ((Get-FileHash -LiteralPath $profile.javaExecutable).Hash -ine $profile.javaSha256) { throw 'JAVA_ARTIFACT_CHANGED' }

    $lock = $null
    $capture = Join-Path $captureDirectory ('sql-local-public-' + [Guid]::NewGuid().ToString('N') + '.pem')
    $candidate = Join-Path ([IO.Path]::GetDirectoryName($certificatePath)) ('.sql-public-' + [Guid]::NewGuid().ToString('N') + '.pem')
    try {
        $lockPath = $certificatePath + '.sync.lock'
        Assert-NoReparsePoint $lockPath
        $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        $before = Get-VerifiedDatabaseSqlIdentity $profile
        $previousPinHash = (Get-FileHash -LiteralPath $certificatePath).Hash
        $environment = @{}
        foreach ($name in @('JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS', 'SQLCMDPASSWORD', 'ADC_DB_USER', 'ADC_DATABASE_SQL_USER')) {
            $environment[$name] = [Environment]::GetEnvironmentVariable($name)
            [Environment]::SetEnvironmentVariable($name, $null)
        }
        try {
            # The collector deliberately refuses TLS before LOGIN7; it receives no real credential.
            $output = & $profile.javaExecutable -cp ($profile.collectorDirectory + ';' + $driver) CaptureSqlPublicCertificate $capture
            if ($LASTEXITCODE -ne 0) { throw 'PUBLIC_CERTIFICATE_CAPTURE_FAILED' }
        } finally {
            foreach ($name in $environment.Keys) { [Environment]::SetEnvironmentVariable($name, $environment[$name]) }
        }
        $metadata = ($output -join [Environment]::NewLine) | ConvertFrom-Json
        Assert-DatabaseTlsArtifact $capture
        $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($capture)
        try {
            $digest = [Security.Cryptography.SHA256]::Create()
            try { $fingerprint = ([BitConverter]::ToString($digest.ComputeHash($certificate.RawData))).Replace('-', '').ToLowerInvariant() }
            finally { $digest.Dispose() }
        } finally { $certificate.Dispose() }
        Assert-DatabaseCertificateCapture $metadata $fingerprint
        if ($before.CertificateSha256 -and $before.CertificateSha256 -cne $fingerprint) { throw 'SQL_CERTIFICATE_NOT_VERIFIED_BY_BOOT' }
        $after = Get-VerifiedDatabaseSqlIdentity $profile
        Assert-DatabaseSqlIdentityUnchanged $before $after
        if ($after.CertificateSha256 -and $after.CertificateSha256 -cne $fingerprint) { throw 'SQL_CERTIFICATE_NOT_VERIFIED_BY_BOOT' }
        Assert-DatabaseTlsArtifact $ProfilePath $profileHash
        Assert-DatabaseTlsArtifact $collector $profile.collectorSha256
        Assert-DatabaseTlsArtifact $driver $profile.driverSha256
        Assert-DatabaseTlsArtifact $certificatePath $previousPinHash
        $capturedHash = (Get-FileHash -LiteralPath $capture).Hash
        $changed = $capturedHash -ine $previousPinHash
        $backup = $null
        if ($changed) {
            [IO.File]::WriteAllBytes($candidate, [IO.File]::ReadAllBytes($capture))
            $backup = $certificatePath + '.before-' + [Guid]::NewGuid().ToString('N')
            [IO.File]::Replace($candidate, $certificatePath, $backup)
        }
        $result = [ordered]@{status = 'LOCAL_SQL_PUBLIC_CERTIFICATE_VERIFIED'; changed = $changed;
            observedAtUTC = [DateTime]::UtcNow.ToString('o'); certificateSHA256 = $fingerprint;
            sqlServicePID = $before.Pid; credentialsSent = 0; queriesExecuted = 0; backupPath = $backup}
        $receiptPath = $certificatePath + '.receipt.json'
        Assert-NoReparsePoint $receiptPath
        [IO.File]::WriteAllText($receiptPath, ($result | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        if ($changed) { Write-Output '[INFO] Certificado publico do SQL local reconciliado; pin anterior preservado.' }
    } finally {
        if ($null -ne $lock) { $lock.Dispose() }
        # These exact generated files are owned by this invocation; no directory is removed.
        foreach ($owned in @($capture, $candidate)) {
            Assert-NoReparsePoint $owned
            if (Test-Path -LiteralPath $owned -PathType Leaf) { [IO.File]::Delete($owned) }
        }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try { Sync-DatabaseLocalCertificate -ProfilePath $ProfilePath; exit 0 }
    catch { [Console]::Error.WriteLine('[ERRO] Reconciliacao do certificado SQL local recusada; confira o perfil protegido e a identidade da instancia.'); exit 1 }
}

[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$ReleaseId,
    [Parameter(Mandatory)][string]$ProductionConfig
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'prepare-production-config.ps1')
$release = Join-Path (Split-Path -Parent $PSScriptRoot) ('backend\target\releases\' + $ReleaseId)
Assert-NoReparsePoint $release
$jars = @(Get-ChildItem -LiteralPath $release -File -Filter 'avaliacao-desempenho-api-*.jar')
if ($jars.Count -ne 1) { throw 'EXPECTED_ONE_RELEASE_JAR' }
Assert-NoReparsePoint $jars[0].FullName
$hash = (Get-FileHash -LiteralPath $jars[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()

$production = Split-Path -Parent $ProductionConfig
Assert-NoReparsePoint $production
Assert-PrivateAcl $production
$directory = Join-Path $production 'release-hashes'
New-PrivateDirectory $directory
Assert-PrivateAcl $directory
$receipt = Join-Path $directory ($ReleaseId + '.sha256')
Assert-NoReparsePoint $receipt
$temporary = Join-Path $directory ([Guid]::NewGuid().ToString('N') + '.tmp')
try {
    if (!(Test-Path -LiteralPath $receipt)) {
        [IO.File]::WriteAllText($temporary, $hash, [Text.Encoding]::ASCII)
        try { [IO.File]::Move($temporary, $receipt) }
        catch [IO.IOException] { if (!(Test-Path -LiteralPath $receipt)) { throw } }
    }
    if ([IO.File]::ReadAllText($receipt) -cne $hash) { throw 'RELEASE_HASH_CHANGED' }
} finally {
    if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
}

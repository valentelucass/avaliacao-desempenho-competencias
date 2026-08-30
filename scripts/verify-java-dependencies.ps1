[CmdletBinding()]
param(
    [ValidatePattern('^target[\\/][A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*$')]
    [string]$BackendBuildDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scannerVersion = '2.5.1'
$scannerSha256 = '25e42f5ef6711fd8c0fb45390972205891dd44c6bd02ac93f0f63e8e98d9bfb6'
$scannerDownloadUri =
    "https://github.com/google/osv-scanner/releases/download/v$scannerVersion/osv-scanner_windows_amd64.exe"

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

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repositoryRoot 'backend'
$buildDirectory = if ([string]::IsNullOrWhiteSpace($BackendBuildDirectory)) {
    Join-Path $backendRoot 'target'
}
else {
    Join-Path $backendRoot $BackendBuildDirectory
}
$sbomPath = Join-Path $buildDirectory 'classes\META-INF\sbom\application.cdx.json'

if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
        [System.Runtime.InteropServices.OSPlatform]::Windows
    )) {
    throw 'O gate local fixado usa o binário Windows oficial do OSV-Scanner.'
}

if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne
    [System.Runtime.InteropServices.Architecture]::X64) {
    throw 'O gate local fixado exige Windows x64 para executar o OSV-Scanner verificado.'
}

if (-not (Test-Path -LiteralPath $sbomPath -PathType Leaf)) {
    throw "SBOM Java não encontrado em '$sbomPath'. Execute o Maven verify antes da auditoria."
}

$sbom = Get-Content -LiteralPath $sbomPath -Raw | ConvertFrom-Json
if ($sbom.bomFormat -ne 'CycloneDX' -or $sbom.specVersion -ne '1.6' -or $sbom.components.Count -lt 1) {
    throw 'O artefato CycloneDX Java está ausente, vazio ou fora da versão esperada.'
}

$toolDirectory = Join-Path $backendRoot 'target\security-tools'
$scannerPath = Join-Path $toolDirectory "osv-scanner-v$scannerVersion-windows-amd64.exe"
$temporaryScannerPath = "$scannerPath.download"

New-Item -ItemType Directory -Force -Path $toolDirectory | Out-Null

if (-not (Test-Path -LiteralPath $scannerPath -PathType Leaf)) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $scannerDownloadUri -OutFile $temporaryScannerPath
        $downloadedHash = Get-Sha256Lower -Path $temporaryScannerPath
        if ($downloadedHash -ne $scannerSha256) {
            throw 'O hash do OSV-Scanner baixado não corresponde ao release oficial fixado.'
        }
        Move-Item -LiteralPath $temporaryScannerPath -Destination $scannerPath -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporaryScannerPath) {
            Remove-Item -LiteralPath $temporaryScannerPath -Force
        }
    }
}

$cachedHash = Get-Sha256Lower -Path $scannerPath
if ($cachedHash -ne $scannerSha256) {
    throw 'O executável em cache do OSV-Scanner não corresponde ao hash fixado.'
}

$global:LASTEXITCODE = 0
& $scannerPath scan source -S $sbomPath --format vertical --verbosity error
if ($LASTEXITCODE -ne 0) {
    throw "O OSV-Scanner encerrou com código $LASTEXITCODE. Revise vulnerabilidades ou falhas da consulta."
}

Write-Output "SBOM CycloneDX 1.6 validado e dependências Java verificadas pelo OSV-Scanner v$scannerVersion."

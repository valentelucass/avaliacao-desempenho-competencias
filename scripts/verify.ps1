[CmdletBinding()]
param(
    [ValidatePattern('^target[\\/][A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*$')]
    [string]$BackendBuildDirectory,
    [string]$FrontendBuildDirectory,
    [string]$FrontendApiBaseUrl = '/api/v1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Validation {
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [Parameter(Mandatory)]
        [scriptblock]$Command
    )

    Write-Host "==> $Name"
    & $Command

    if ($LASTEXITCODE -ne 0) {
        throw "Falha na validação: $Name"
    }
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'frontend-staging.ps1')
$frontendStage = Initialize-FrontendStage -Directory $FrontendBuildDirectory
$previousApiBaseUrl = $env:VITE_API_BASE_URL
$env:VITE_API_BASE_URL = $null

try {
    Push-Location (Join-Path $repositoryRoot 'backend')
    try {
        $mavenArguments = @('verify')
        if (-not [string]::IsNullOrWhiteSpace($BackendBuildDirectory)) {
            $mavenArguments += "-Dadc.build.directory=$BackendBuildDirectory"
        }

        Invoke-Validation 'Back-end: Maven verify' { & .\mvnw.cmd @mavenArguments }
    }
    finally {
        Pop-Location
    }

    Push-Location (Join-Path $repositoryRoot 'frontend')
    try {
        if (-not (Test-Path -LiteralPath 'node_modules')) {
            Invoke-Validation 'Front-end: npm ci' { & npm ci }
        }

        Invoke-Validation 'Front-end: Prettier' { & npm run format:check }
        Invoke-Validation 'Front-end: Oxlint' { & npm run lint }
        Invoke-Validation 'Front-end: Vitest' { & npm test }
        try {
            $env:VITE_API_BASE_URL = $FrontendApiBaseUrl
            Start-FrontendBuild -Directory $frontendStage.BuildDirectory -ApiBaseUrl $FrontendApiBaseUrl
            Invoke-Validation 'Front-end: build isolado' { & npm run build -- --outDir $frontendStage.BuildDirectory }
            Complete-FrontendBuild -Directory $frontendStage.BuildDirectory -ApiBaseUrl $FrontendApiBaseUrl
        }
        finally {
            $env:VITE_API_BASE_URL = $null
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    $env:VITE_API_BASE_URL = $previousApiBaseUrl
}

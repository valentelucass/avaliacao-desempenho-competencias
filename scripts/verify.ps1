[CmdletBinding()]
param(
    [ValidatePattern('^target[\\/][A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*$')]
    [string]$BackendBuildDirectory
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
    Invoke-Validation 'Front-end: build' { & npm run build }
}
finally {
    Pop-Location
}

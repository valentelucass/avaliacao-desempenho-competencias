[CmdletBinding()]
param(
    [switch]$SkipDatabase,
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
    $global:LASTEXITCODE = 0
    & $Command

    if ($LASTEXITCODE -ne 0) {
        throw "Falha na validacao: $Name"
    }
}

function Assert-PowerShellSyntax {
    param([Parameter(Mandatory)][string]$RepositoryRoot)

    $excludedDirectoryNames = @('.git', 'node_modules', 'target', 'dist', 'coverage')
    $syntaxErrors = [System.Collections.Generic.List[object]]::new()

    foreach ($file in Get-ChildItem -LiteralPath $RepositoryRoot -Recurse -Force -Filter '*.ps1' -File) {
        $relativePath = $file.FullName.Substring($RepositoryRoot.Length).TrimStart('\', '/')
        if (($relativePath -split '[\\/]') | Where-Object { $excludedDirectoryNames -contains $_ }) {
            continue
        }

        $tokens = $null
        $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile(
            $file.FullName,
            [ref]$tokens,
            [ref]$errors
        )

        foreach ($error in $errors) {
            $syntaxErrors.Add([pscustomobject]@{
                    Path = $relativePath
                    Line = $error.Extent.StartLineNumber
                    Message = $error.Message
                })
        }
    }

    if ($syntaxErrors.Count -gt 0) {
        $summary = $syntaxErrors | ForEach-Object { "{0}:{1} {2}" -f $_.Path, $_.Line, $_.Message }
        throw "Erros de sintaxe PowerShell encontrados:`n$($summary -join [Environment]::NewLine)"
    }
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot

Invoke-Validation 'Repositorio: scanner local de segredos' {
    & (Join-Path $PSScriptRoot 'scan-secrets.ps1')
}

Invoke-Validation 'Repositorio: sintaxe PowerShell' {
    Assert-PowerShellSyntax -RepositoryRoot $repositoryRoot
}

Invoke-Validation 'Banco: regras estaticas de migrations' {
    & (Join-Path $repositoryRoot 'database\scripts\validar-migrations.ps1') `
        -MigrationDirectory (Join-Path $repositoryRoot 'database\sql\migrations')
}

Invoke-Validation 'Aplicacao: build, testes, formatter e lint' {
    if ([string]::IsNullOrWhiteSpace($BackendBuildDirectory)) {
        & (Join-Path $PSScriptRoot 'verify.ps1')
    }
    else {
        & (Join-Path $PSScriptRoot 'verify.ps1') -BackendBuildDirectory $BackendBuildDirectory
    }
}

Push-Location (Join-Path $repositoryRoot 'frontend')
try {
    Invoke-Validation 'Front-end: auditoria de dependencias npm' {
        & npm run audit:dependencies
    }
}
finally {
    Pop-Location
}

if (-not $SkipDatabase) {
    Invoke-Validation 'Banco: migrations e validacoes somente leitura' {
        & (Join-Path $repositoryRoot 'database\executar-database.bat') --validate
    }
}

Write-Output 'Gate local de qualidade concluido com sucesso.'

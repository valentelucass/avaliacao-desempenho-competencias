[CmdletBinding()]
param(
    [switch]$SkipDatabase,
    [ValidatePattern('^target[\\/][A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*$')]
    [string]$BackendBuildDirectory,
    [string]$FrontendBuildDirectory = $env:ADC_FRONTEND_BUILD_DIRECTORY,
    [string]$FrontendApiBaseUrl = $env:ADC_FRONTEND_API_BASE_URL
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'frontend-staging.ps1')
$frontendStage = Initialize-FrontendStage -Directory $FrontendBuildDirectory
if ([string]::IsNullOrWhiteSpace($FrontendApiBaseUrl)) { $FrontendApiBaseUrl = '/api/v1' }
$previousFrontendEnvironment = @{}
foreach ($name in @('VITE_API_BASE_URL', 'ADC_FRONTEND_BUILD_DIRECTORY', 'ADC_BROWSER_ARTIFACT_DIRECTORY')) {
    $previousFrontendEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$env:VITE_API_BASE_URL = $null
$env:ADC_FRONTEND_BUILD_DIRECTORY = $frontendStage.BuildDirectory
$env:ADC_BROWSER_ARTIFACT_DIRECTORY = $frontendStage.BrowserArtifactsDirectory

try {

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

    Invoke-Validation 'Banco: autenticacao do executor com SQL simulado' {
        & (Join-Path $PSScriptRoot 'testar-database-auth.ps1')
    }

    Invoke-Validation 'Operacao: manifesto PM2 com ambiente minimo' {
        & node (Join-Path $PSScriptRoot 'validate-pm2-manifest.cjs')
    }

    Invoke-Validation 'Operacao: regressao dos launchers DEV sem alterar processos reais' {
        & (Join-Path $PSScriptRoot 'testar-launchers-dev.ps1')
        & (Join-Path $PSScriptRoot 'testar-launcher-java-access.ps1')
    }

    Invoke-Validation 'Operacao: recuperacao SQL local sem banco ou processos reais' {
        & (Join-Path $PSScriptRoot 'testar-local-sql-recovery.ps1')
        & node (Join-Path $PSScriptRoot 'testar-avaliacao-running.cjs')
    }

    Invoke-Validation 'Operacao: diagnostico PROD sem iniciar daemon PM2' {
        & node (Join-Path $PSScriptRoot 'testar-launcher-prod.cjs')
    }

    Invoke-Validation 'Operacao: staging do frontend e preservacao do diretorio servido' {
        & (Join-Path $PSScriptRoot 'testar-frontend-staging.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Falha na fixture de staging do frontend.' }
        & (Join-Path $PSScriptRoot 'testar-frontend-promotion-rollback.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Falha na fixture de recuperacao da promocao do frontend.' }
        & node (Join-Path $PSScriptRoot 'testar-browser-artifacts.cjs')
        if ($LASTEXITCODE -ne 0) { throw 'Falha na fixture de evidencias do navegador.' }
        & node (Join-Path $PSScriptRoot 'testar-launcher-prod-staging.cjs')
    }

    Invoke-Validation 'Operacao: preparacao privada de configuracao em TEMP' {
        & (Join-Path $PSScriptRoot 'testar-preparacao-producao.ps1')
    }

    Invoke-Validation 'Operacao: captura privada de token Cloudflare com fixtures' {
        & (Join-Path $PSScriptRoot 'testar-cloudflare-token.ps1')
    }

    Invoke-Validation 'Operacao: projecao privada de rotas Cloudflare com fixtures' {
        & (Join-Path $PSScriptRoot 'testar-cloudflare-routes.ps1')
    }

    Invoke-Validation 'Operacao: preparo parado do servico Cloudflare com fixtures' {
        & (Join-Path $PSScriptRoot 'testar-cloudflare-service.ps1')
    }

    Invoke-Validation 'Operacao: pontes TCP loopback com portas efemeras' {
        & node --test (Join-Path $PSScriptRoot 'testar-loopback-bridges.cjs')
    }

    Invoke-Validation 'Operacao: pontes HTTP com HTTPS obrigatorio e origens ficticias' {
        & node --test (Join-Path $PSScriptRoot 'testar-https-loopback-bridges.cjs')
    }

    Invoke-Validation 'Operacao: gerenciador de pontes com fixtures isoladas' {
        & (Join-Path $PSScriptRoot 'testar-gerenciador-pontes.ps1')
    }

    Invoke-Validation 'Banco: regras estaticas de migrations' {
        & (Join-Path $repositoryRoot 'database\scripts\validar-migrations.ps1') `
            -MigrationDirectory (Join-Path $repositoryRoot 'database\sql\migrations')
    }

    Invoke-Validation 'Aplicacao: build, testes, formatter e lint' {
        if ([string]::IsNullOrWhiteSpace($BackendBuildDirectory)) {
            & (Join-Path $PSScriptRoot 'verify.ps1') -FrontendBuildDirectory $frontendStage.BuildDirectory -FrontendApiBaseUrl $FrontendApiBaseUrl
        }
        else {
            & (Join-Path $PSScriptRoot 'verify.ps1') -BackendBuildDirectory $BackendBuildDirectory -FrontendBuildDirectory $frontendStage.BuildDirectory -FrontendApiBaseUrl $FrontendApiBaseUrl
        }
    }

    Invoke-Validation 'Front-end: impressao A4 e hover desabilitado no Edge real' {
        # O ensaio compila várias fixtures; limitar este processo preserva a quota do lote.
        & node --max-old-space-size=512 (Join-Path $repositoryRoot 'frontend/scripts/check-assessment-print.cjs')
    }

    Invoke-Validation 'Front-end: restauracao de sessao e console no Edge real' {
        & node (Join-Path $repositoryRoot 'frontend/scripts/check-session-restoration.cjs')
    }

    Invoke-Validation 'Front-end: publicacao pelo gestor no Edge com dados ficticios' {
        & node (Join-Path $repositoryRoot 'frontend/scripts/check-manager-publication.cjs')
    }

    Invoke-Validation 'Front-end: publicacao da propria autoavaliacao no Edge em DEV' {
        & node --max-old-space-size=512 (Join-Path $repositoryRoot 'frontend/scripts/check-self-assessment-publication.cjs')
    }

    Invoke-Validation 'Front-end: consulta de ciclos no Edge com dados ficticios' {
        & node (Join-Path $repositoryRoot 'frontend/scripts/check-cycle-configuration.cjs')
    }

    Invoke-Validation 'Back-end: SBOM e vulnerabilidades conhecidas' {
        if ([string]::IsNullOrWhiteSpace($BackendBuildDirectory)) {
            & (Join-Path $PSScriptRoot 'verify-java-dependencies.ps1')
        }
        else {
            & (Join-Path $PSScriptRoot 'verify-java-dependencies.ps1') `
                -BackendBuildDirectory $BackendBuildDirectory
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

    Approve-FrontendBuild -Directory $frontendStage.BuildDirectory
    Write-Output 'Gate local de qualidade concluido com sucesso.'
}
finally {
    foreach ($name in $previousFrontendEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousFrontendEnvironment[$name], 'Process')
    }
}

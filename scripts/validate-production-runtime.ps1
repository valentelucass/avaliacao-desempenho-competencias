[CmdletBinding()]
param(
    [string]$ConfigurationPath = $env:AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG,
    [string]$FrontendApiBaseUrl = $env:AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL,
    [string]$LogDirectory = $env:AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Value {
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$Value,
        [Parameter(Mandatory)][string]$VariableName
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Defina a variavel de ambiente $VariableName antes da publicacao."
    }
}

Require-Value -Value $ConfigurationPath -VariableName 'AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG'
Require-Value -Value $FrontendApiBaseUrl -VariableName 'AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL'
Require-Value -Value $LogDirectory -VariableName 'AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY'

function Assert-OutsideRepository {
    param(
        [Parameter(Mandatory)][System.IO.FileSystemInfo]$Item,
        [Parameter(Mandatory)][string]$Description
    )

    $repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    $itemFullPath = [System.IO.Path]::GetFullPath($Item.FullName)
    $repositoryPrefix = "$repositoryRoot$([System.IO.Path]::DirectorySeparatorChar)"
    if (
        $itemFullPath.Equals($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        $itemFullPath.StartsWith($repositoryPrefix, [System.StringComparison]::OrdinalIgnoreCase)
    ) {
        throw "$Description deve ficar fora do repositorio."
    }
}

try {
    $configurationFile = Get-Item -LiteralPath $ConfigurationPath -Force -ErrorAction Stop
} catch {
    throw 'O arquivo de configuracao externa de producao nao foi encontrado.'
}

if ($configurationFile.PSIsContainer -or $configurationFile.Extension -ine '.properties') {
    throw 'A configuracao externa de producao deve ser um arquivo .properties.'
}

Assert-OutsideRepository -Item $configurationFile -Description 'A configuracao de producao'

try {
    $logDirectoryItem = Get-Item -LiteralPath $LogDirectory -Force -ErrorAction Stop
} catch {
    throw 'O diretorio externo de logs de producao nao foi encontrado.'
}

if (-not $logDirectoryItem.PSIsContainer) {
    throw 'AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY deve apontar para um diretorio existente.'
}

Assert-OutsideRepository -Item $logDirectoryItem -Description 'O diretorio de logs de producao'

$apiUri = $null
if (-not [System.Uri]::TryCreate($FrontendApiBaseUrl, [System.UriKind]::Absolute, [ref]$apiUri)) {
    throw 'AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL deve ser uma URL HTTPS absoluta.'
}

if (
    $apiUri.Scheme -ne 'https' -or
    $apiUri.Host -ine 'api-formulario.rodogarcia.com.br' -or
    $apiUri.Port -ne 443 -or
    $apiUri.AbsolutePath.TrimEnd('/') -ne '/api/v1' -or
    -not [string]::IsNullOrEmpty($apiUri.Query) -or
    -not [string]::IsNullOrEmpty($apiUri.Fragment) -or
    -not [string]::IsNullOrEmpty($apiUri.UserInfo)
) {
    throw 'AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL deve apontar exclusivamente para https://api-formulario.rodogarcia.com.br/api/v1.'
}

Write-Output 'Configuracao externa, endpoint publico da API e diretorio de logs validados.'

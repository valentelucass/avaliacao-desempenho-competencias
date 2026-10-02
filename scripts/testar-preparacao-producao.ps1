[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'prepare-production-config.ps1')
. (Join-Path $PSScriptRoot 'production-config-status.ps1')

function Assert-Preparation {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}
function Invoke-ExpectedRefusal {
    param([scriptblock]$Action)
    $refused = $false
    try { & $Action | Out-Null } catch { $refused = $true }
    Assert-Preparation $refused 'Operacao insegura nao foi recusada.'
}

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('adc-config-test-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temporaryRoot)
try {
    $approvedRoot = Join-Path $temporaryRoot 'accepted'
    $config = Join-Path $approvedRoot 'production\avaliacao-prod.properties'
    $logs = Join-Path $approvedRoot 'logs'
    $output = New-IncompleteProductionConfiguration $approvedRoot $config $logs | Out-String
    Assert-Preparation ($output.Contains('INCOMPLETA')) 'Preparacao nao informou o estado incompleto.'
    Assert-Preparation (Test-ProductionConfigurationIncomplete $config) 'Marcador incompleto ausente.'
    foreach ($protectedPath in @($config, $logs, (Split-Path -Parent $config))) { Assert-PrivateAcl $protectedPath }
    $properties = [IO.File]::ReadAllLines($config)
    $encodedKey = ($properties | Where-Object { $_.StartsWith('app.security.authentication.hmac-secret-base64=') }).Split('=', 2)[1]
    $decodedKey = [Convert]::FromBase64String($encodedKey)
    Assert-Preparation ($decodedKey.Length -ge 32) 'Chave gerada abaixo do tamanho minimo.'
    Assert-Preparation ($properties -contains 'app.persistence.sqlserver.password=') 'Senha SQL deve permanecer ausente.'
    Assert-Preparation ($properties -contains 'app.persistence.sqlserver.username=rodogarcia_adc_app') 'Identidade dedicada incorreta.'
    Assert-Preparation (@($properties | Where-Object { $_ -like '*encrypt=true;trustServerCertificate=false' }).Count -eq 1) 'TLS SQL nao foi preservado.'
    Assert-Preparation (-not $output.Contains($encodedKey)) 'Saida revelou chave efemera de teste.'
    [Array]::Clear($decodedKey, 0, $decodedKey.Length)
    $encodedKey = $null
    $properties = $null

    $beforeHash = (Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash
    Invoke-ExpectedRefusal { New-IncompleteProductionConfiguration $approvedRoot $config $logs }
    Assert-Preparation ((Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash -eq $beforeHash) 'Arquivo existente foi alterado.'
    Invoke-ExpectedRefusal { New-IncompleteProductionConfiguration $approvedRoot (Join-Path $temporaryRoot 'outside.properties') $logs }
    Assert-Preparation (-not (Test-Path -LiteralPath (Join-Path $temporaryRoot 'outside.properties'))) 'Destino nao autorizado foi criado.'

    $existingRoot = Join-Path $temporaryRoot 'existing-logs'
    $existingLogs = Join-Path $existingRoot 'logs'
    [void][IO.Directory]::CreateDirectory($existingLogs)
    $existingAcl = (Get-Acl -LiteralPath $existingLogs).Sddl
    Invoke-ExpectedRefusal { New-IncompleteProductionConfiguration $existingRoot (Join-Path $existingRoot 'production\avaliacao-prod.properties') $existingLogs }
    Assert-Preparation ((Get-Acl -LiteralPath $existingLogs).Sddl -eq $existingAcl) 'ACL existente foi alterada.'

    & {
        function Test-Path { param($LiteralPath); return $true }
        function Get-Item { param($LiteralPath, [switch]$Force); return [pscustomobject]@{ Attributes = [IO.FileAttributes]::ReparsePoint } }
        Invoke-ExpectedRefusal { Assert-NoReparsePoint (Join-Path $temporaryRoot 'redirected') }
    }
    & {
        function Set-ProductionHmacEntropy { param($Buffer); throw 'Falha de entropia simulada.' }
        $failedRoot = Join-Path $temporaryRoot 'failed-entropy'
        $failedConfig = Join-Path $failedRoot 'production\avaliacao-prod.properties'
        Invoke-ExpectedRefusal { New-IncompleteProductionConfiguration $failedRoot $failedConfig (Join-Path $failedRoot 'logs') }
        Assert-Preparation (-not (Test-Path -LiteralPath $failedConfig)) 'Falha deixou arquivo final parcial.'
        $privateTemporaries = @(Get-ChildItem -LiteralPath (Split-Path -Parent $failedConfig) -Filter '*.preparing' -Force)
        Assert-Preparation ($privateTemporaries.Count -eq 0) 'Arquivo privado de preparacao nao foi limpo.'
    }
    & {
        function Write-ProductionConfigBytes {
            param($Stream, $Bytes)
            $Stream.Write($Bytes, 0, 8)
            throw 'Falha de escrita parcial simulada.'
        }
        $failedRoot = Join-Path $temporaryRoot 'failed-write'
        $failedConfig = Join-Path $failedRoot 'production\avaliacao-prod.properties'
        Invoke-ExpectedRefusal { New-IncompleteProductionConfiguration $failedRoot $failedConfig (Join-Path $failedRoot 'logs') }
        Assert-Preparation (-not (Test-Path -LiteralPath $failedConfig)) 'Escrita interrompida deixou arquivo final parcial.'
        Assert-Preparation (@(Get-ChildItem -LiteralPath (Split-Path -Parent $failedConfig) -Filter '*.preparing' -Force).Count -eq 0) 'Escrita interrompida deixou temporario.'
    }

    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $validationOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
            (Join-Path $PSScriptRoot 'validate-production-runtime.ps1') -ConfigurationPath $config `
            -LogDirectory $logs -FrontendApiBaseUrl 'https://api-formulario.rodogarcia.com.br/api/v1' 2>&1 | Out-String
        $validationExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    Assert-Preparation ($validationExit -ne 0 -and $validationOutput.Contains('INCOMPLETA')) 'Publicacao normal aceitou configuracao incompleta.'
    Write-Output 'Preparacao validada em TEMP: ACL privada, HMAC, senha SQL ausente, nao sobrescrita, destinos, reparse e bloqueio de publicacao.'
} finally {
    $resolvedRoot = [IO.Path]::GetFullPath($temporaryRoot)
    $temporaryPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolvedRoot.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        -not ([IO.Path]::GetFileName($resolvedRoot).StartsWith('adc-config-test-'))) {
        throw 'Alvo de limpeza de teste fora de TEMP. Remocao recusada.'
    }
    Assert-NoReparsePoint $resolvedRoot
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
}

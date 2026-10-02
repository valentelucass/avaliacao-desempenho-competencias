[CmdletBinding()]
param(
    [string]$ConfigurationPath = $env:AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG,
    [string]$FrontendApiBaseUrl = $env:AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL,
    [string]$LogDirectory = $env:AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$results = [Collections.Generic.List[object]]::new()

function Add-Check {
    param([string]$Name, [bool]$Passed, [string]$Detail)
    $results.Add([pscustomobject]@{ Name = $Name; Passed = $Passed; Detail = $Detail })
}

function Test-ExternalLocation {
    param([string]$Path, [bool]$Directory)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        $fullPath = [IO.Path]::GetFullPath($item.FullName)
        $insideRepository = $fullPath.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
            $fullPath.StartsWith($repositoryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
        return -not $insideRepository -and $item.PSIsContainer -eq $Directory -and
            ($Directory -or $item.Extension -ieq '.properties')
    } catch { return $false }
}

$configurationPresent = Test-ExternalLocation $ConfigurationPath $false
Add-Check 'Configuracao externa' $configurationPresent `
    'Exige arquivo .properties existente fora do repositorio; valores de credenciais nao sao lidos.'
if ($configurationPresent) {
    . (Join-Path $PSScriptRoot 'production-config-status.ps1')
    try {
        $incomplete = Test-ProductionConfigurationIncomplete -Path $ConfigurationPath
        Add-Check 'Configuracao preparada completa' (-not $incomplete) `
            'Marcador INCOMPLETA bloqueia a API ate validacao autorizada de credencial SQL, identidade e TLS.'
    } catch {
        Add-Check 'Configuracao preparada completa' $false 'Nao foi possivel ler o marcador; valores de credenciais nao foram expostos.'
    }
}
Add-Check 'Diretorio de logs' (Test-ExternalLocation $LogDirectory $true) `
    'Exige diretorio existente fora do repositorio; nenhum diretorio e criado.'

$apiUri = $null
$validApi = [Uri]::TryCreate($FrontendApiBaseUrl, [UriKind]::Absolute, [ref]$apiUri)
if ($validApi) {
    $validApi = $apiUri.Scheme -eq 'https' -and
        $apiUri.Host -ieq 'api-formulario.rodogarcia.com.br' -and $apiUri.Port -eq 443 -and
        $apiUri.AbsolutePath.TrimEnd('/') -eq '/api/v1' -and
        [string]::IsNullOrEmpty($apiUri.Query) -and [string]::IsNullOrEmpty($apiUri.Fragment) -and
        [string]::IsNullOrEmpty($apiUri.UserInfo)
}
Add-Check 'URL publica da API' $validApi 'Exige o endpoint HTTPS autorizado da API em /api/v1.'

$powershellCommand = Get-Command powershell.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$javaValid = $false
if ($null -ne $powershellCommand) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $null = & $powershellCommand.Source -NoProfile -ExecutionPolicy Bypass -File `
            (Join-Path $PSScriptRoot 'run-backend.ps1') -ValidateOnly 2>&1
        $javaValid = $LASTEXITCODE -eq 0
    } finally { $ErrorActionPreference = $previousPreference }
}
Add-Check 'JDK do processo' $javaValid 'Exige JAVA_HOME compativel; somente java -version e executado.'

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
Add-Check 'Node.js no PATH' ($null -ne $nodeCommand) 'Nenhum pacote e instalado.'
$pm2Command = Get-Command pm2 -ErrorAction SilentlyContinue | Select-Object -First 1
Add-Check 'PM2 no PATH' ($null -ne $pm2Command) 'A CLI do PM2 nao e executada durante --check.'
$pm2Accessible = $false
if ($null -ne $nodeCommand) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $probeOutput = & $nodeCommand.Source (Join-Path $PSScriptRoot 'check-pm2-access.cjs') --require-existing 2>&1
        $pm2Accessible = $LASTEXITCODE -eq 0
        if (-not $pm2Accessible) { $probeOutput | ForEach-Object { Write-Output ([string]$_) } }
    } finally { $ErrorActionPreference = $previousPreference }
}
Add-Check 'Canal do daemon PM2 existente' $pm2Accessible 'Nenhum daemon e iniciado ou reiniciado.'
Add-Check 'Lock do front-end' (Test-Path -LiteralPath (Join-Path $repositoryRoot 'frontend\package-lock.json') -PathType Leaf) `
    'Nenhum build ou npm ci e executado.'

try {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
        Where-Object { $_.LocalPort -in @(28081, 38080) })
    foreach ($port in @(28081, 38080)) {
        $portListeners = @($listeners | Where-Object { $_.LocalPort -eq $port })
        $present = $portListeners.Count -gt 0
        $outsideLoopback = @($portListeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }).Count -gt 0
        $detail = if ($outsideLoopback) {
            'Listener fora do loopback; exige revisao autorizada de bind e propriedade. Nenhum processo foi alterado.'
        } elseif ($present) {
            'Ocupada; exige conferencia da propriedade antes de publicar. Identidade e resposta nao verificadas.'
        } else {
            'Sem listener; porta disponivel. Isto nao comprova runtime saudavel.'
        }
        Add-Check "Porta privada $port" (-not $present) $detail
    }
    Add-Check 'Leitura das portas privadas' $true 'Presenca de listener nao comprova runtime saudavel ou propriedade do processo.'
} catch {
    Add-Check 'Leitura das portas privadas' $false 'Nao foi possivel consultar listeners; nenhum processo foi alterado.'
}

foreach ($result in $results) {
    $status = if ($result.Passed) { 'OK' } else { 'BLOQUEADO' }
    Write-Output "[Avaliacao PROD] ${status}: $($result.Name). $($result.Detail)"
}
Write-Output '[Avaliacao PROD] Diagnostico local somente leitura. SQL Server, credenciais, TLS SQL, runtime e Cloudflare Tunnel nao foram validados.'
if (@($results | Where-Object { -not $_.Passed }).Count -gt 0) { exit 1 }
exit 0

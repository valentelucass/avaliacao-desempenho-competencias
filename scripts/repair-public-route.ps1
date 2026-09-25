[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$Remove
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($CheckOnly -and $Remove) {
    throw 'Use apenas uma opcao por vez: -CheckOnly ou -Remove.'
}

$routes = @(
    [pscustomobject]@{
        Name = 'front-end'
        OldPort = 18080
        NewPort = 38080
        LocalUrl = 'http://127.0.0.1:38080/'
        OldUrl = 'http://127.0.0.1:18080/'
        PublicUrl = 'https://formulario.rodogarcia.com.br/'
    },
    [pscustomobject]@{
        Name = 'API'
        OldPort = 18081
        NewPort = 28081
        LocalUrl = 'http://127.0.0.1:28081/api/v1/auth/csrf'
        OldUrl = 'http://127.0.0.1:18081/api/v1/auth/csrf'
        PublicUrl = 'https://api-formulario.rodogarcia.com.br/api/v1/auth/csrf'
    }
)

function Get-HttpStatus {
    param([Parameter(Mandatory)][string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
        return [int]$response.StatusCode
    } catch {
        if ($null -ne $_.Exception.Response) {
            return [int]$_.Exception.Response.StatusCode
        }
        return 0
    }
}

function Assert-ElevatedSupportAccount {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Abra o PowerShell como administrador na conta suporte e execute novamente.'
    }
    if ($identity.Name -ine 'RTR-SVW-002\suporte') {
        throw "A conta atual e $($identity.Name). Use a conta RTR-SVW-002\suporte."
    }
}

function Get-BridgeRule {
    param(
        [Parameter(Mandatory)][ValidateSet('v4tov4', 'v6tov4')][string]$Type,
        [Parameter(Mandatory)][string]$ListenAddress,
        [Parameter(Mandatory)][int]$ListenPort
    )

    $output = (& netsh interface portproxy show $Type) -join "`n"
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao consultar as regras portproxy $Type."
    }

    $pattern = '(?m)^\s*' + [regex]::Escape($ListenAddress) + '\s+' + $ListenPort + '\s+(\S+)\s+(\d+)\s*$'
    $match = [regex]::Match($output, $pattern)
    if (-not $match.Success) {
        return $null
    }

    return [pscustomobject]@{
        ConnectAddress = $match.Groups[1].Value
        ConnectPort = [int]$match.Groups[2].Value
    }
}

function Set-BridgeRule {
    param(
        [Parameter(Mandatory)][ValidateSet('v4tov4', 'v6tov4')][string]$Type,
        [Parameter(Mandatory)][string]$ListenAddress,
        [Parameter(Mandatory)][pscustomobject]$Route
    )

    $existing = Get-BridgeRule -Type $Type -ListenAddress $ListenAddress -ListenPort $Route.OldPort
    if ($null -ne $existing) {
        if ($existing.ConnectAddress -ne '127.0.0.1' -or $existing.ConnectPort -ne $Route.NewPort) {
            throw "A porta $($Route.OldPort) ja possui uma regra $Type diferente. Nenhuma regra foi substituida."
        }
        Write-Host "Ponte $Type $($Route.OldPort) -> $($Route.NewPort) ja existe."
        return
    }

    $conflictingAddresses = if ($Type -eq 'v4tov4') {
        @('127.0.0.1', '0.0.0.0')
    } else {
        @('::1', '::')
    }
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Route.OldPort -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -in $conflictingAddresses }
    if ($null -ne $listener) {
        throw "A porta antiga $($Route.OldPort) ja esta ocupada. Nenhum processo sera encerrado."
    }

    & netsh interface portproxy add $Type "listenaddress=$ListenAddress" "listenport=$($Route.OldPort)" 'connectaddress=127.0.0.1' "connectport=$($Route.NewPort)"
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao criar a ponte $Type da porta $($Route.OldPort)."
    }
    Write-Host "Ponte $Type criada: $ListenAddress`:$($Route.OldPort) -> 127.0.0.1`:$($Route.NewPort)."
}

function Remove-BridgeRule {
    param(
        [Parameter(Mandatory)][ValidateSet('v4tov4', 'v6tov4')][string]$Type,
        [Parameter(Mandatory)][string]$ListenAddress,
        [Parameter(Mandatory)][pscustomobject]$Route
    )

    $existing = Get-BridgeRule -Type $Type -ListenAddress $ListenAddress -ListenPort $Route.OldPort
    if ($null -eq $existing) {
        return
    }
    if ($existing.ConnectAddress -ne '127.0.0.1' -or $existing.ConnectPort -ne $Route.NewPort) {
        throw "A regra $Type da porta $($Route.OldPort) foi alterada por outra pessoa. Remocao cancelada."
    }

    & netsh interface portproxy delete $Type "listenaddress=$ListenAddress" "listenport=$($Route.OldPort)"
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao remover a ponte $Type da porta $($Route.OldPort)."
    }
    Write-Host "Ponte $Type da porta $($Route.OldPort) removida."
}

function Test-PublicRoutes {
    param([switch]$Show)

    $statuses = @()
    foreach ($route in $routes) {
        $status = Get-HttpStatus -Url $route.PublicUrl
        $statuses += [pscustomobject]@{ Name = $route.Name; Status = $status; Url = $route.PublicUrl }
    }
    if ($Show) {
        $statuses | Format-Table -AutoSize | Out-Host
    }
    return @($statuses | Where-Object { $_.Status -ne 200 }).Count -eq 0
}

if ($Remove) {
    Assert-ElevatedSupportAccount
    foreach ($route in $routes) {
        Remove-BridgeRule -Type v4tov4 -ListenAddress '127.0.0.1' -Route $route
        Remove-BridgeRule -Type v6tov4 -ListenAddress '::1' -Route $route
    }
    exit 0
}

foreach ($route in $routes) {
    $status = Get-HttpStatus -Url $route.LocalUrl
    if ($status -ne 200) {
        throw "$($route.Name) local respondeu $status em $($route.LocalUrl). A ponte nao sera criada."
    }
}
Write-Host 'API e front-end locais responderam 200.'

if (Test-PublicRoutes -Show) {
    $bridgeActive = $false
    foreach ($route in $routes) {
        if ($null -ne (Get-BridgeRule -Type v4tov4 -ListenAddress '127.0.0.1' -ListenPort $route.OldPort)) {
            $bridgeActive = $true
        }
    }
    if ($bridgeActive) {
        Write-Host 'Os dois hosts publicos respondem 200 com a ponte local ativa.'
    } else {
        Write-Host 'Os dois hosts publicos respondem 200 sem ponte local.'
    }
    exit 0
}

if ($CheckOnly) {
    Write-Host 'Diagnostico concluido. Nenhuma regra foi alterada.'
    exit 0
}

Assert-ElevatedSupportAccount
$ipHelper = Get-Service -Name iphlpsvc -ErrorAction Stop
if ($ipHelper.Status -ne 'Running') {
    throw 'O servico IP Helper nao esta em execucao; o portproxy nao funcionara.'
}

foreach ($route in $routes) {
    Set-BridgeRule -Type v4tov4 -ListenAddress '127.0.0.1' -Route $route
}
Start-Sleep -Seconds 2
foreach ($route in $routes) {
    $status = Get-HttpStatus -Url $route.OldUrl
    if ($status -ne 200) {
        throw "A ponte local $($route.OldPort) -> $($route.NewPort) respondeu $status."
    }
}

for ($attempt = 1; $attempt -le 6; $attempt++) {
    if (Test-PublicRoutes) {
        Write-Host 'Acesso publico restabelecido. A ponte persiste apos reinicio do Windows.'
        exit 0
    }
    Start-Sleep -Seconds 3
}

# Se o tunnel usa localhost, a origem pode resolver para ::1 antes de 127.0.0.1.
foreach ($route in $routes) {
    Set-BridgeRule -Type v6tov4 -ListenAddress '::1' -Route $route
}
for ($attempt = 1; $attempt -le 6; $attempt++) {
    if (Test-PublicRoutes) {
        Write-Host 'Acesso publico restabelecido. A ponte persiste apos reinicio do Windows.'
        exit 0
    }
    Start-Sleep -Seconds 3
}

Test-PublicRoutes -Show | Out-Null
throw 'A ponte local funciona, mas os hosts publicos seguem indisponiveis. A rota remota do Cloudflare deve apontar para outra origem; a ponte ficou registrada para diagnostico.'

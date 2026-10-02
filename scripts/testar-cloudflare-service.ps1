Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$authorizedTunnelId = [Guid]'da4be1b8-b8dd-425b-b059-4702bf603471'
. (Join-Path $PSScriptRoot 'prepare-cloudflare-windows-service.ps1') -ExpectedTunnelId $authorizedTunnelId
$passed = 0
function Assert-Condition {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}
function Assert-Rejected {
    param([scriptblock]$Action)
    try { & $Action | Out-Null }
    catch { $script:passed++; return }
    throw 'Acao ficticia divergente nao recusada.'
}
$plan = Get-CloudflareServicePlan
Assert-Condition ($plan.ServiceName -ceq 'Cloudflared' -and
    $plan.BinPath.Contains('--token-file "C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\cloudflare-tunnel.token"') -and
    -not $plan.BinPath.Contains('--token ') -and $plan.BinPath.Contains('--metrics 127.0.0.1:0') -and
    $plan.BinPath.Contains('" tunnel --no-autoupdate') -and $plan.BinPath.Contains('--loglevel warn') -and
    $plan.BinPath.Contains('" run --token-file "')) 'Plano fixo ou flags divergentes.'
$passed++
Assert-Rejected { Assert-CloudflareServicePreflight -TunnelId ([Guid]'00000000-0000-4000-8000-000000000001') }

$fixtureSourceGuid = [Guid]'00000000-0000-4000-8000-000000000001'
$fixtureCurrentGuid = [Guid]'307c6e6f-185b-4e19-b354-5cbd5c37adcc'
Assert-CloudflareNewVmIdentity -SourceComputer 'RTR-SVW-002' -SourceMachineGuid $fixtureSourceGuid `
    -CurrentComputer 'ROD-SRVW-001' -CurrentMachineGuid $fixtureCurrentGuid `
    -ManifestTunnelId $authorizedTunnelId -TunnelId $authorizedTunnelId
$passed++
# A renamed VM keeps its authorized MachineGuid; another VM cannot reuse the name.
Assert-CloudflareNewVmIdentity -SourceComputer 'RTR-SVW-002' -SourceMachineGuid $fixtureSourceGuid `
    -CurrentComputer 'RENOMEADA-NOVAMENTE' -CurrentMachineGuid $fixtureCurrentGuid `
    -ManifestTunnelId $authorizedTunnelId -TunnelId $authorizedTunnelId
$passed++
foreach ($identity in @(
        @{ SourceComputer = 'RTR-SVW-002'; SourceMachineGuid = $fixtureSourceGuid; CurrentComputer = 'RTR-SVW-002'; CurrentMachineGuid = $fixtureCurrentGuid },
        @{ SourceComputer = 'RTR-SVW-002'; SourceMachineGuid = $fixtureSourceGuid; CurrentComputer = 'ROD-SRVW-001'; CurrentMachineGuid = $fixtureSourceGuid },
        @{ SourceComputer = 'RTR-SVW-002'; SourceMachineGuid = $fixtureSourceGuid; CurrentComputer = 'ROD-SRVW-001'; CurrentMachineGuid = [Guid]'00000000-0000-4000-8000-000000000002' },
        @{ SourceComputer = 'ORIGEM-INDEFINIDA'; SourceMachineGuid = $fixtureSourceGuid; CurrentComputer = 'ROD-SRVW-001'; CurrentMachineGuid = $fixtureCurrentGuid },
        @{ SourceComputer = 'RTR-SVW-002'; SourceMachineGuid = [Guid]::Empty; CurrentComputer = 'ROD-SRVW-001'; CurrentMachineGuid = $fixtureCurrentGuid },
        @{ SourceComputer = 'RTR-SVW-002'; SourceMachineGuid = $fixtureSourceGuid; CurrentComputer = 'ROD-SRVW-001'; CurrentMachineGuid = [Guid]::Empty }
    )) {
    Assert-Rejected { Assert-CloudflareNewVmIdentity @identity -ManifestTunnelId $authorizedTunnelId -TunnelId $authorizedTunnelId }
}
Assert-Rejected { Assert-CloudflareNewVmIdentity -SourceComputer 'RTR-SVW-002' -SourceMachineGuid $fixtureSourceGuid `
    -CurrentComputer 'ROD-SRVW-001' -CurrentMachineGuid $fixtureCurrentGuid `
    -ManifestTunnelId $fixtureSourceGuid -TunnelId $authorizedTunnelId }

$script:servicePresent = $false
$script:eventPresent = $false
$script:registeredService = $false
$script:registeredState = 'Stopped'
function Get-CimInstance {
    if ($script:registeredService) {
        return [pscustomobject]@{ Name = 'Cloudflared'; State = $script:registeredState; StartMode = 'Manual';
            ProcessId = 0; StartName = 'LocalSystem'; PathName = (Get-CloudflareServicePlan).BinPath }
    }
    if ($script:servicePresent) { return [pscustomobject]@{ Name = 'Cloudflared' } }
}
function Test-Path { return $script:eventPresent }
Assert-CloudflareServiceAbsent
$passed++
$script:servicePresent = $true
Assert-Rejected { Assert-CloudflareServiceAbsent }
$script:servicePresent = $false
$script:eventPresent = $true
Assert-Rejected { Assert-CloudflareServiceAbsent }
$script:eventPresent = $false
Remove-Item Function:\Test-Path

$script:operations = @()
$script:failCreate = $false
function Assert-CloudflareServiceAdministrativeConsole { $script:operations += 'admin' }
function Assert-CloudflareServicePreflight { param([Guid]$TunnelId); $script:operations += 'preflight'; return Get-CloudflareServicePlan }
function Assert-CloudflareServiceAbsent { $script:operations += 'absent' }
function New-EventLog { param($LogName, $Source, $ErrorAction); $script:operations += ('event:' + $Source) }
function New-Service {
    param($Name, $BinaryPathName, $DisplayName, $Description, $StartupType, $ErrorAction)
    $script:operations += ('service:' + $Name + ':' + $StartupType)
    if ($script:failCreate) { throw 'Falha ficticia ao criar servico.' }
    $script:registeredService = $true
}
$script:originalReceipt = (Get-Item Function:\Save-CloudflareServiceReceipt).ScriptBlock
function Save-CloudflareServiceReceipt { param($Plan, [Guid]$TunnelId); $script:operations += 'receipt' }
function Start-Service { throw 'Teste nao autoriza iniciar servico.' }
function Stop-Service { throw 'Teste nao autoriza parar servico.' }
function Set-Service { throw 'Teste nao autoriza configurar outro servico.' }
$result = Register-CloudflareStoppedService -TunnelId $authorizedTunnelId
Assert-Condition (($script:operations -join ',') -ceq 'admin,preflight,absent,event:Cloudflared,service:Cloudflared:Manual,receipt') `
    'Ordem de registro ou inicializacao manual divergente.'
Assert-Condition ($result.RegistrationCreated -and -not $result.ConnectorStarted -and -not $result.ExistingStandaloneStopped) `
    'O registro iniciou conector ou parou processo.'
$passed++
$script:operations = @()
$script:failCreate = $true
Assert-Rejected { Register-CloudflareStoppedService -TunnelId $authorizedTunnelId }
Assert-Condition (-not ($script:operations -contains 'receipt')) 'Falha de criacao marcou registro concluido.'
$script:failCreate = $false
$script:registeredState = 'Running'
$script:operations = @()
Assert-Rejected { Register-CloudflareStoppedService -TunnelId $authorizedTunnelId }
Assert-Condition (-not ($script:operations -contains 'receipt')) 'Estado SCM divergente publicou recibo.'
$script:registeredState = 'Stopped'
function Assert-CloudflareServiceAdministrativeConsole { throw 'Console ficticio nao elevado.' }
$script:operations = @()
Assert-Rejected { Register-CloudflareStoppedService -TunnelId $authorizedTunnelId }
Assert-Condition ($script:operations.Count -eq 0) 'Console sem administracao alterou recursos.'

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
$testRoot = Join-Path $tempBase ('adc-cloudflare-service-test-' + [Guid]::NewGuid().ToString('N'))
try {
    $directoryAcl = [Security.AccessControl.DirectorySecurity]::new()
    $directoryAcl.SetAccessRuleProtection($true, $false)
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $directoryAcl.SetOwner($currentSid)
    foreach ($sid in @($currentSid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
        $directoryAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
                [Security.Principal.SecurityIdentifier]::new($sid), [Security.AccessControl.FileSystemRights]::FullControl,
                ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
                [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
    }
    [void][IO.Directory]::CreateDirectory($testRoot, $directoryAcl)
    Set-Item Function:\Save-CloudflareServiceReceipt -Value $script:originalReceipt
    $fixturePlan = Get-CloudflareServicePlan
    $fixturePlan.Receipt = Join-Path $testRoot 'fixture-registration.json'
    Save-CloudflareServiceReceipt -Plan $fixturePlan -TunnelId ([Guid]'00000000-0000-4000-8000-000000000001')
    Assert-CloudflarePrivateAcl -Path $fixturePlan.Receipt
    $metadata = [IO.File]::ReadAllText($fixturePlan.Receipt) | ConvertFrom-Json
    Assert-Condition ($metadata.StartupType -ceq 'Manual' -and -not $metadata.ConnectorStarted) 'Recibo ficticio divergente.'
    $passed++
    $before = (Get-FileHash -LiteralPath $fixturePlan.Receipt -Algorithm SHA256).Hash
    Assert-Rejected { Save-CloudflareServiceReceipt -Plan $fixturePlan -TunnelId $authorizedTunnelId }
    Assert-Condition ((Get-FileHash -LiteralPath $fixturePlan.Receipt -Algorithm SHA256).Hash -eq $before) `
        'Recibo ficticio sobrescrito.'
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    if (Test-Path -LiteralPath $testRoot) {
        $item = Get-Item -LiteralPath $testRoot -Force
        if (-not $resolved.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
            ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Limpeza temporaria recusada.' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
Write-Host "Servico Cloudflare: $passed cenarios ficticios aprovados; SCM/eventos/processos/rede reais nao alterados."

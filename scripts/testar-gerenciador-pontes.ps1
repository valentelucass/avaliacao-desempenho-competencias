Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'manage-formulario-loopback-bridges.ps1')
$passed = 0
function Assert-Condition { param([bool]$Condition, [string]$Message); if (-not $Condition) { throw $Message } }
function Assert-Rejected {
    param([scriptblock]$Action)
    try { & $Action | Out-Null } catch { $script:passed++; return }
    throw 'Acao ficticia divergente foi permitida.'
}
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
$testRoot = Join-Path $tempBase ('adc-loopback-manager-test-' + [Guid]::NewGuid().ToString('N'))
try {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($currentSid)
    foreach ($sid in @($currentSid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
                [Security.Principal.SecurityIdentifier]::new($sid), [Security.AccessControl.FileSystemRights]::FullControl,
                ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
                [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
    }
    [void][IO.Directory]::CreateDirectory($testRoot, $acl)
    $script:bridgeDirectory = Join-Path $testRoot 'runtime'
    [void][IO.Directory]::CreateDirectory($script:bridgeDirectory, $acl)
    $script:bridgeReceipt = Join-Path $script:bridgeDirectory 'current.json'
    $file = Join-Path $script:bridgeDirectory 'fixture.txt'
    Save-BridgePrivateBytes -Path $file -Bytes ([Text.Encoding]::ASCII.GetBytes('FIXTURE'))
    Assert-CloudflarePrivateAcl -Path $file
    $passed++
    Assert-Rejected { Save-BridgePrivateBytes -Path $file -Bytes ([Text.Encoding]::ASCII.GetBytes('OTHER')) }
    Assert-Condition ([IO.File]::ReadAllText($file) -ceq 'FIXTURE') 'Arquivo privado sobrescrito.'

    $script:listenerTable = @()
    function Get-BridgeListeners { param([int]$Port); return @($script:listenerTable | Where-Object LocalPort -eq $Port) }
    Assert-BridgePorts
    $passed++
    $script:listenerTable = @([pscustomobject]@{ LocalPort = 18080; LocalAddress = '127.0.0.1'; OwningProcess = 100001 })
    Assert-Rejected { Assert-BridgePorts }
    Assert-Rejected { Assert-BridgePorts -OwnPid 100002 }
    $script:listenerTable += [pscustomobject]@{ LocalPort = 18081; LocalAddress = '0.0.0.0'; OwningProcess = 100001 }
    Assert-Rejected { Assert-BridgePorts -OwnPid 100001 }
    $script:listenerTable[1].LocalAddress = '127.0.0.1'
    Assert-BridgePorts -OwnPid 100001
    $passed++

    function Assert-CloudflareServiceVmTarget { throw 'VM ficticia recusada.' }
    Assert-Rejected { Start-FormularioLoopbackBridges -FrontPid 0 -ApiPid 100004 }
    Assert-Rejected { Start-FormularioLoopbackBridges -FrontPid 100003 -ApiPid 100004 }
    function Assert-CloudflareServiceVmTarget {}
    function Assert-BridgeOriginListeners { throw 'Origem ficticia sem200.' }
    Assert-Rejected { Start-FormularioLoopbackBridges -FrontPid 100003 -ApiPid 100004 }
    Assert-Condition (-not (Test-Path -LiteralPath $script:bridgeReceipt)) 'Guard escreveu recibo ou iniciou processo.'

    function Assert-BridgeOriginListeners {}
    function Test-BridgeOrigin {}
    $script:fakeProcess = [pscustomobject]@{ Id = 100001; StartTime = [DateTime]::Now; Path = $script:bridgeNode; HasExited = $false }
    $script:fakeProcess | Add-Member -MemberType ScriptMethod -Name Refresh -Value {}
    $script:startCalls = 0
    $script:stopCalls = @()
    $script:listenerTable = @()
    function Start-Process {
        $script:startCalls++
        $script:listenerTable = @(
            [pscustomobject]@{ LocalPort = 18080; LocalAddress = '127.0.0.1'; OwningProcess = 100001 },
            [pscustomobject]@{ LocalPort = 18081; LocalAddress = '127.0.0.1'; OwningProcess = 100001 }
        )
        return $script:fakeProcess
    }
    function Stop-Process { param($InputObject, $ErrorAction); $script:stopCalls += $InputObject.Id }
    $result = Start-FormularioLoopbackBridges -FrontPid 100003 -ApiPid 100004
    Assert-Condition ($result.Created -and $result.ListenersVerified -and $script:startCalls -eq 1 -and
        $script:stopCalls.Count -eq 0) 'Inicio simulado ou identidade de listeners divergente.'
    Assert-CloudflarePrivateAcl -Path $script:bridgeReceipt
    $metadata = [IO.File]::ReadAllText($script:bridgeReceipt) | ConvertFrom-Json
    Assert-Condition ($metadata.Pid -eq 100001 -and $metadata.FrontPid -eq 100003 -and
        $metadata.ApiPid -eq 100004 -and $metadata.Mappings.Count -eq 2) 'Recibo simulado incorreto.'
    $passed++
    $script:originalOwned = (Get-Item Function:\Get-BridgeOwnedProcess).ScriptBlock
    function Get-BridgeOwnedProcess { return $script:fakeProcess }
    $again = Start-FormularioLoopbackBridges -FrontPid 100003 -ApiPid 100004
    Assert-Condition ($again.AlreadyRunning -and -not $again.Created -and $script:startCalls -eq 1) 'Reexecucao nao idempotente.'
    $passed++
    Set-Item Function:\Get-BridgeOwnedProcess -Value $script:originalOwned
    $script:listenerTable = @()
    function Test-BridgeOrigin { throw 'Falha ficticia pos-start.' }
    Assert-Rejected { Start-FormularioLoopbackBridges -FrontPid 100003 -ApiPid 100004 }
    Assert-Condition ($script:stopCalls.Count -eq 1 -and $script:stopCalls[0] -eq 100001) `
        'Rollback nao ficou limitado ao processo simulado criado.'

    # Nenhum start/stop real acima: prova de recibo com PID real e timestamp divergente.
    $selfProcess = Get-Process -Id $PID
    $script:bridgeNode = $selfProcess.Path
    $metadata.Pid = $PID
    $metadata.NodePath = $selfProcess.Path
    $metadata.StartUtc = $selfProcess.StartTime.ToUniversalTime().AddSeconds(-1).ToString('o')
    $script:bridgeReceipt = Join-Path $script:bridgeDirectory 'wrong-start.json'
    Save-BridgePrivateBytes -Path $script:bridgeReceipt -Bytes ([Text.UTF8Encoding]::new($false).GetBytes(($metadata | ConvertTo-Json -Depth 4)))
    Assert-Condition ($null -eq (Get-BridgeOwnedProcess)) 'PID reutilizado foi considerado proprio.'
    Assert-Condition (-not $selfProcess.HasExited) 'Processo real do teste foi alterado.'
    $passed++
    $metadata.StartUtc = $selfProcess.StartTime.ToUniversalTime().ToString('o')
    $script:bridgeReceipt = Join-Path $script:bridgeDirectory 'wrong-module.json'
    Save-BridgePrivateBytes -Path $script:bridgeReceipt -Bytes ([Text.UTF8Encoding]::new($false).GetBytes(($metadata | ConvertTo-Json -Depth 4)))
    Assert-Condition ($null -eq (Get-BridgeOwnedProcess)) 'Outro modulo/linha de comando foi considerado ponte propria.'
    $passed++
    function Get-CimInstance { return [pscustomobject]@{ CommandLine = ('"{0}" "{1}"' -f $script:bridgeNode, $metadata.ModulePath) } }
    Assert-Condition ((Get-BridgeOwnedProcess).Id -eq $PID) 'Recibo/modulo/identidade simulados nao foram reconhecidos.'
    Assert-Condition (-not $selfProcess.HasExited) 'Reconhecimento de identidade simulada alterou processo real.'
    $passed++
    Write-Host "Gerenciador de pontes: $passed cenarios ficticios aprovados; nenhum start/stop de processo real ou porta produtiva."
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    if (Test-Path -LiteralPath $testRoot) {
        $item = Get-Item -LiteralPath $testRoot -Force
        if (-not $resolved.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
            ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Limpeza temporaria recusada.' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

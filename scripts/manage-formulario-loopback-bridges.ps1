[CmdletBinding()]
param(
    [ValidateSet('CheckOnly', 'Start', 'Status', 'StopOwned')]
    [string]$Mode = 'CheckOnly',
    [int]$ExpectedFrontPid = 0,
    [int]$ExpectedApiPid = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'prepare-cloudflare-windows-service.ps1') `
    -ExpectedTunnelId ([Guid]'da4be1b8-b8dd-425b-b059-4702bf603471')
$script:bridgeDirectory = 'C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\formulario-loopback-bridges'
$script:bridgeReceipt = Join-Path $script:bridgeDirectory 'current.json'
$script:bridgeNode = 'C:\Program Files\nodejs\node.exe'
$script:bridgeSource = Join-Path $PSScriptRoot 'formulario-https-loopback-bridges.cjs'

function New-BridgeFileSecurity {
    $acl = [Security.AccessControl.FileSecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($currentSid)
    foreach ($sid in @($currentSid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
                [Security.Principal.SecurityIdentifier]::new($sid),
                [Security.AccessControl.FileSystemRights]::FullControl,
                [Security.AccessControl.AccessControlType]::Allow))
    }
    return $acl
}

function Save-BridgePrivateBytes {
    param([string]$Path, [byte[]]$Bytes)
    Assert-CloudflareServicePath -Path $Path
    Assert-CloudflarePrivateAcl -Path (Split-Path -Parent $Path)
    $stream = [IO.FileStream]::new($Path, [IO.FileMode]::CreateNew,
        [Security.AccessControl.FileSystemRights]::Write, [IO.FileShare]::None,
        4096, [IO.FileOptions]::WriteThrough, (New-BridgeFileSecurity))
    try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
}

function Test-BridgeOrigin {
    param([int]$Port, [string]$Path)
    $request = [Net.HttpWebRequest]::Create(('http://127.0.0.1:{0}{1}' -f $Port, $Path))
    $request.Proxy = $null
    $request.AllowAutoRedirect = $false
    $request.Timeout = 3000
    $request.ReadWriteTimeout = 3000
    $response = $null
    try {
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -ne 200) { throw 'Status da origem invalido.' }
    } catch { throw 'Origem local ainda sem HTTP 200; nenhuma ponte iniciada.' }
    finally { if ($null -ne $response) { $response.Close() } }
}

function Assert-BridgeOriginListeners {
    param([int]$FrontPid, [int]$ApiPid)
    foreach ($origin in @(@{ Port = 38080; Pid = $FrontPid }, @{ Port = 28081; Pid = $ApiPid })) {
        $listeners = @(Get-BridgeListeners -Port $origin.Port)
        if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -cne '127.0.0.1' -or
            ($origin.Pid -gt 0 -and $listeners[0].OwningProcess -ne $origin.Pid)) {
            throw 'Origem nao confirmou listener exclusivo loopback/PID esperado.'
        }
    }
    Test-BridgeOrigin -Port 38080 -Path '/'
    Test-BridgeOrigin -Port 28081 -Path '/api/v1/auth/csrf'
}

function Get-BridgeListeners {
    param([int]$Port)
    try {
        return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq $Port)
    } catch { throw 'Inventario de listeners indisponivel; nao presumir porta livre.' }
}

function Get-BridgeOwnedProcess {
    if (-not (Test-Path -LiteralPath $script:bridgeReceipt)) { return $null }
    Assert-CloudflareServicePath -Path $script:bridgeDirectory
    Assert-CloudflarePrivateAcl -Path $script:bridgeDirectory
    Assert-CloudflarePrivateAcl -Path $script:bridgeReceipt
    try {
        $receipt = [IO.File]::ReadAllText($script:bridgeReceipt, [Text.UTF8Encoding]::new($false, $true)) | ConvertFrom-Json
        $pidNumber = [int]$receipt.Pid
        $startTicks = [DateTimeOffset]::Parse([string]$receipt.StartUtc).UtcDateTime.Ticks
        $moduleHash = [string]$receipt.ModuleSha256
        $module = Join-Path $script:bridgeDirectory ('bridge-' + $moduleHash + '.cjs')
        if ($pidNumber -lt 1 -or $moduleHash -cnotmatch '^[0-9a-f]{64}$' -or
            $receipt.NodePath -cne $script:bridgeNode -or $receipt.ModulePath -cne $module) {
            throw 'Recibo invalido.'
        }
        Assert-CloudflareServicePath -Path $module
        Assert-CloudflarePrivateAcl -Path $module
        if ((Get-FileHash -LiteralPath $module -Algorithm SHA256).Hash -ine $moduleHash) { throw 'Modulo divergente.' }
    } catch { throw 'Recibo privado ou artefato de ponte invalido; valores omitidos.' }
    $process = Get-Process -Id $pidNumber -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $null }
    if ($process.Path -ine $script:bridgeNode -or $process.StartTime.ToUniversalTime().Ticks -ne $startTicks) {
        return $null
    }
    # Conferir o modulo tambem evita tratar outro Node como ponte por um recibo incorreto.
    $commandLine = $null
    try {
        $commandLine = (Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $pidNumber) -ErrorAction Stop).CommandLine
        $expectedCommand = '^"?' + [regex]::Escape($script:bridgeNode) + '"?\s+"?' + [regex]::Escape($module) + '"?\s*$'
        if ([string]::IsNullOrWhiteSpace($commandLine) -or $commandLine.Length -gt 16384 -or
            $commandLine -inotmatch $expectedCommand) { return $null }
    } catch { throw 'Identidade do modulo do processo proprio indisponivel; conteudo omitido.' }
    finally { $commandLine = $null }
    return $process
}

function Assert-BridgePorts {
    param([int]$OwnPid = 0)
    foreach ($port in @(18080, 18081)) {
        $listeners = @(Get-BridgeListeners -Port $port)
        if ($OwnPid -eq 0 -and $listeners.Count -ne 0) { throw 'Porta de ponte ocupada; nenhum processo preexistente sera alterado.' }
        if ($OwnPid -gt 0 -and ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -cne '127.0.0.1' -or
                $listeners[0].OwningProcess -ne $OwnPid)) { throw 'Ponte propria nao confirmou os dois listeners exclusivos loopback.' }
    }
}

function Start-FormularioLoopbackBridges {
    param([int]$FrontPid, [int]$ApiPid)
    if ($FrontPid -lt 1 -or $ApiPid -lt 1) { throw 'Start exige os PIDs atuais das duas origens.' }
    Assert-CloudflareServiceVmTarget -TunnelId ([Guid]'da4be1b8-b8dd-425b-b059-4702bf603471')
    foreach ($name in @('NODE_OPTIONS', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_USE_ENV_PROXY')) {
        if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name, 'Process'))) {
            throw 'Ambiente Node pode alterar listeners/proxy/logs; preservar ambiente global e revisar antes de iniciar.'
        }
    }
    Assert-BridgeOriginListeners -FrontPid $FrontPid -ApiPid $ApiPid
    $own = Get-BridgeOwnedProcess
    if ($null -ne $own) {
        Assert-BridgePorts -OwnPid $own.Id
        return [pscustomobject]@{ AlreadyRunning = $true; Pid = $own.Id; Created = $false; ListenersVerified = $true }
    }
    Assert-BridgePorts
    Assert-CloudflareServicePath -Path $script:bridgeNode
    Assert-CloudflareServicePath -Path $script:bridgeDirectory
    Assert-CloudflarePrivateAcl -Path (Split-Path -Parent $script:bridgeDirectory)
    if (-not (Test-Path -LiteralPath $script:bridgeDirectory)) {
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
        [void][IO.Directory]::CreateDirectory($script:bridgeDirectory, $acl)
    }
    Assert-CloudflarePrivateAcl -Path $script:bridgeDirectory
    $moduleHash = (Get-FileHash -LiteralPath $script:bridgeSource -Algorithm SHA256).Hash.ToLowerInvariant()
    $module = Join-Path $script:bridgeDirectory ('bridge-' + $moduleHash + '.cjs')
    if (-not (Test-Path -LiteralPath $module)) {
        Save-BridgePrivateBytes -Path $module -Bytes ([IO.File]::ReadAllBytes($script:bridgeSource))
    }
    Assert-CloudflarePrivateAcl -Path $module
    if ((Get-FileHash -LiteralPath $module -Algorithm SHA256).Hash -ine $moduleHash) { throw 'Copia privada do modulo divergente.' }
    if (Test-Path -LiteralPath $script:bridgeReceipt) {
        # Somente recibo proprio validado e sem processo correspondente; preserva o historico.
        [IO.File]::Move($script:bridgeReceipt, ($script:bridgeReceipt + '.previous-' + [Guid]::NewGuid().ToString('N')))
    }
    $instance = [Guid]::NewGuid().ToString('N')
    $stdout = Join-Path $script:bridgeDirectory ('stdout-' + $instance + '.log')
    $stderr = Join-Path $script:bridgeDirectory ('stderr-' + $instance + '.log')
    Save-BridgePrivateBytes -Path $stdout -Bytes ([byte[]]@())
    Save-BridgePrivateBytes -Path $stderr -Bytes ([byte[]]@())
    $process = $null
    $start = $null
    try {
        $process = Start-Process -FilePath $script:bridgeNode -ArgumentList ('"' + $module + '"') `
            -WorkingDirectory $script:bridgeDirectory -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        $start = $process.StartTime.ToUniversalTime()
        $ready = $false
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            $process.Refresh()
            if ($process.HasExited) { throw 'Processo proprio terminou antes da prontidao.' }
            try { Assert-BridgePorts -OwnPid $process.Id; $ready = $true; break }
            catch { Start-Sleep -Milliseconds 250 }
        }
        if (-not $ready) { throw 'Listeners proprios nao confirmados no prazo.' }
        Test-BridgeOrigin -Port 18080 -Path '/'
        Test-BridgeOrigin -Port 18081 -Path '/api/v1/auth/csrf'
        Assert-BridgeOriginListeners -FrontPid $FrontPid -ApiPid $ApiPid
        $receipt = [ordered]@{ Pid = $process.Id; StartUtc = $start.ToString('o'); NodePath = $script:bridgeNode;
            ModulePath = $module; ModuleSha256 = $moduleHash; FrontPid = $FrontPid; ApiPid = $ApiPid;
            Mappings = @(@{ Listen = '127.0.0.1:18080'; Target = '127.0.0.1:38080' },
                @{ Listen = '127.0.0.1:18081'; Target = '127.0.0.1:28081' }) }
        $preparing = $script:bridgeReceipt + '.preparing-' + $instance
        Save-BridgePrivateBytes -Path $preparing -Bytes ([Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json -Depth 4)))
        [IO.File]::Move($preparing, $script:bridgeReceipt)
        return [pscustomobject]@{ AlreadyRunning = $false; Pid = $process.Id; Created = $true; ListenersVerified = $true;
            FrontHttp = 200; ApiCsrfHttp = 200; Receipt = $script:bridgeReceipt }
    } catch {
        if ($null -ne $process -and $null -ne $start) {
            $process.Refresh()
            if (-not $process.HasExited -and $process.Path -ieq $script:bridgeNode -and
                $process.StartTime.ToUniversalTime().Ticks -eq $start.Ticks) {
                Stop-Process -InputObject $process -ErrorAction Stop
            }
        } elseif ($null -ne $process) {
            throw ('Processo novo PID {0} sem identidade de inicio confirmada; preservar e revisar, sem parada nao verificada. Logs privados preservados.' -f $process.Id)
        }
        throw 'Ponte nova nao confirmou prontidao; somente o processo criado foi elegivel para rollback. Logs privados preservados.'
    }
}

if ($MyInvocation.InvocationName -eq '.') { return }
Assert-CloudflareServiceVmTarget -TunnelId ([Guid]'da4be1b8-b8dd-425b-b059-4702bf603471')
switch ($Mode) {
    'Start' { Start-FormularioLoopbackBridges -FrontPid $ExpectedFrontPid -ApiPid $ExpectedApiPid | ConvertTo-Json -Depth 3 }
    'StopOwned' {
        $own = Get-BridgeOwnedProcess
        if ($null -eq $own) { throw 'Nenhuma ponte propria ativa foi confirmada; nenhum processo sera parado.' }
        Stop-Process -InputObject $own -ErrorAction Stop
        [pscustomobject]@{ StoppedOwnPid = $own.Id; OtherProcessesChanged = $false } | ConvertTo-Json
    }
    'Status' {
        $own = Get-BridgeOwnedProcess
        if ($null -ne $own) { Assert-BridgePorts -OwnPid $own.Id }
        [pscustomobject]@{ OwnProcessConfirmed = ($null -ne $own); Pid = $(if ($null -eq $own) { $null } else { $own.Id }) } | ConvertTo-Json
    }
    default {
        Assert-BridgeOriginListeners -FrontPid $ExpectedFrontPid -ApiPid $ExpectedApiPid
        $own = Get-BridgeOwnedProcess
        if ($null -eq $own) { Assert-BridgePorts } else { Assert-BridgePorts -OwnPid $own.Id }
        [pscustomobject]@{ Ready = $true; DefaultIsCheckOnly = $true; ProcessCreated = $false; SqlOrGlobalNetworkChanged = $false } | ConvertTo-Json
    }
}

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ $_ -ne [Guid]::Empty })]
    [Guid]$ExpectedTunnelId,
    [switch]$InstallStopped
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'import-cloudflare-tunnel-token.ps1') -ExpectedTunnelId $ExpectedTunnelId -ValidateOnly

function Assert-CloudflareNewVmIdentity {
    param(
        [string]$SourceComputer, [Guid]$SourceMachineGuid,
        [string]$CurrentComputer, [Guid]$CurrentMachineGuid,
        [Guid]$ManifestTunnelId, [Guid]$TunnelId
    )
    if ($SourceComputer -cne 'RTR-SVW-002' -or $SourceMachineGuid -eq [Guid]::Empty -or
        $CurrentMachineGuid -eq [Guid]::Empty -or $ManifestTunnelId -ne $TunnelId -or
        $TunnelId -ne [Guid]'da4be1b8-b8dd-425b-b059-4702bf603471') {
        throw 'Identidade da origem, manifesto ou tunel autorizado divergente.'
    }
    if ($CurrentComputer -ieq $SourceComputer -or $CurrentMachineGuid -eq $SourceMachineGuid) {
        throw 'A maquina de origem e bloqueada; nao contornar o preparador.'
    }
    if ($CurrentMachineGuid -ne [Guid]'307c6e6f-185b-4e19-b354-5cbd5c37adcc') {
        throw 'A instalacao atende somente a nova VM autorizada.'
    }
}

function Assert-CloudflareServiceVmTarget {
    param([Parameter(Mandatory)][Guid]$TunnelId)
    Assert-CloudflarePackageSource -PackageDirectory 'C:\CloudflareMigracao'
    try {
        $manifest = [IO.File]::ReadAllText('C:\CloudflareMigracao\manifesto.json',
            [Text.UTF8Encoding]::new($false, $true)) | ConvertFrom-Json -ErrorAction Stop
        $sourceNameProperty = $manifest.PSObject.Properties['SourceComputer']
        $sourceGuidProperty = $manifest.PSObject.Properties['SourceMachineGuid']
        $tunnelProperty = $manifest.PSObject.Properties['TunnelId']
        $sourceGuid = [Guid]::Empty
        $manifestTunnelId = [Guid]::Empty
        $currentGuid = [Guid]::Empty
        if ($null -eq $sourceNameProperty -or $null -eq $sourceGuidProperty -or $null -eq $tunnelProperty -or
            -not [Guid]::TryParse([string]$sourceGuidProperty.Value, [ref]$sourceGuid) -or
            -not [Guid]::TryParse([string]$tunnelProperty.Value, [ref]$manifestTunnelId)) {
            throw 'Identidade invalida.'
        }
        $currentGuidValue = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' `
                -Name MachineGuid -ErrorAction Stop).MachineGuid
        if (-not [Guid]::TryParse([string]$currentGuidValue, [ref]$currentGuid)) { throw 'Identidade invalida.' }
    } catch { throw 'Identidade local ou manifesto privado indisponivel/invalido; valores omitidos.' }
    Assert-CloudflareNewVmIdentity -SourceComputer ([string]$sourceNameProperty.Value) -SourceMachineGuid $sourceGuid `
        -CurrentComputer ([Environment]::MachineName) -CurrentMachineGuid $currentGuid `
        -ManifestTunnelId $manifestTunnelId -TunnelId $TunnelId
}

function Assert-CloudflareServicePath {
    param([Parameter(Mandatory)][string]$Path)
    $ancestor = [IO.Path]::GetFullPath($Path)
    while (-not [string]::IsNullOrWhiteSpace($ancestor)) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force -ErrorAction Stop
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Caminho do servico ou ancestral reparse point recusado.'
            }
        }
        $parent = Split-Path -Parent $ancestor
        if ($parent -eq $ancestor) { break }
        $ancestor = $parent
    }
}

function Get-CloudflareServicePlan {
    $baseDirectory = 'C:\ProgramData\Rodogarcia\AvaliacaoDesempenho'
    $executable = Join-Path $baseDirectory 'cloudflared\cloudflared-2026.9.3-windows-amd64.exe'
    $tokenFile = Join-Path $baseDirectory 'production\cloudflare-tunnel.token'
    $logFile = Join-Path $baseDirectory 'logs\cloudflared-windows-service.log'
    $receipt = Join-Path $baseDirectory 'production\cloudflare-service-registration.json'
    return [pscustomobject]@{
        ServiceName = 'Cloudflared'
        EventSource = 'Cloudflared'
        Executable = $executable
        ExecutableSha256 = 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2'
        TokenFile = $tokenFile
        LogFile = $logFile
        Receipt = $receipt
        BinPath = ('"{0}" tunnel --no-autoupdate --metrics 127.0.0.1:0 --loglevel warn --logfile "{1}" run --token-file "{2}"' -f
            $executable, $logFile, $tokenFile)
    }
}

function Assert-CloudflareServiceAbsent {
    $services = @(Get-CimInstance -ClassName Win32_Service -Filter "Name='Cloudflared'" -ErrorAction Stop)
    if ($services.Count -ne 0) { throw 'Servico Cloudflared preexistente recusado; nenhuma alteracao permitida.' }
    if (Test-Path -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application\Cloudflared') {
        throw 'Fonte de eventos Cloudflared preexistente recusada; nenhuma sobrescrita permitida.'
    }
}

function Assert-CloudflareServicePreflight {
    param([Parameter(Mandatory)][Guid]$TunnelId)
    if ($TunnelId -ne [Guid]'da4be1b8-b8dd-425b-b059-4702bf603471') {
        throw 'O preparador atende somente o tunel existente autorizado.'
    }
    Assert-CloudflareServiceVmTarget -TunnelId $TunnelId
    $plan = Get-CloudflareServicePlan
    foreach ($path in @($plan.Executable, $plan.TokenFile, $plan.LogFile, $plan.Receipt)) {
        Assert-CloudflareServicePath -Path $path
    }
    foreach ($path in @((Split-Path -Parent $plan.Executable), (Split-Path -Parent $plan.TokenFile),
            (Split-Path -Parent $plan.LogFile), $plan.TokenFile)) {
        Assert-CloudflarePrivateAcl -Path $path
    }
    $executable = Get-Item -LiteralPath $plan.Executable -ErrorAction Stop
    $credential = Get-Item -LiteralPath $plan.TokenFile -ErrorAction Stop
    if ($executable.PSIsContainer -or $credential.PSIsContainer -or
        $credential.Length -lt 1 -or $credential.Length -gt 8192) {
        throw 'Executavel ou arquivo de credencial recusado.'
    }
    if ((Get-FileHash -LiteralPath $plan.Executable -Algorithm SHA256).Hash -ine $plan.ExecutableSha256) {
        throw 'Hash do executavel difere do release oficial autorizado.'
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $plan.Executable
    if ($signature.Status -ne [Management.Automation.SignatureStatus]::Valid -or
        $signature.SignerCertificate.Thumbprint -ine '0B6C68C4BAD79F9AC39E07FE84223FB796D4D0BC') {
        throw 'Assinatura do executavel difere do artefato Cloudflare verificado.'
    }
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('TUNNEL_TOKEN', 'Machine')) -or
        -not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('TUNNEL_TOKEN', 'Process'))) {
        throw 'TUNNEL_TOKEN presente; nao alterar ambiente global nem substituir token-file.'
    }
    foreach ($path in @($plan.LogFile, $plan.Receipt)) {
        if (Test-Path -LiteralPath $path) { throw 'Log ou recibo de registro preexistente; nenhuma sobrescrita permitida.' }
    }
    Assert-CloudflareServiceAbsent
    $plain = $null
    $secure = $null
    $validated = $null
    try {
        try { $plain = [IO.File]::ReadAllText($plan.TokenFile, [Text.UTF8Encoding]::new($false, $true)).Trim() }
        catch { throw 'Arquivo de credencial ilegivel ou UTF-8 invalido; conteudo omitido.' }
        $secure = ConvertTo-SecureString -String $plain -AsPlainText -Force
        $validated = Get-ValidatedCloudflareTokenBytes -SecureToken $secure -TunnelId $TunnelId
    } finally {
        if ($null -ne $validated) { [Array]::Clear($validated, 0, $validated.Length) }
        if ($null -ne $secure) { $secure.Dispose() }
        $plain = $null
    }
    return $plan
}

function Save-CloudflareServiceReceipt {
    param([Parameter(Mandatory)][object]$Plan, [Parameter(Mandatory)][Guid]$TunnelId)
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
    $metadata = [ordered]@{
        ServiceName = $Plan.ServiceName
        ExpectedTunnelId = $TunnelId.ToString('D')
        Executable = $Plan.Executable
        ExecutableSha256 = $Plan.ExecutableSha256
        BinPathWithoutCredentials = $Plan.BinPath
        EventSourceCreated = $true
        InstalledAt = [DateTimeOffset]::Now.ToString('o')
        StartupType = 'Manual'
        ConnectorStarted = $false
    }
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($metadata | ConvertTo-Json -Depth 3))
    $preparing = $Plan.Receipt + '.preparing-' + [Guid]::NewGuid().ToString('N')
    $stream = $null
    try {
        Assert-CloudflareServicePath -Path $Plan.Receipt
        Assert-CloudflarePrivateAcl -Path (Split-Path -Parent $Plan.Receipt)
        if (Test-Path -LiteralPath $Plan.Receipt) { throw 'Recibo preexistente recusado.' }
        $stream = [IO.FileStream]::new($preparing, [IO.FileMode]::CreateNew,
            [Security.AccessControl.FileSystemRights]::Write, [IO.FileShare]::None, 4096,
            [IO.FileOptions]::WriteThrough, $acl)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
        $stream.Dispose()
        $stream = $null
        [IO.File]::Move($preparing, $Plan.Receipt)
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

function Assert-CloudflareServiceAdministrativeConsole {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Instalacao parada exige console Windows PowerShell administrativo; nao abrir UAC automaticamente.'
    }
}

function Assert-CloudflareRegisteredServiceStopped {
    param([Parameter(Mandatory)][object]$Plan)
    $services = @(Get-CimInstance -ClassName Win32_Service -Filter "Name='Cloudflared'" -ErrorAction Stop)
    if ($services.Count -ne 1 -or $services[0].State -cne 'Stopped' -or
        $services[0].StartMode -cne 'Manual' -or $services[0].ProcessId -ne 0 -or
        $services[0].StartName -cne 'LocalSystem' -or $services[0].PathName -cne $Plan.BinPath) {
        throw 'Registro SCM nao confirmou alvo exato, conta SYSTEM, Manual e parado; conteudo omitido.'
    }
}

function Register-CloudflareStoppedService {
    param([Parameter(Mandatory)][Guid]$TunnelId)
    Assert-CloudflareServiceAdministrativeConsole
    $plan = Assert-CloudflareServicePreflight -TunnelId $TunnelId
    # Repetir guard antes do SCM. Nao chamar service install: ele inicia automaticamente.
    Assert-CloudflareServiceAbsent
    try {
        [void](New-EventLog -LogName Application -Source $plan.EventSource -ErrorAction Stop)
        [void](New-Service -Name $plan.ServiceName -BinaryPathName $plan.BinPath -DisplayName 'Cloudflared agent' `
                -Description 'Conector do tunel Cloudflare existente; credencial em arquivo privado.' `
                -StartupType Manual -ErrorAction Stop)
        Assert-CloudflareRegisteredServiceStopped -Plan $plan
        Save-CloudflareServiceReceipt -Plan $plan -TunnelId $TunnelId
    } catch {
        throw 'Registro incompleto: fonte de eventos ou servico podem existir, sem recibo final. Reexecucao sera recusada; revisar os artefatos novos manualmente. Nenhum start/stop/limpeza automatico foi feito.'
    }
    return [pscustomobject]@{
        ServiceName = $plan.ServiceName
        RegistrationCreated = $true
        StartupType = 'Manual'
        ConnectorStarted = $false
        ExistingStandaloneStopped = $false
        Receipt = $plan.Receipt
        NextStep = 'Validar o servico iniciado e ingress antes de Automatic e de encerrar o PID standalone proprio.'
    }
}

if ($MyInvocation.InvocationName -eq '.') { return }
if ($InstallStopped) {
    Register-CloudflareStoppedService -TunnelId $ExpectedTunnelId | ConvertTo-Json -Depth 3
} else {
    $plan = Assert-CloudflareServicePreflight -TunnelId $ExpectedTunnelId
    [pscustomobject]@{
        ExpectedTunnelId = $ExpectedTunnelId.ToString('D')
        ReadyForAdministrativeRegistration = $true
        ServiceName = $plan.ServiceName
        IntendedStartupType = 'Manual'
        DefaultIsCheckOnly = $true
        ScmChanged = $false
        ConnectorStarted = $false
        ExistingStandaloneStopped = $false
    } | ConvertTo-Json -Depth 3
}

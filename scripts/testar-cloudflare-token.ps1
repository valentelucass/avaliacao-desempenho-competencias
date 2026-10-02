[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$fixtureTunnelId = [Guid]'00000000-0000-4000-8000-000000000001'
. (Join-Path $PSScriptRoot 'save-cloudflare-tunnel-token.ps1') -ExpectedTunnelId $fixtureTunnelId

function Assert-Condition {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Assert-Rejected {
    param([scriptblock]$Action, [string]$ExpectedMessage)
    $rejected = $false
    try { & $Action } catch {
        $rejected = $true
        Assert-Condition -Condition ($_.Exception.Message -match $ExpectedMessage) `
            -Message 'Rejeicao sem o motivo seguro esperado.'
    }
    Assert-Condition -Condition $rejected -Message 'A operacao deveria ter sido recusada.'
}

function New-FakeSecureToken {
    param([string]$Json)
    # Credenciais estruturalmente ficticias; nunca enviadas a cloudflared ou a rede.
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Json))
    return (ConvertTo-SecureString -String $encoded -AsPlainText -Force)
}

function Set-TestPrivateDirectoryAcl {
    param([string]$Path)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sidText in @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
                [Security.Principal.SecurityIdentifier]::new($sidText),
                [Security.AccessControl.FileSystemRights]::FullControl,
                [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
                [Security.AccessControl.InheritanceFlags]::ObjectInherit,
                [Security.AccessControl.PropagationFlags]::None,
                [Security.AccessControl.AccessControlType]::Allow))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
$testRoot = Join-Path $tempBase ('adc-cloudflare-token-test-' + [Guid]::NewGuid().ToString('N'))
if (-not $testRoot.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath $testRoot)) {
    throw 'Diretorio temporario de teste invalido.'
}
[void][IO.Directory]::CreateDirectory($testRoot)
$junction = Join-Path $testRoot 'junction'
$passed = 0
$account = '0' * 32
$fakeSecret = [Convert]::ToBase64String([byte[]](0..31))
$validJson = [ordered]@{ a = $account; s = $fakeSecret; t = $fixtureTunnelId.ToString('D') } |
    ConvertTo-Json -Compress

try {
    foreach ($case in @(
            @{ Name = 'valido'; Json = $validJson },
            @{ Name = 'segredo-36-bytes'; Json = ([ordered]@{
                    a = $account; s = [Convert]::ToBase64String([byte[]](0..35)); t = $fixtureTunnelId.ToString('D')
                } | ConvertTo-Json -Compress) },
            @{ Name = 'endpoint-opcional'; Json = ($validJson.Substring(0, $validJson.Length - 1) + ',"e":"example.invalid"}') }
        )) {
        $directory = Join-Path $testRoot $case.Name
        [void][IO.Directory]::CreateDirectory($directory)
        Set-TestPrivateDirectoryAcl -Path $directory
        $path = Join-Path $directory 'cloudflare-tunnel.token'
        $secure = New-FakeSecureToken -Json $case.Json
        try {
            $output = @(Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $fixtureTunnelId `
                    -Path $path -ProductionDirectory $directory)
            Assert-Condition -Condition ($output.Count -eq 0) -Message 'A gravacao nao deve emitir a credencial.'
            Assert-CloudflarePrivateAcl -Path $path
            $savedBytes = [IO.File]::ReadAllBytes($path)
            $expectedBytes = [Text.Encoding]::ASCII.GetBytes(
                [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($case.Json)))
            Assert-Condition -Condition ([Convert]::ToBase64String($savedBytes) -ceq
                [Convert]::ToBase64String($expectedBytes)) -Message 'Conteudo ficticio salvo diverge.'
            $beforeHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
            Assert-Rejected -Action {
                Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $fixtureTunnelId `
                    -Path $path -ProductionDirectory $directory
            } -ExpectedMessage 'ja existe'
            Assert-Condition -Condition ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -eq $beforeHash) `
                -Message 'Arquivo preexistente foi alterado.'
            $passed += 2
        } finally { $secure.Dispose() }
    }

    $directory = Join-Path $testRoot 'rejeicoes'
    [void][IO.Directory]::CreateDirectory($directory)
    Set-TestPrivateDirectoryAcl -Path $directory
    $path = Join-Path $directory 'cloudflare-tunnel.token'
    $invalidCases = @(
        @{ Json = ($validJson -replace '000000000001', '000000000002'); Reason = 'outro tunel' },
        @{ Json = '{"a":"invalido","s":"AA==","t":"invalido"}'; Reason = 'obrigatorios' },
        @{ Json = ($validJson.Substring(0, $validJson.Length - 1) + ',"a":"' + $account + '"}'); Reason = 'duplicado' },
        @{ Json = ($validJson.Substring(0, $validJson.Length - 1) + ',"x":"extra"}'); Reason = 'desconhecido' },
        @{ Json = '{"a":"' + $account + '","s":"AA==","t":"' + $fixtureTunnelId.ToString('D') + '"}'; Reason = 'Tamanho' },
        @{ Json = ([ordered]@{
                a = $account; s = [Convert]::ToBase64String([byte[]](0..30)); t = $fixtureTunnelId.ToString('D')
            } | ConvertTo-Json -Compress); Reason = 'Tamanho' },
        @{ Json = '{"a":"' + $account + '","t":"' + $fixtureTunnelId.ToString('D') + '"}'; Reason = 'obrigatorios' },
        @{ Json = '{invalid-json'; Reason = 'Estrutura' }
    )
    foreach ($case in $invalidCases) {
        $secure = New-FakeSecureToken -Json $case.Json
        try {
            Assert-Rejected -Action {
                Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $fixtureTunnelId `
                    -Path $path -ProductionDirectory $directory
            } -ExpectedMessage $case.Reason
            Assert-Condition -Condition (-not (Test-Path -LiteralPath $path)) -Message 'Token invalido criou arquivo.'
            $passed++
        } finally { $secure.Dispose() }
    }

    foreach ($text in @('cloudflared service install NAO-E-UM-TOKEN', 'invalid-base64', '')) {
        $secure = [Security.SecureString]::new()
        foreach ($character in $text.ToCharArray()) { $secure.AppendChar($character) }
        try {
            Assert-Rejected -Action {
                Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $fixtureTunnelId `
                    -Path $path -ProductionDirectory $directory
            } -ExpectedMessage 'somente|tamanho'
            $passed++
        } finally { $secure.Dispose() }
    }

    $secure = New-FakeSecureToken -Json $validJson
    try {
        Assert-Rejected -Action {
            Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $fixtureTunnelId `
                -Path (Join-Path $testRoot 'fora.token') -ProductionDirectory $directory
        } -ExpectedMessage 'fora'
        $passed++

        $publicDirectory = Join-Path $testRoot 'acl-nao-restrita'
        [void][IO.Directory]::CreateDirectory($publicDirectory)
        Assert-Rejected -Action {
            Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $fixtureTunnelId `
                -Path (Join-Path $publicDirectory 'cloudflare-tunnel.token') -ProductionDirectory $publicDirectory
        } -ExpectedMessage 'ACL'
        $passed++

        New-Item -ItemType Junction -Path $junction -Target $directory | Out-Null
        Assert-Rejected -Action {
            Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $fixtureTunnelId `
                -Path (Join-Path $junction 'cloudflare-tunnel.token') -ProductionDirectory $junction
        } -ExpectedMessage 'reparse'
        $passed++
    } finally { $secure.Dispose() }

    $failureDirectory = Join-Path $testRoot 'falha-antes-escrita'
    [void][IO.Directory]::CreateDirectory($failureDirectory)
    Set-TestPrivateDirectoryAcl -Path $failureDirectory
    $failurePath = Join-Path $failureDirectory 'cloudflare-tunnel.token'
    $script:originalPrivateAcl = (Get-Item Function:\Assert-CloudflarePrivateAcl).ScriptBlock
    function Assert-CloudflarePrivateAcl {
        param([string]$Path)
        & $script:originalPrivateAcl -Path $Path
        if ($Path -like '*.preparing-*') { throw 'Falha ficticia depois da ACL e antes da escrita.' }
    }
    $secure = New-FakeSecureToken -Json $validJson
    try {
        Assert-Rejected -Action {
            Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $fixtureTunnelId `
                -Path $failurePath -ProductionDirectory $failureDirectory
        } -ExpectedMessage 'Falha ficticia'
        Assert-Condition -Condition (-not (Test-Path -LiteralPath $failurePath)) `
            -Message 'Falha anterior a escrita deixou o arquivo final.'
        $preparing = @(Get-ChildItem -LiteralPath $failureDirectory -Filter '*.preparing-*' -File)
        Assert-Condition -Condition ($preparing.Count -eq 1 -and $preparing[0].Length -eq 0) `
            -Message 'A falha deve preservar somente a preparacao privada sem dados.'
        & $script:originalPrivateAcl -Path $preparing[0].FullName
        $passed++
    } finally {
        Set-Item -Path Function:\Assert-CloudflarePrivateAcl -Value $script:originalPrivateAcl
        $secure.Dispose()
    }

    $raceDirectory = Join-Path $testRoot 'concorrencia-destino'
    [void][IO.Directory]::CreateDirectory($raceDirectory)
    Set-TestPrivateDirectoryAcl -Path $raceDirectory
    $racePath = Join-Path $raceDirectory 'cloudflare-tunnel.token'
    $script:originalDestination = (Get-Item Function:\Assert-CloudflareTokenDestination).ScriptBlock
    $script:destinationChecks = 0
    function Assert-CloudflareTokenDestination {
        param([string]$Path, [string]$ProductionDirectory)
        & $script:originalDestination -Path $Path -ProductionDirectory $ProductionDirectory
        $script:destinationChecks++
        if ($script:destinationChecks -eq 3) {
            [IO.File]::WriteAllText($Path, 'arquivo-ficticio-preexistente')
        }
    }
    $secure = New-FakeSecureToken -Json $validJson
    try {
        Assert-Rejected -Action {
            Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $fixtureTunnelId `
                -Path $racePath -ProductionDirectory $raceDirectory
        } -ExpectedMessage '.'
        Assert-Condition -Condition ([IO.File]::ReadAllText($racePath) -ceq 'arquivo-ficticio-preexistente') `
            -Message 'A publicacao da credencial sobrescreveu destino surgido durante a preparacao.'
        $preparing = @(Get-ChildItem -LiteralPath $raceDirectory -Filter '*.preparing-*' -File)
        Assert-Condition -Condition ($preparing.Count -eq 1 -and $preparing[0].Length -gt 0) `
            -Message 'A falha de publicacao deve preservar a preparacao completa e privada.'
        Assert-CloudflarePrivateAcl -Path $preparing[0].FullName
        $passed++
    } finally {
        Set-Item -Path Function:\Assert-CloudflareTokenDestination -Value $script:originalDestination
        $secure.Dispose()
    }

    . (Join-Path $PSScriptRoot 'import-cloudflare-tunnel-token.ps1') -ExpectedTunnelId $fixtureTunnelId -ValidateOnly
    $sourceDirectory = Join-Path $testRoot 'import-origem'
    $destinationDirectory = Join-Path $testRoot 'import-destino'
    foreach ($dir in @($sourceDirectory, $destinationDirectory)) {
        [void][IO.Directory]::CreateDirectory($dir)
        Set-TestPrivateDirectoryAcl -Path $dir
    }
    $manifestPath = Join-Path $sourceDirectory 'manifesto.json'
    [IO.File]::WriteAllText($manifestPath, (@{ TunnelId = $fixtureTunnelId.ToString('D') } | ConvertTo-Json))
    $sourceTokenPath = Join-Path $sourceDirectory 'SECRETO-token.txt'
    [IO.File]::WriteAllText($sourceTokenPath, [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($validJson)))
    $destinationPath = Join-Path $destinationDirectory 'cloudflare-tunnel.token'
    $result = Import-CloudflareTunnelToken -PackageDirectory $sourceDirectory -ProductionDirectory $destinationDirectory `
        -TunnelId $fixtureTunnelId -CheckOnly
    Assert-Condition -Condition ($result.TokenIdentityAndStructureValidated -and -not $result.CredentialWritten -and
        -not (Test-Path -LiteralPath $destinationPath)) -Message 'ValidateOnly alterou o destino.'
    $passed++
    $result = Import-CloudflareTunnelToken -PackageDirectory $sourceDirectory -ProductionDirectory $destinationDirectory `
        -TunnelId $fixtureTunnelId
    Assert-Condition -Condition $result.CredentialWritten -Message 'Importacao ficticia nao concluida.'
    Assert-CloudflarePrivateAcl -Path $destinationPath
    $beforeHash = (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash
    $passed++
    Assert-Rejected -Action {
        Import-CloudflareTunnelToken -PackageDirectory $sourceDirectory -ProductionDirectory $destinationDirectory `
            -TunnelId $fixtureTunnelId
    } -ExpectedMessage 'ja existe'
    Assert-Condition -Condition ((Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash -eq $beforeHash) `
        -Message 'Reimportacao substituiu arquivo preexistente.'
    $passed++
    Assert-Rejected -Action {
        Import-CloudflareTunnelToken -PackageDirectory $sourceDirectory -ProductionDirectory $destinationDirectory `
            -TunnelId ([Guid]'00000000-0000-4000-8000-000000000002') -CheckOnly
    } -ExpectedMessage 'Manifesto'
    $passed++
    Assert-Rejected -Action {
        Import-CloudflareTunnelToken -PackageDirectory $junction -ProductionDirectory $destinationDirectory `
            -TunnelId $fixtureTunnelId -CheckOnly
    } -ExpectedMessage 'reparse'
    $passed++
    $sourceAcl = Get-Acl -LiteralPath $sourceTokenPath
    $sourceAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            [Security.Principal.SecurityIdentifier]::new('S-1-1-0'),
            [Security.AccessControl.FileSystemRights]::Read,
            [Security.AccessControl.AccessControlType]::Allow))
    Set-Acl -LiteralPath $sourceTokenPath -AclObject $sourceAcl
    Assert-Rejected -Action {
        Import-CloudflareTunnelToken -PackageDirectory $sourceDirectory -ProductionDirectory $destinationDirectory `
            -TunnelId $fixtureTunnelId -CheckOnly
    } -ExpectedMessage 'grants'
    $passed++

    Write-Host "Credencial Cloudflare: $passed cenarios ficticios aprovados; nenhuma chamada externa ou credencial real."
} finally {
    if (Test-Path -LiteralPath $junction) {
        $item = Get-Item -LiteralPath $junction -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
            throw 'Limpeza recusada: a junction de teste mudou.'
        }
        [IO.Directory]::Delete($junction)
    }
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $item = Get-Item -LiteralPath $testRoot -Force
    if (-not $resolved.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Limpeza recusada: destino fora do temporario autorizado.'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ $_ -ne [Guid]::Empty })]
    [Guid]$ExpectedTunnelId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-CloudflarePrivateAcl {
    param([Parameter(Mandatory)][string]$Path)

    $acl = Get-Acl -LiteralPath $Path
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $allowedSids = @($currentSid, 'S-1-5-18', 'S-1-5-32-544')
    if (-not $acl.AreAccessRulesProtected -or $acl.Access.Count -ne 3) {
        throw 'O destino precisa de ACL privada sem heranca: conta atual, SYSTEM e Administrators.'
    }
    $seen = @()
    foreach ($rule in $acl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($sid -notin $allowedSids -or $sid -in $seen -or
            $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
            $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
            throw 'A ACL do destino nao corresponde aos tres principals autorizados.'
        }
        $seen += $sid
    }
}

function Assert-CloudflareTokenDestination {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ProductionDirectory
    )

    $directory = [IO.Path]::GetFullPath($ProductionDirectory).TrimEnd('\', '/')
    $expectedPath = Join-Path $directory 'cloudflare-tunnel.token'
    if ([IO.Path]::GetFullPath($Path) -ine $expectedPath) {
        throw 'Destino fora do arquivo de credencial permitido.'
    }
    if (Test-Path -LiteralPath $Path) {
        throw 'A credencial ja existe. Nenhum arquivo sera sobrescrito.'
    }
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        throw 'Diretorio protegido de producao ausente. Prepare-o antes de salvar a credencial.'
    }
    $ancestor = $directory
    while (-not [string]::IsNullOrWhiteSpace($ancestor)) {
        $item = Get-Item -LiteralPath $ancestor -Force -ErrorAction Stop
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'Destino ou ancestral reparse point recusado.'
        }
        $parent = Split-Path -Parent $ancestor
        if ($parent -eq $ancestor) { break }
        $ancestor = $parent
    }
    Assert-CloudflarePrivateAcl -Path $directory
}

function Get-ValidatedCloudflareTokenBytes {
    param(
        [Parameter(Mandatory)][Security.SecureString]$SecureToken,
        [Parameter(Mandatory)][Guid]$TunnelId
    )

    $bstr = [IntPtr]::Zero
    $decoded = $null
    $secretBytes = $null
    $plainText = $null
    $json = $null
    $fields = @{}
    try {
        if ($TunnelId -eq [Guid]::Empty -or $SecureToken.Length -lt 1 -or $SecureToken.Length -gt 8192) {
            throw 'ID esperado ou tamanho da credencial invalido.'
        }
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
        $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
        if ($plainText.Length -eq 0 -or $plainText.Length % 4 -ne 0 -or
            $plainText -cnotmatch '^[A-Za-z0-9+/]+={0,2}$') {
            throw 'Informe somente o token Base64 do tunel, sem comando ou argumentos.'
        }
        try {
            $decoded = [Convert]::FromBase64String($plainText)
            $json = [Text.UTF8Encoding]::new($false, $true).GetString($decoded)
        } catch {
            throw 'Credencial Base64 ou UTF-8 invalida.'
        }

        # cloudflared 2026.9.3: connection.TunnelToken usa a, s, t e e opcional.
        # Validar a estrutura antes de interpretar valores evita erros JSON com o segredo na mensagem.
        $jsonString = '"(?:[^\x00-\x1f"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"'
        $property = '"(?<key>[aste])"\s*:\s*(?<value>' + $jsonString + ')'
        $objectPattern = '^\s*\{\s*' + $property + '(?:\s*,\s*' + $property + ')*\s*\}\s*$'
        $timeout = [TimeSpan]::FromSeconds(1)
        $options = [Text.RegularExpressions.RegexOptions]::CultureInvariant
        $objectRegex = [Text.RegularExpressions.Regex]::new($objectPattern, $options, $timeout)
        $propertyRegex = [Text.RegularExpressions.Regex]::new($property, $options, $timeout)
        try {
            if (-not $objectRegex.IsMatch($json)) {
                throw 'Estrutura JSON do token invalida ou campo desconhecido.'
            }
            foreach ($match in $propertyRegex.Matches($json)) {
                $key = $match.Groups['key'].Value
                if ($fields.ContainsKey($key)) {
                    throw 'Campo duplicado no token recusado.'
                }
                $quoted = $match.Groups['value'].Value
                $fields[$key] = $quoted.Substring(1, $quoted.Length - 2)
            }
        } catch [Text.RegularExpressions.RegexMatchTimeoutException] {
            throw 'Tempo limite ao validar a estrutura da credencial.'
        }
        if (-not $fields.ContainsKey('a') -or -not $fields.ContainsKey('s') -or -not $fields.ContainsKey('t') -or
            $fields['a'] -cnotmatch '^[0-9a-fA-F]{32}$' -or
            $fields['t'] -cnotmatch '^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' -or
            $fields['s'] -cnotmatch '^[A-Za-z0-9+/]+={0,2}$') {
            throw 'Campos obrigatorios do token invalidos.'
        }
        if ([Guid]::Parse($fields['t']) -ne $TunnelId) {
            throw 'O token pertence a outro tunel. Nenhum arquivo foi gravado.'
        }
        try { $secretBytes = [Convert]::FromBase64String($fields['s']) } catch {
            throw 'Segredo interno do token invalido.'
        }
        # A API Cloudflare exige ao menos 32 bytes; tokens existentes podem usar mais.
        if ($secretBytes.Length -lt 32) {
            throw 'Tamanho do segredo interno do token invalido (minimo 32 bytes).'
        }
        return ,([Text.Encoding]::ASCII.GetBytes($plainText))
    } finally {
        if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
        if ($null -ne $decoded) { [Array]::Clear($decoded, 0, $decoded.Length) }
        if ($null -ne $secretBytes) { [Array]::Clear($secretBytes, 0, $secretBytes.Length) }
        $fields.Clear()
        $plainText = $null
        $json = $null
    }
}

function Save-CloudflareTunnelToken {
    param(
        [Parameter(Mandatory)][Security.SecureString]$SecureToken,
        [Parameter(Mandatory)][Guid]$TunnelId,
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ProductionDirectory
    )

    Assert-CloudflareTokenDestination -Path $Path -ProductionDirectory $ProductionDirectory
    $bytes = $null
    $stream = $null
    try {
        $bytes = Get-ValidatedCloudflareTokenBytes -SecureToken $SecureToken -TunnelId $TunnelId
        $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $security = [Security.AccessControl.FileSecurity]::new()
        $security.SetOwner($currentSid)
        $security.SetAccessRuleProtection($true, $false)
        foreach ($sidText in @($currentSid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
            $sid = [Security.Principal.SecurityIdentifier]::new($sidText)
            $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
                    $sid, [Security.AccessControl.FileSystemRights]::FullControl,
                    [Security.AccessControl.AccessControlType]::Allow))
        }
        # A preparacao privada impede que falha de escrita deixe uma credencial final parcial.
        # FileSecurity aplica a DACL antes de qualquer byte; Move nao substitui destino existente.
        Assert-CloudflareTokenDestination -Path $Path -ProductionDirectory $ProductionDirectory
        $preparedPath = [IO.Path]::GetFullPath($Path) + '.preparing-' + [Guid]::NewGuid().ToString('N')
        $stream = [IO.FileStream]::new(
            $preparedPath, [IO.FileMode]::CreateNew, [Security.AccessControl.FileSystemRights]::Write,
            [IO.FileShare]::None, 4096, [IO.FileOptions]::None, $security)
        Assert-CloudflarePrivateAcl -Path $preparedPath
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
        $stream.Dispose()
        $stream = $null
        Assert-CloudflareTokenDestination -Path $Path -ProductionDirectory $ProductionDirectory
        [IO.File]::Move($preparedPath, [IO.Path]::GetFullPath($Path))
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    }
}

# Dot-source e reservado aos testes locais das funcoes; nunca solicita ou grava credencial.
if ($MyInvocation.InvocationName -eq '.') { return }

$productionDirectory = 'C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production'
$destination = Join-Path $productionDirectory 'cloudflare-tunnel.token'
Assert-CloudflareTokenDestination -Path $destination -ProductionDirectory $productionDirectory
$secureToken = Read-Host 'Token do tunel EXISTENTE (somente valor, entrada oculta)' -AsSecureString
try {
    Save-CloudflareTunnelToken -SecureToken $secureToken -TunnelId $ExpectedTunnelId `
        -Path $destination -ProductionDirectory $productionDirectory
    Write-Host 'Credencial salva com acesso restrito. Nenhum tunel, servico ou aplicacao foi iniciado.'
} finally {
    if ($null -ne $secureToken) { $secureToken.Dispose() }
}

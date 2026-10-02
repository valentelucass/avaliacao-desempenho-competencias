[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ $_ -ne [Guid]::Empty })]
    [Guid]$ExpectedTunnelId,
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'save-cloudflare-tunnel-token.ps1') -ExpectedTunnelId $ExpectedTunnelId

function Assert-CloudflarePackageSource {
    param([Parameter(Mandatory)][string]$PackageDirectory)

    $directory = [IO.Path]::GetFullPath($PackageDirectory).TrimEnd('\', '/')
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        throw 'Pacote privado ausente.'
    }
    $ancestor = $directory
    while (-not [string]::IsNullOrWhiteSpace($ancestor)) {
        $item = Get-Item -LiteralPath $ancestor -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'Origem ou ancestral reparse point recusado.'
        }
        $parent = Split-Path -Parent $ancestor
        if ($parent -eq $ancestor) { break }
        $ancestor = $parent
    }
    Assert-CloudflarePrivateAcl -Path $directory
    $allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
    foreach ($name in @('manifesto.json', 'SECRETO-token.txt')) {
        $path = Join-Path $directory $name
        $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
            $item.Length -lt 1 -or $item.Length -gt 16384) {
            throw 'Arquivo de origem recusado por tipo, tamanho ou reparse point.'
        }
        # Arquivos extraidos podem herdar somente os tres grants da pasta privada.
        $acl = Get-Acl -LiteralPath $path
        $seen = @()
        foreach ($rule in $acl.Access) {
            $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            if ($sid -notin $allowed -or $sid -in $seen -or
                $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
                $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
                throw 'Arquivo de origem sem os grants privados esperados.'
            }
            $seen += $sid
        }
        if ($seen.Count -ne 3 -or
            $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed) {
            throw 'ACL ou proprietario do arquivo de origem recusado.'
        }
    }
}

function Import-CloudflareTunnelToken {
    param(
        [Parameter(Mandatory)][string]$PackageDirectory,
        [Parameter(Mandatory)][string]$ProductionDirectory,
        [Parameter(Mandatory)][Guid]$TunnelId,
        [switch]$CheckOnly
    )

    Assert-CloudflarePackageSource -PackageDirectory $PackageDirectory
    if ($TunnelId -eq [Guid]::Empty) { throw 'ID esperado do tunel ausente.' }
    try {
        $manifest = [IO.File]::ReadAllText((Join-Path $PackageDirectory 'manifesto.json'),
            [Text.UTF8Encoding]::new($false, $true)) | ConvertFrom-Json
    } catch { throw 'Manifesto de origem invalido; conteudo omitido.' }
    $idProperty = $manifest.PSObject.Properties['TunnelId']
    $manifestId = [Guid]::Empty
    if ($null -eq $idProperty -or -not [Guid]::TryParse([string]$idProperty.Value, [ref]$manifestId) -or
        $manifestId -ne $TunnelId) {
        throw 'Manifesto nao corresponde ao tunel existente esperado.'
    }
    $text = $null
    $secure = $null
    $validated = $null
    try {
        $text = [IO.File]::ReadAllText((Join-Path $PackageDirectory 'SECRETO-token.txt'),
            [Text.UTF8Encoding]::new($false, $true)).Trim()
        $secure = ConvertTo-SecureString -String $text -AsPlainText -Force
        $destination = Join-Path $ProductionDirectory 'cloudflare-tunnel.token'
        if ($CheckOnly) {
            $validated = Get-ValidatedCloudflareTokenBytes -SecureToken $secure -TunnelId $TunnelId
        } else {
            Save-CloudflareTunnelToken -SecureToken $secure -TunnelId $TunnelId `
                -Path $destination -ProductionDirectory $ProductionDirectory
        }
        return [pscustomobject]@{
            ExpectedTunnelId = $TunnelId.ToString('D')
            SourcePrivateAclValidated = $true
            TokenIdentityAndStructureValidated = $true
            CredentialWritten = (-not $CheckOnly)
            Destination = $destination
            ConnectorStarted = $false
        }
    } finally {
        if ($null -ne $validated) { [Array]::Clear($validated, 0, $validated.Length) }
        if ($null -ne $secure) { $secure.Dispose() }
        $text = $null
        $manifest = $null
    }
}

if ($MyInvocation.InvocationName -eq '.') { return }

Import-CloudflareTunnelToken -PackageDirectory 'C:\CloudflareMigracao' `
    -ProductionDirectory 'C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production' `
    -TunnelId $ExpectedTunnelId -CheckOnly:$ValidateOnly | ConvertTo-Json -Depth 3

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^target[\\/][A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*$')]
    [string]$BackendBuildDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$previousPassword = $env:SQLCMDPASSWORD
try {
    if (-not [string]::IsNullOrWhiteSpace($env:ADC_DB_USER) -and
        [string]::IsNullOrEmpty($env:SQLCMDPASSWORD)) {
        $securePassword = Read-Host "Senha SQL de $($env:ADC_DB_USER) para validar o banco de producao" -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        try {
            $env:SQLCMDPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            $securePassword.Dispose()
        }
    }
    & (Join-Path $PSScriptRoot 'verify-quality.ps1') -BackendBuildDirectory $BackendBuildDirectory
    exit $LASTEXITCODE
} finally {
    $env:SQLCMDPASSWORD = $previousPassword
}

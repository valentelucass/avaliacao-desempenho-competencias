[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^target[\\/][A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*$')]
    [string]$BackendBuildDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# The database runner resolves the existing DPAPI credential (including its login)
# or process authentication. Do not prompt here or override it with ADC_DB_USER.
& (Join-Path $PSScriptRoot 'verify-quality.ps1') -BackendBuildDirectory $BackendBuildDirectory
exit $LASTEXITCODE

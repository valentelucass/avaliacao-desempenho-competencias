[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $stream = [System.IO.File]::OpenRead($resolvedPath)
    try {
      $hash = [System.BitConverter]::ToString($algorithm.ComputeHash($stream))
      $hash = $hash.Replace('-', '').ToLowerInvariant()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $algorithm.Dispose()
  }

  if ($hash -notmatch '^[0-9a-f]{64}$') {
    throw 'O SHA-256 calculado possui formato invalido.'
  }

  [Console]::Out.WriteLine($hash)
} catch {
  [Console]::Error.WriteLine("Falha ao calcular SHA-256: $($_.Exception.Message)")
  exit 1
}

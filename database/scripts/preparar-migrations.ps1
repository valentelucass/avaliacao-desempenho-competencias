[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$MigrationDirectory,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ListPath,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ManifestPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Sha256Lower([string]$Path) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $algorithm.Dispose()
  }
}

try {
  $resolvedDirectory = (Resolve-Path -LiteralPath $MigrationDirectory).Path
  $files = [string[]]@(
    [System.IO.Directory]::EnumerateFiles(
      $resolvedDirectory,
      'V*.sql',
      [System.IO.SearchOption]::TopDirectoryOnly
    )
  )

  if ($files.Count -eq 0) {
    throw 'Nenhuma migration encontrada para preparar o manifesto.'
  }

  [System.Array]::Sort($files, [System.StringComparer]::Ordinal)
  $manifest = [System.Collections.Generic.List[string]]::new()

  foreach ($file in $files) {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($file)
    $version = $name.Split('__')[0]
    $checksum = Get-Sha256Lower $file

    if ($checksum -notmatch '^[0-9a-f]{64}$') {
      throw "Checksum SHA-256 invalido para $name."
    }

    $manifest.Add("$version|$name|$checksum")
  }

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllLines($ListPath, $files, $encoding)
  [System.IO.File]::WriteAllLines($ManifestPath, $manifest, $encoding)
} catch {
  [Console]::Error.WriteLine("Falha ao preparar migrations: $($_.Exception.Message)")
  exit 1
}

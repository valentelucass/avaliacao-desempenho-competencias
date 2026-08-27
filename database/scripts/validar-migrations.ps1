[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$MigrationDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Sha256Lower {
  param([Parameter(Mandatory)][string]$Path)

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
  $files = @(
    Get-ChildItem -LiteralPath $resolvedDirectory -File -Filter 'V*.sql' |
      Sort-Object -Property Name
  )

  if ($files.Count -eq 0) {
    throw 'Nenhuma migration encontrada.'
  }

  $versions = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $forbiddenPatterns = @(
    '(?im)^\s*GO\s*(?:--.*)?$',
    '(?im)^\s*:(?:r|setvar|on\s+error)\b',
    '\$\(',
    '(?i)\bUSE\b',
    '(?i)\bDROP\b',
    '(?i)\bCREATE\s+DATABASE\b',
    '(?i)\bALTER\s+DATABASE\b',
    '(?i)\bCREATE\s+LOGIN\b',
    '(?i)\bALTER\s+LOGIN\b',
    '(?im)^\s*CREATE\s+(?:OR\s+ALTER\s+)?TRIGGER\b',
    '(?i)\bBEGIN\s+TRANSACTION\b',
    '(?i)\bCOMMIT(?:\s+TRANSACTION)?\b',
    '(?i)\bROLLBACK\b'
  )

  foreach ($file in $files) {
    if ($file.Name -notmatch '^V\d{4}__[a-z0-9_]+\.sql$') {
      throw "Nome de migration invalido: $($file.Name)"
    }

    if ($file.Length -eq 0) {
      throw "Migration vazia: $($file.Name)"
    }

    $version = $file.BaseName.Split('__')[0]
    if (-not $versions.Add($version)) {
      throw "Versao duplicada: $version"
    }

    $content = [System.IO.File]::ReadAllText($file.FullName)
    foreach ($pattern in $forbiddenPatterns) {
      if ([regex]::IsMatch($content, $pattern)) {
        throw "Conteudo de migration incompativel com o runner: $($file.Name)"
      }
    }

    $checksum = Get-Sha256Lower -Path $file.FullName
    if ($checksum -notmatch '^[0-9a-f]{64}$') {
      throw "Checksum SHA-256 invalido: $($file.Name)"
    }
  }

  $v0005 = $files | Where-Object {
    $_.Name -eq 'V0005__regra_operacional_2024_1_ciclos_questionarios_e_avaliacoes.sql'
  }
  if ($null -ne $v0005) {
    $ruleValidation = Join-Path $PSScriptRoot 'testar-v0005-regra-operacional-2024-1.ps1'
    $sqlValidation = Join-Path $resolvedDirectory '..\validation\006_validar_regra_operacional_2024_1.sql'

    if (-not (Test-Path -LiteralPath $ruleValidation)) {
      throw 'Teste estatico da V0005 nao encontrado.'
    }
    if (-not (Test-Path -LiteralPath $sqlValidation)) {
      throw 'Validacao SQL da V0005 nao encontrada.'
    }

    $global:LASTEXITCODE = 0
    & $ruleValidation -MigrationPath $v0005.FullName -SqlValidationPath $sqlValidation
    if ($LASTEXITCODE -ne 0) {
      throw 'Teste estatico da V0005 falhou.'
    }
  }

  $v0006 = $files | Where-Object {
    $_.Name -eq 'V0006__catalogo_rbac_2024_1_autoavaliacao_e_administracao.sql'
  }
  if ($null -ne $v0006) {
    $rbacValidation = Join-Path $PSScriptRoot 'testar-v0006-catalogo-rbac-2024-1.ps1'
    $sqlValidation = Join-Path $resolvedDirectory '..\validation\007_validar_catalogo_rbac_2024_1.sql'

    if (-not (Test-Path -LiteralPath $rbacValidation)) {
      throw 'Teste estatico da V0006 nao encontrado.'
    }
    if (-not (Test-Path -LiteralPath $sqlValidation)) {
      throw 'Validacao SQL da V0006 nao encontrada.'
    }

    $global:LASTEXITCODE = 0
    & $rbacValidation -MigrationPath $v0006.FullName -SqlValidationPath $sqlValidation
    if ($LASTEXITCODE -ne 0) {
      throw 'Teste estatico da V0006 falhou.'
    }
  }

  $v0007 = $files | Where-Object {
    $_.Name -eq 'V0007__atribuicao_questionario_por_colaborador_e_ciclo.sql'
  }
  if ($null -ne $v0007) {
    $assignmentValidation = Join-Path $PSScriptRoot 'testar-v0007-atribuicao-questionario-colaborador.ps1'
    $sqlValidation = Join-Path $resolvedDirectory '..\validation\008_validar_atribuicao_questionario_por_colaborador_e_ciclo.sql'

    if (-not (Test-Path -LiteralPath $assignmentValidation)) {
      throw 'Teste estatico da V0007 nao encontrado.'
    }
    if (-not (Test-Path -LiteralPath $sqlValidation)) {
      throw 'Validacao SQL da V0007 nao encontrada.'
    }

    $global:LASTEXITCODE = 0
    & $assignmentValidation -MigrationPath $v0007.FullName -SqlValidationPath $sqlValidation
    if ($LASTEXITCODE -ne 0) {
      throw 'Teste estatico da V0007 falhou.'
    }
  }

  $v0011 = $files | Where-Object {
    $_.Name -eq 'V0011__restringir_autoridade_administrador_plataforma.sql'
  }
  if ($null -ne $v0011) {
    $authorityValidation = Join-Path $PSScriptRoot 'testar-v0011-restricao-autoridade-administrador.ps1'
    $sqlValidation = Join-Path $resolvedDirectory '..\validation\011_validar_restricao_autoridade_administrador_plataforma.sql'
    $profileValidation = Join-Path $resolvedDirectory '..\validation\009_validar_perfis_administrador_integral_e_usuario_comum.sql'

    if (-not (Test-Path -LiteralPath $authorityValidation)) {
      throw 'Teste estatico da V0011 nao encontrado.'
    }
    if (-not (Test-Path -LiteralPath $sqlValidation)) {
      throw 'Validacao SQL da V0011 nao encontrada.'
    }
    if (-not (Test-Path -LiteralPath $profileValidation)) {
      throw 'Validacao SQL de perfis da V0009 nao encontrada.'
    }

    $global:LASTEXITCODE = 0
    & $authorityValidation -MigrationPath $v0011.FullName -SqlValidationPath $sqlValidation -ProfileValidationPath $profileValidation
    if ($LASTEXITCODE -ne 0) {
      throw 'Teste estatico da V0011 falhou.'
    }
  }

  Write-Output "Migrations validas: $($files.Count)"
  Write-Output 'Conteudo de migrations compativel com o runner.'
} catch {
  [Console]::Error.WriteLine("Falha ao validar migrations: $($_.Exception.Message)")
  exit 1
}

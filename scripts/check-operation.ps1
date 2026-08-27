[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RequiredCommand {
  param([Parameter(Mandatory)][string]$Name)

  $command = Get-Command -Name $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "Comando obrigatorio nao encontrado no PATH: $Name"
  }

  return $command
}

function Get-PortBindingStatus {
  param([Parameter(Mandatory)][int]$Port)

  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  if ($listeners.Count -eq 0) {
    return 'LIVRE'
  }

  $publicListener = $listeners | Where-Object {
    $_.LocalAddress -notin @('127.0.0.1', '::1')
  }
  if ($null -ne $publicListener) {
    return 'EXPOSTA'
  }

  return 'LOOPBACK'
}

Write-Output '==> Operacao: JDK configurado'
& (Join-Path $PSScriptRoot 'run-backend.ps1') -ValidateOnly
if ($LASTEXITCODE -ne 0) {
  throw 'A validacao do JDK falhou.'
}

Write-Output '==> Operacao: ferramentas locais'
$node = Get-RequiredCommand -Name 'node'
$npm = Get-RequiredCommand -Name 'npm'
[void](Get-RequiredCommand -Name 'pm2')

$nodeVersion = (& $node.Source --version).Trim()
if ($LASTEXITCODE -ne 0) {
  throw 'Nao foi possivel consultar a versao do Node.js.'
}

$npmVersion = (& $npm.Source --version).Trim()
if ($LASTEXITCODE -ne 0) {
  throw 'Nao foi possivel consultar a versao do npm.'
}

Write-Output "Node.js: $nodeVersion"
Write-Output "npm: $npmVersion"
Write-Output 'PM2 encontrado no PATH; nenhum processo foi iniciado, reiniciado ou consultado.'

Write-Output '==> Operacao: servico Cloudflare Tunnel'
$cloudflared = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($null -eq $cloudflared) {
  throw 'Servico cloudflared nao encontrado. A topologia prevista depende do Cloudflare Tunnel.'
}
if ($cloudflared.Status -ne 'Running') {
  throw "Servico cloudflared nao esta em execucao: $($cloudflared.Status)"
}
if ($cloudflared.StartType -ne 'Automatic') {
  throw "Servico cloudflared nao esta configurado para inicio automatico: $($cloudflared.StartType)"
}
Write-Output 'Cloudflared: em execucao e configurado para inicio automatico.'

Write-Output '==> Operacao: portas privadas reservadas'
foreach ($port in @(18080, 18081)) {
  $status = Get-PortBindingStatus -Port $port
  switch ($status) {
    'LIVRE' { Write-Output "Porta ${port}: livre para o processo deste projeto." }
    'LOOPBACK' { Write-Output "Porta ${port}: listener restrito ao loopback; confirme que pertence a este projeto antes de publicar." }
    'EXPOSTA' { throw "Porta ${port} possui listener fora do loopback; a topologia do projeto foi violada." }
  }
}

Write-Output '==> Operacao: alertas que exigem decisao e evidencia humana'
$firewallProfiles = @(Get-NetFirewallProfile -ErrorAction Stop)
if ($firewallProfiles | Where-Object { -not $_.Enabled }) {
  Write-Warning 'Ha perfil do Firewall do Windows desabilitado. A politica de firewall deve ser revisada antes da liberacao.'
}

$productionLogDirectory = [Environment]::GetEnvironmentVariable(
  'AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY',
  'Process'
)
if ([string]::IsNullOrWhiteSpace($productionLogDirectory)) {
  Write-Warning 'Diretorio externo de logs nao foi informado; defina local, acesso e retencao antes de publicar.'
} elseif (-not (Test-Path -LiteralPath $productionLogDirectory -PathType Container)) {
  Write-Warning 'O diretorio externo de logs informado nao esta disponivel; revise o provisionamento antes de publicar.'
} else {
  Write-Output 'Diretorio externo de logs informado e existente; permissao e retencao ainda exigem validacao humana.'
}

Write-Output 'Preflight operacional local concluido. Ele nao configura Cloudflare, PM2, firewall, backup, logs ou rotas externas e nao representa aceite de liberacao.'

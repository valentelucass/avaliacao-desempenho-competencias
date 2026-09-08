[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$stopScript = Join-Path $PSScriptRoot 'encerrar-dev-local-antes-producao.ps1'
$viteScript = Join-Path $repositoryRoot 'frontend\node_modules\vite\bin\vite.js'

function Assert-Launcher([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

# Simular a descoberta, sem abrir portas nem encerrar processos reais.
& {
    function Get-CimInstance {
        [CmdletBinding()] param($ClassName, $Filter)
        return [PSCustomObject]@{ Name='node.exe'; ProcessId=911; CreationDate='2026-09-08'; CommandLine='node "'+$viteScript+'" --host 127.0.0.1 --port 5080 --strictPort' }
    }
    function Get-NetTCPConnection {
        [CmdletBinding()] param($State,$LocalPort,$OwningProcess)
        if ($OwningProcess -eq 911) { return [PSCustomObject]@{LocalPort=5080;OwningProcess=911} }
    }
    function Stop-Process { throw 'O teste jamais deve encerrar um processo real.' }
    $messages = & $stopScript -WhatIf 6>&1 | Out-String
    Assert-Launcher ($messages.Contains('5080') -and $messages.Contains('911')) 'Vite em porta dinamica nao foi identificado.'
}

& {
    function Get-CimInstance {
        [CmdletBinding()] param($ClassName,$Filter)
        return [PSCustomObject]@{Name='node.exe';ProcessId=912;CreationDate='2026-09-08';CommandLine='node C:\outro-projeto\vite.js --strictPort'}
    }
    function Get-NetTCPConnection {
        [CmdletBinding()] param($State,$LocalPort,$OwningProcess)
        if ($LocalPort -eq 5180) { return [PSCustomObject]@{LocalPort=5180;OwningProcess=912} }
    }
    function Stop-Process { throw 'Alvo desconhecido nao pode ser encerrado.' }
    $denied = $false
    try { & $stopScript -WhatIf | Out-Null } catch { $denied = $_.Exception.Message.Contains('nao e o') }
    Assert-Launcher $denied 'Processo de outro projeto deveria abortar o encerramento.'
}

Push-Location $repositoryRoot
try {
    $output = & cmd /d /c 'iniciar-dev.bat --public-preview https://example.invalid' 2>&1
    Assert-Launcher ($LASTEXITCODE -ne 0) 'Falha do PowerShell foi mascarada no modo public-preview.'
    $output = 'https://example.invalid' | & cmd /d /c 'iniciar-dev.bat --public-preview-prompt' 2>&1
    Assert-Launcher ($LASTEXITCODE -ne 0) 'Falha do PowerShell foi mascarada no modo prompt.'
    $output = '' | & cmd /d /c 'iniciar-dev.bat --public-preview-prompt' 2>&1
    Assert-Launcher ($LASTEXITCODE -eq 2) 'Cancelamento sem URL deveria retornar 2.'
}
finally { Pop-Location }
# Os codigos nao zero acima eram assercoes negativas, nao falha deste teste.
$global:LASTEXITCODE = 0
Write-Host 'Launchers validados: porta dinamica, alvo desconhecido, propagacao de falhas e cancelamento.'

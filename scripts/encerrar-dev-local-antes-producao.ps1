[CmdletBinding()]
param(
    [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$frontendDirectory = Join-Path $repositoryRoot 'frontend'
$backendDirectory = Join-Path $repositoryRoot 'backend'
$listeners = @(
    [PSCustomObject]@{ Kind = 'front-end'; Port = 5180 }
    [PSCustomObject]@{ Kind = 'API'; Port = 5181 }
)

function Get-ListeningProcess {
    param([Parameter(Mandatory)][int]$Port)

    $processIds = @(
        Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
    if ($processIds.Count -eq 0) {
        return $null
    }
    if ($processIds.Count -ne 1) {
        throw "A porta local $Port e atendida por mais de um processo; nenhum processo foi encerrado."
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($processIds[0])" -ErrorAction Stop
    if ($null -eq $process) {
        throw "Nao foi possivel identificar o processo que atende a porta local $Port; nenhum processo foi encerrado."
    }

    return $process
}

function Test-ExpectedLocalDevelopmentProcess {
    param(
        [Parameter(Mandatory)][object]$Process,
        [Parameter(Mandatory)][ValidateSet('front-end', 'API')][string]$Kind
    )

    $commandLine = [string]$Process.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) {
        return $false
    }
    # O npm pode emitir .bin\\.. no comando do processo; o caminho aponta ao mesmo Vite.
    $normalizedCommandLine = $commandLine -replace '\\{2,}', '\'

    if ($Kind -eq 'front-end') {
        $viteScript = [regex]::Escape((Join-Path $frontendDirectory 'node_modules\vite\bin\vite.js'))
        $viteNpmWrapperTarget = [regex]::Escape(
            (Join-Path $frontendDirectory 'node_modules\.bin\..\vite\bin\vite.js')
        )
        return $Process.Name -ieq 'node.exe' -and
            ($normalizedCommandLine -match ('(?:^|\s)"?' + $viteScript + '"?(?=\s|$)') -or
                $normalizedCommandLine -match ('(?:^|\s)"?' + $viteNpmWrapperTarget + '"?(?=\s|$)')) -and
            $normalizedCommandLine -match '(?:^|\s)--strictPort(?:\s|$)' -and
            $normalizedCommandLine -notmatch '(?:^|\s)preview(?:\s|$)'
    }

    $legacyArtifactPrefix = Join-Path $backendDirectory 'target\avaliacao-desempenho-api-'
    $developmentReleasePrefix = Join-Path $backendDirectory 'target\dev-local-releases\'
    return $Process.Name -ieq 'java.exe' -and (
        $commandLine -like "*$legacyArtifactPrefix*" -or
        $commandLine -like "*$developmentReleasePrefix*avaliacao-desempenho-api-*.jar*"
    )
}

$expectedProcesses = @()
foreach ($listener in $listeners) {
    $process = Get-ListeningProcess -Port $listener.Port
    if ($null -eq $process) {
        continue
    }
    if (-not (Test-ExpectedLocalDevelopmentProcess -Process $process -Kind $listener.Kind)) {
        throw "A porta local $($listener.Port) pertence a um processo que nao e o $($listener.Kind) de desenvolvimento deste repositorio; nenhum processo foi encerrado."
    }

    $expectedProcesses += [PSCustomObject]@{
        Kind = $listener.Kind
        Port = $listener.Port
        ProcessId = [int]$process.ProcessId
        CreationDate = $process.CreationDate
    }
}

# O Dev Tunnel pode encaminhar uma porta diferente de 5180. Descobrir pelo
# executável exato do projeto, nunca encerrar um Node só por ocupar essa porta.
foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop)) {
    if (-not (Test-ExpectedLocalDevelopmentProcess -Process $process -Kind 'front-end') -or
        $process.ProcessId -in @($expectedProcesses | ForEach-Object { $_.ProcessId })) {
        continue
    }
    $ports = @(Get-NetTCPConnection -State Listen -OwningProcess $process.ProcessId -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty LocalPort -Unique)
    if ($ports.Count -gt 0) {
        $expectedProcesses += [PSCustomObject]@{
            Kind = 'front-end'
            Port = $ports -join ','
            ProcessId = [int]$process.ProcessId
            CreationDate = $process.CreationDate
        }
    }
}

if ($expectedProcesses.Count -eq 0) {
    Write-Host 'Nao ha instancia local de desenvolvimento deste repositorio em execucao.'
    exit 0
}

if ($WhatIf) {
    foreach ($process in $expectedProcesses) {
        Write-Host "Seria encerrado somente o $($process.Kind) local deste repositorio (PID $($process.ProcessId), porta $($process.Port))."
    }
    exit 0
}

foreach ($process in $expectedProcesses) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ProcessId)" -ErrorAction Stop
    if ($null -eq $current -or $current.CreationDate -ne $process.CreationDate -or
        -not (Test-ExpectedLocalDevelopmentProcess -Process $current -Kind $process.Kind)) {
        throw 'O processo local mudou desde a descoberta; encerramento cancelado.'
    }
}

foreach ($process in $expectedProcesses) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
}

$deadline = (Get-Date).AddSeconds(15)
do {
    $remaining = @(
        $expectedProcesses | Where-Object {
            $null -ne (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue)
        }
    )
    if ($remaining.Count -eq 0) {
        break
    }
    Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)

if ($remaining.Count -ne 0) {
    $processIds = $remaining.ProcessId -join ', '
    throw "Os processos locais deste repositorio nao foram encerrados dentro de 15 segundos: $processIds."
}

Write-Host 'A instancia local de desenvolvimento deste repositorio foi encerrada antes da publicacao.'

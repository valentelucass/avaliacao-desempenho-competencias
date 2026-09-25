[CmdletBinding()]
param([ValidateRange(0, 600)][int]$WaitSeconds = 180)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pm2Home = 'C:\Users\suporte\.pm2'
$pidFile = Join-Path $pm2Home 'pm2.pid'
$pm2Log = Join-Path $pm2Home 'pm2.log'
$bootScript = Join-Path $pm2Home 'resurrect-on-boot.cmd'
$expected = @(
    'Dashboard-API-5010', 'Dashboard-UI-5173', 'ETL-EXTRACAO-DADOS-LOOP',
    'Satelite-API-19090', 'WORK-SFTP-CLIENTES', 'RECONCILIACAO-CLIENTES',
    'site-api-prod', 'site-prod', 'cms-api-prod', 'cms-prod',
    'landing-api-prod', 'landing-prod', 'avaliacao-api-28081',
    'avaliacao-front-38080'
)

$bootTime = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$bootStamp = $bootTime.ToString('yyyy-MM-ddTHH:mm:ss')

function Get-RestoredNames {
    $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    if (-not (Test-Path -LiteralPath $pm2Log -PathType Leaf)) {
        return @()
    }
    $stream = [System.IO.FileStream]::new($pm2Log, [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $reader = [System.IO.StreamReader]::new($stream)
    try {
        while (-not $reader.EndOfStream) {
            $line = $reader.ReadLine()
            if ($null -eq $line -or $line.Length -lt 19 -or
                [string]::CompareOrdinal($line.Substring(0, 19), $bootStamp) -lt 0) {
                continue
            }
            if ($line -match 'PM2 log: App \[([^:]+):\d+\] online$') {
                [void]$names.Add($Matches[1])
            }
        }
    } finally {
        $reader.Dispose()
    }
    return @($names)
}

function Get-Pm2Daemon {
    if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
        return $null
    }
    $daemonId = 0
    $pidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    if (-not [int]::TryParse($pidText, [ref]$daemonId) -or $daemonId -le 0) {
        return $null
    }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$daemonId" -ErrorAction SilentlyContinue
    if ($null -eq $process -or $process.Name -ine 'node.exe' -or
        $process.CreationDate -lt $bootTime) {
        return $null
    }
    return $process
}

$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
    $task = Get-ScheduledTask -TaskName 'PM2-Projetos' -ErrorAction Stop
    $taskInfo = Get-ScheduledTaskInfo -TaskName 'PM2-Projetos' -ErrorAction Stop
    $daemon = Get-Pm2Daemon
    $restored = @(Get-RestoredNames)
    $missing = @($expected | Where-Object { $_ -cnotin $restored })
    $bootRun = $taskInfo.LastRunTime -ge $bootTime
    $ready = $bootRun -and $task.State -eq 'Running' -and
        $null -ne $daemon -and $daemon.SessionId -eq 0 -and
        $daemon.CreationDate -ge $taskInfo.LastRunTime -and
        $missing.Count -eq 0
    if ($ready -or (Get-Date) -ge $deadline) {
        break
    }
    Start-Sleep -Seconds 5
} while ($true)

$scriptOk = Test-Path -LiteralPath $bootScript -PathType Leaf
if ($scriptOk) {
    $scriptOk = $task.Actions.Execute -ieq $bootScript -and
        [bool](Select-String -LiteralPath $bootScript -SimpleMatch '--no-daemon resurrect' -Quiet)
}
$sql = Get-CimInstance Win32_Service -Filter "Name='MSSQLSERVER'" -ErrorAction SilentlyContinue

Write-Host "Boot da VM: $($bootTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "Tarefa PM2-Projetos: $($task.State); executou apos boot: $bootRun; script correto: $scriptOk"
Write-Host "PM2 daemon deste boot: $(if ($null -eq $daemon) { 'ausente' } else { "PID $($daemon.ProcessId), sessao $($daemon.SessionId)" })"
Write-Host "Cadastros iniciados pelo PM2 apos boot: $($restored.Count)/14"
if ($missing.Count -gt 0) {
    Write-Host "Sem registro de inicializacao: $($missing -join ', ')"
}
if ($null -ne $sql) {
    Write-Host "SQL Server: $($sql.State); erro especifico: $($sql.ServiceSpecificExitCode)"
}

$ports = @(5010, 5173, 6050, 6051, 6060, 6061, 19090, 28081, 38080, 41110, 41112)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $ports })
$rows = foreach ($port in $ports) {
    $owners = @($listeners | Where-Object { $_.LocalPort -eq $port } |
        Select-Object -ExpandProperty OwningProcess -Unique)
    [pscustomobject]@{
        Port = $port
        Listening = $owners.Count -gt 0
        PIDs = $owners -join ', '
    }
}
$rows | Format-Table -AutoSize

if (-not $ready -or -not $scriptOk) {
    throw 'A inicializacao automatica do PM2 ainda nao foi comprovada. Nao rode pm2 resurrect ou pm2 save; envie esta saida.'
}
Write-Host 'PM2 iniciou automaticamente os 14 cadastros. O estado saudavel das aplicacoes depende dos servicos externos acima.'

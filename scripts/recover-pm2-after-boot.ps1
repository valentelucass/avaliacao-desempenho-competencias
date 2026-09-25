[CmdletBinding()]
param([switch]$CheckOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedAccount = 'RTR-SVW-002\suporte'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($identity.Name -ine $expectedAccount) {
    throw "Use a conta $expectedAccount. Conta atual: $($identity.Name)."
}

$pm2Home = 'C:\Users\suporte\.pm2'
$dump = Join-Path $pm2Home 'dump.pm2'
$pidFile = Join-Path $pm2Home 'pm2.pid'
$pm2Command = 'C:\Users\suporte\AppData\Roaming\npm\pm2.cmd'
$nodeExecutable = 'C:\Program Files\nodejs\node.exe'
foreach ($file in @($dump, $pm2Command, $nodeExecutable)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Arquivo obrigatorio ausente: $file"
    }
}

$validateDump = @'
const fs = require('fs');
const saved = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const expected = [
  'Dashboard-API-5010', 'Dashboard-UI-5173', 'ETL-EXTRACAO-DADOS-LOOP',
  'Satelite-API-19090', 'WORK-SFTP-CLIENTES', 'RECONCILIACAO-CLIENTES',
  'site-api-prod', 'site-prod', 'cms-api-prod', 'cms-prod',
  'landing-api-prod', 'landing-prod', 'avaliacao-api-28081', 'avaliacao-front-38080'
];
const names = saved.map(app => app.name);
if (names.length !== expected.length || expected.some(name => names.filter(value => value === name).length !== 1)) {
  console.error('O dump nao contem exatamente os 14 processos esperados.');
  process.exit(2);
}
console.log('Dump validado: 14 processos, sem nomes repetidos.');
'@
& $nodeExecutable -e $validateDump $dump
if ($LASTEXITCODE -ne 0) {
    throw 'Recuperacao interrompida: dump PM2 invalido.'
}

$applicationPorts = @(5010, 5173, 6050, 6051, 6060, 6061, 19090, 28081, 38080, 41110, 41112)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $applicationPorts })
if ($listeners.Count -gt 0) {
    $listeners | Select-Object LocalPort, OwningProcess | Format-Table
    throw 'Ja ha processos nas portas dos projetos. Nao execute pm2 resurrect por cima deles.'
}

$task = Get-ScheduledTask -TaskName 'PM2-Projetos' -ErrorAction Stop
$daemon = $null
if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
    $daemonId = 0
    $pidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    if (-not [int]::TryParse($pidText, [ref]$daemonId) -or $daemonId -le 0) {
        throw 'O arquivo pm2.pid nao contem um PID valido.'
    }
    $daemon = Get-CimInstance Win32_Process -Filter "ProcessId=$daemonId" -ErrorAction Stop
    if ($null -ne $daemon) {
        $bootTime = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
        if ($daemon.Name -ine 'node.exe' -or $daemon.CreationDate -lt $bootTime) {
            throw "O PID $daemonId nao corresponde ao daemon Node iniciado apos este boot."
        }
    }
}

Write-Host "Tarefa: $($task.State). Daemon PM2 preso: $([bool]$daemon). Portas dos projetos: livres."
if ($CheckOnly) {
    Write-Host 'Conferencia concluida. Nenhum processo foi alterado.'
    exit 0
}

$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abra o PowerShell como administrador na conta suporte.'
}

if ($task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName 'PM2-Projetos' -ErrorAction Stop
    Start-Sleep -Seconds 2
}
if ($null -ne $daemon) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($daemon.ProcessId)" -ErrorAction Stop
    if ($null -ne $current -and $current.Name -ieq 'node.exe' -and
        $current.CreationDate -eq $daemon.CreationDate) {
        Stop-Process -Id $daemon.ProcessId -Force -ErrorAction Stop
        Write-Host "Daemon PM2 travado encerrado: PID $($daemon.ProcessId)."
    }
}

$env:PM2_HOME = $pm2Home
Write-Host 'Restaurando os 14 processos salvos no PM2...'
& $pm2Command resurrect
if ($LASTEXITCODE -ne 0) {
    throw "pm2 resurrect falhou com codigo $LASTEXITCODE. Nao execute pm2 save."
}
Write-Host 'Comando de restauracao concluido. Confira o estado e as portas antes de salvar novamente.'
& $pm2Command ls

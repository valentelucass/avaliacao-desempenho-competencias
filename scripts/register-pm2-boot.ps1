[CmdletBinding()]
param([switch]$CheckOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedAccount = 'RTR-SVW-002\suporte'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($identity.Name -ine $expectedAccount) {
    throw "A conta atual e $($identity.Name). Use $expectedAccount."
}

$nodeExecutable = 'C:\Program Files\nodejs\node.exe'
$pm2Command = 'C:\Users\suporte\AppData\Roaming\npm\pm2.cmd'
$pm2Home = 'C:\Users\suporte\.pm2'
$dump = Join-Path $pm2Home 'dump.pm2'
$bootScript = Join-Path $pm2Home 'resurrect-on-boot.cmd'

foreach ($file in @($nodeExecutable, $pm2Command, $dump)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Arquivo obrigatorio nao encontrado: $file"
    }
}

# O JSON do PM2 contem chaves que diferem apenas por maiusculas/minusculas.
# Windows PowerShell ConvertFrom-Json nao as aceita; Node faz a leitura exata.
$checkDump = @'
const fs = require('fs');
const saved = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const expected = [
  'Dashboard-API-5010', 'Dashboard-UI-5173', 'ETL-EXTRACAO-DADOS-LOOP',
  'Satelite-API-19090', 'WORK-SFTP-CLIENTES', 'RECONCILIACAO-CLIENTES',
  'site-api-prod', 'site-prod', 'cms-api-prod', 'cms-prod',
  'landing-api-prod', 'landing-prod',
  'avaliacao-api-28081', 'avaliacao-front-38080'
];
const names = saved.map((application) => application.name);
if (saved.length !== expected.length || expected.some((name) => names.filter((value) => value === name).length !== 1)) {
  console.error('O dump do PM2 nao contem exatamente os 14 processos esperados.');
  process.exit(2);
}
console.log('Snapshot PM2 validado: 14 processos.');
'@
& $nodeExecutable -e $checkDump $dump
if ($LASTEXITCODE -ne 0) {
    throw 'A tarefa de inicializacao nao sera cadastrada com um dump incompleto.'
}

$taskName = 'PM2-Projetos'
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runEntryExists = $null -ne (Get-ItemProperty -Path $runKey -Name 'PM2' -ErrorAction SilentlyContinue)

if ($CheckOnly) {
    Write-Host "Tarefa existente: $([bool]$existingTask)"
    Write-Host "Entrada antiga no logon: $runEntryExists"
    Write-Host 'Nenhum processo, tarefa ou arquivo foi alterado.'
    exit 0
}

$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abra o PowerShell como administrador na conta suporte e execute novamente.'
}

$bootContent = @'
@echo off
set "PM2_HOME=C:\Users\suporte\.pm2"
set "PATH=C:\Program Files\nodejs;%PATH%"
echo [PM2-BOOT] START %DATE% %TIME%>> "C:\Users\suporte\.pm2\boot-resurrect.log"
call "C:\Users\suporte\AppData\Roaming\npm\pm2.cmd" --no-daemon resurrect >NUL 2>&1
set "PM2_BOOT_RESULT=%errorlevel%"
echo [PM2-BOOT] EXIT %DATE% %TIME% CODE=%PM2_BOOT_RESULT%>> "C:\Users\suporte\.pm2\boot-resurrect.log"
exit /b %PM2_BOOT_RESULT%
'@
Set-Content -LiteralPath $bootScript -Value $bootContent -Encoding Ascii

$action = New-ScheduledTaskAction -Execute $bootScript -WorkingDirectory 'C:\Users\suporte\Documents'
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT1M'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 2) -ExecutionTimeLimit ([TimeSpan]::Zero)

$credential = Get-Credential -UserName $expectedAccount `
    -Message 'Digite a SENHA da conta Windows suporte, nao o PIN'
if ($null -eq $credential) {
    throw 'Senha nao informada; a tarefa nao foi criada.'
}

try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Settings $settings -User $credential.UserName `
        -Password $credential.GetNetworkCredential().Password `
        -RunLevel Limited -Force -ErrorAction Stop | Out-Null
} finally {
    $credential = $null
}

$registered = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($registered.Actions.Execute -ne $bootScript -or $registered.State -eq 'Disabled') {
    throw 'A tarefa foi registrada, mas sua configuracao nao corresponde ao script esperado.'
}

if ($runEntryExists) {
    Remove-ItemProperty -Path $runKey -Name 'PM2' -ErrorAction Stop
}

Write-Host 'Tarefa PM2-Projetos registrada para manter o PM2 ativo apos o boot, mesmo sem login.'
Write-Host 'Entrada antiga de inicializacao no logon removida.'
Write-Host 'Nenhum processo PM2 foi reiniciado por este script.'

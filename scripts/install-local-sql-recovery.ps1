[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ReviewedTemplateDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$private='C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\sql-recovery'
$taskName='Rodogarcia-Avaliacao-SQL-Recovery'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($identity.User.Value -cne 'S-1-5-21-263687237-119212591-4036808788-1000' -or
   !([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'EXPECTED_ELEVATED_ACCOUNT_REQUIRED'}
. (Join-Path $PSScriptRoot 'prepare-production-config.ps1')
Assert-NoReparsePoint $ReviewedTemplateDirectory
Assert-PrivateAcl $ReviewedTemplateDirectory
$receipt=Get-Content -Raw -LiteralPath (Join-Path $ReviewedTemplateDirectory 'result.json')|ConvertFrom-Json
if($receipt.status -cne 'AVALIACAO_TLS_RECOVERED'){throw 'REVIEWED_RECOVERY_REQUIRED'}
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'TASK_ALREADY_EXISTS_REVIEW_BEFORE_REPLACING'}
New-PrivateDirectory $private
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'watch-local-sql-recovery.ps1') -Destination $private
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ensure-avaliacao-running.cjs') -Destination $private
Copy-Item -LiteralPath (Join-Path $ReviewedTemplateDirectory 'apply-scoped-tls.ps1') -Destination $private
$old=Get-Content -Raw -LiteralPath (Join-Path $ReviewedTemplateDirectory 'plan.json')|ConvertFrom-Json
$config='C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\avaliacao-prod.properties'
$files=@($old.files|Where-Object{$_.path -ne $config}|ForEach-Object{
    $path=$_.path.Replace($ReviewedTemplateDirectory,$private)
    if((Get-FileHash -LiteralPath $path).Hash -ine $_.sha256){throw 'REVIEWED_DEPENDENCY_CHANGED'}
    @{path=$path;sha256=$_.sha256}
})
$installed=Join-Path $private 'watch-local-sql-recovery.ps1'
$files+=@(@{path=$installed;sha256=(Get-FileHash -LiteralPath $installed).Hash.ToLowerInvariant()})
$ensure=Join-Path $private 'ensure-avaliacao-running.cjs'
$files+=@(@{path=$ensure;sha256=(Get-FileHash -LiteralPath $ensure).Hash.ToLowerInvariant()})
[IO.File]::WriteAllText((Join-Path $private 'dependencies.json'),(@{files=$files}|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
$windowsPowerShell='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
& $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $installed -Apply
if($LASTEXITCODE -ne 0){throw 'INITIAL_RECOVERY_CHECK_FAILED'}
$action=New-ScheduledTaskAction -Execute $windowsPowerShell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$installed+'" -Apply') -WorkingDirectory $private
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal=New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType S4U -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Recupera somente a confianca TLS privada/API da Avaliacao apos troca do processo SQL local validado. Sem restart SQL, PM2 save ou acesso a outros bancos.' | Out-Null
Start-ScheduledTask -TaskName $taskName
@{status='RECOVERY_TASK_INSTALLED';task=$taskName;intervalSeconds=60;privateDirectory=$private}|ConvertTo-Json

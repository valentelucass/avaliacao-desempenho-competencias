Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'run-prepared-production.ps1')
$cases=0
function Assert-PreparedCase([bool]$Condition,[string]$Name){if(-not $Condition){throw ('PREPARED_FIXTURE_FAILED: '+$Name)};$script:cases++}
function New-FakeCheck([bool]$Ready){
    if($Ready){return [pscustomobject]@{ExitCode=0;status='PREREQUISITES_PASS_RUNTIME_NOT_STARTED';applyRequested=$false;processesStarted=0}}
    return [pscustomobject]@{ExitCode=1;status='BLOCKED_NO_START';applyRequested=$false;processesStarted=0;blockers=@($script:elevationBlocker)}
}
$account=$script:expectedPreparedAccount;$sid=$script:expectedPreparedSid
Assert-PreparedCase ((Get-PreparedStartDecision (New-FakeCheck $true) $true $account $sid) -eq 'DIRECT_APPLY') 'elevated approved preflight requests only explicit apply'
Assert-PreparedCase ((Get-PreparedStartDecision (New-FakeCheck $false) $false $account $sid) -eq 'LEGITIMATE_UAC') 'only elevation blocker permits normal UAC'
Assert-PreparedCase ((Get-PreparedStartDecision (New-FakeCheck $false) $true $account $sid) -eq 'BLOCKED_PREREQUISITES') 'unexpected blocker under admin does not start'
Assert-PreparedCase ((Get-PreparedStartDecision (New-FakeCheck $true) $false $account $sid) -eq 'BLOCKED_PREREQUISITES') 'non-admin cannot bypass required UAC'
foreach($blocker in @('INCOMPLETE','APPROVAL_MISSING','WRONG_HASH','PORT_OCCUPIED','EXISTING_NAME','SQL_SERVICE_CHANGED')){
    $fake=New-FakeCheck $false;$fake.blockers=@($script:elevationBlocker,$blocker)
    Assert-PreparedCase ((Get-PreparedStartDecision $fake $false $account $sid) -eq 'BLOCKED_PREREQUISITES') 'any additional blocker prevents UAC'
}
Assert-PreparedCase ((Get-PreparedStartDecision (New-FakeCheck $true) $true 'other\user' $sid) -eq 'BLOCKED_ACCOUNT') 'different account blocked'
Assert-PreparedCase ((Get-PreparedStartDecision (New-FakeCheck $true) $true $account 'S-1-5-18') -eq 'BLOCKED_ACCOUNT') 'different SID blocked'
foreach($variant in @(@('applyRequested',$true),@('applyRequested','false'),@('processesStarted',1))){
    $fake=New-FakeCheck $true;$fake.($variant[0])=$variant[1]
    Assert-PreparedCase ((Get-PreparedStartDecision $fake $true $account $sid) -eq 'BLOCKED_CHECK_CONTRACT') 'untrusted check result rejected'
}
$fake=New-FakeCheck $false;$fake.blockers=@();Assert-PreparedCase ((Get-PreparedStartDecision $fake $false $account $sid) -eq 'BLOCKED_PREREQUISITES') 'empty failure is not approval'
$fake=New-FakeCheck $true;$fake.ExitCode=1;Assert-PreparedCase ((Get-PreparedStartDecision $fake $true $account $sid) -eq 'BLOCKED_PREREQUISITES') 'nonzero exit cannot approve'
# Inspect the actual UAC call and invocation boundary without executing it.
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'run-prepared-production.ps1'))
Assert-PreparedCase ($source.Contains('-Verb RunAs -WindowStyle Hidden -Wait -PassThru')) 'standard hidden UAC only'
Assert-PreparedCase ($source.Contains('if ($MyInvocation.InvocationName -eq ''.'') { return }')) 'dot-source mode performs no runtime actions'
foreach($forbidden in @('pm2 save','pm2 resurrect','pm2 kill','npm run build','SQLCMDPASSWORD','-Credential','Invoke-Expression')){
    Assert-PreparedCase (-not $source.Contains($forbidden)) 'no build/global mutation/credentials bypass'
}
$bat=[IO.File]::ReadAllText((Join-Path (Split-Path -Parent $PSScriptRoot) 'iniciar-prod.bat'))
Assert-PreparedCase ($bat.IndexOf('goto :start_prepared_only') -lt $bat.IndexOf('run-production-from-env.ps1')) 'explicit mode bypasses legacy env/deploy flow'
$segment=($bat -split '(?m)^:start_prepared_only\r?\n')[1] -split ':resolve_backend_jar'
Assert-PreparedCase ($segment[0].Contains('run-prepared-production.ps1') -and -not ($segment[0] -match '(?i)pm2|npm|database|verify-quality')) 'prepared BAT branch has only wrapper call'
# Invoke the real elevation function with a local mock of Start-Process.
$script:mockUacCanceled=$false;$script:mockUacDisposed=$false;$script:mockUacArguments=$null
function Start-Process {
    param([string]$FilePath,[string]$ArgumentList,[string]$Verb,[string]$WindowStyle,[switch]$Wait,[switch]$PassThru)
    if($script:mockUacCanceled){throw [ComponentModel.Win32Exception]::new(1223)}
    $script:mockUacArguments=[pscustomobject]@{FilePath=$FilePath;ArgumentList=$ArgumentList;Verb=$Verb;WindowStyle=$WindowStyle;Wait=[bool]$Wait;PassThru=[bool]$PassThru}
    $fake=[pscustomobject]@{ExitCode=17}
    $fake|Add-Member -MemberType ScriptMethod -Name Dispose -Value {$script:mockUacDisposed=$true}
    return $fake
}
Assert-PreparedCase ((Invoke-PreparedElevation) -eq 17) 'actual elevation function propagates child exit code'
Assert-PreparedCase ($script:mockUacDisposed) 'actual elevation function disposes owned process handle'
Assert-PreparedCase ($script:mockUacArguments.Verb -ceq 'RunAs' -and $script:mockUacArguments.WindowStyle -ceq 'Hidden' -and $script:mockUacArguments.Wait -and $script:mockUacArguments.PassThru) 'actual mock invocation uses standard hidden UAC'
Assert-PreparedCase ($script:mockUacArguments.ArgumentList -ceq ('-NoProfile -ExecutionPolicy Bypass -File "'+$script:preparedHelper+'" -Apply')) 'actual elevated args select fixed helper only'
Assert-PreparedCase ($script:mockUacArguments.FilePath -ceq (Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe')) 'actual elevation uses Windows system PowerShell'
$script:mockUacCanceled=$true;$cancelPassed=$false
try{[void](Invoke-PreparedElevation)}catch{$cancelPassed=$true}
Assert-PreparedCase $cancelPassed 'UAC cancellation aborts without fallback'

# Run the real BAT in a new private TEMP folder with a harmless powershell.cmd shim.
. (Join-Path $PSScriptRoot 'prepare-production-config.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('adc-prepared-bat-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-PrivateDirectory $fixture
$batPath=Join-Path $fixture 'iniciar-prod.bat'
[IO.File]::Copy((Join-Path (Split-Path -Parent $PSScriptRoot) 'iniciar-prod.bat'),$batPath,$false)
$shimPath=Join-Path $fixture 'powershell.cmd'
$shim=@'
@echo off
echo MOCK_ONLY %*
exit /b 17
'@
$stream=[IO.File]::Open($shimPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$bytes=[Text.ASCIIEncoding]::new().GetBytes($shim);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
foreach($case in @(@('--start-prepared',17),@('--START-PREPARED',17),@('--start-prepared extra',2))){
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path ([Environment]::GetFolderPath('System')) 'cmd.exe'
    $info.Arguments='/d /s /c ""'+$batPath+'" '+$case[0]+'"';$info.WorkingDirectory=$fixture
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.EnvironmentVariables.Clear()
    foreach($key in @('SystemRoot','WINDIR','TEMP','TMP','COMPUTERNAME')){$value=[Environment]::GetEnvironmentVariable($key);if($value){$info.EnvironmentVariables[$key]=$value}}
    $info.EnvironmentVariables['PATH']=$fixture+';'+[Environment]::GetFolderPath('System')
    $info.EnvironmentVariables['PATHEXT']='.COM;.EXE;.BAT;.CMD'
    $process=[Diagnostics.Process]::Start($info)
    try{
        $outTask=$process.StandardOutput.ReadToEndAsync();$errTask=$process.StandardError.ReadToEndAsync()
        if(-not $process.WaitForExit(5000)){throw 'OWN_BAT_FIXTURE_TIMEOUT'}
        $out=$outTask.GetAwaiter().GetResult();$discarded=$errTask.GetAwaiter().GetResult()
        Assert-PreparedCase ($process.ExitCode -eq $case[1]) 'real BAT preserves mock exit code or rejects extra args'
        if($case[1] -eq 17){Assert-PreparedCase ($out.Contains('run-prepared-production.ps1') -and $out.Contains('-StartPrepared') -and -not $out.Contains('run-production-from-env.ps1')) 'real BAT routes only to prepared wrapper'}
        else{Assert-PreparedCase (-not $out.Contains('MOCK_ONLY')) 'extra args rejected before any helper call'}
    }finally{$process.Dispose()}
}
[ordered]@{Status='PASS';Cases=$script:cases;Sql='NONE';AppStart='NONE';UAC='MOCK_ONLY';PM2='NONE'}|ConvertTo-Json

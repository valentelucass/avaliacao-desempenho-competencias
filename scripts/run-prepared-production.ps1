[CmdletBinding()]
param([switch]$StartPrepared)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:preparedHelper='C:\CloudflareMigracao\preparado-WIN-00NEDIJ1R5P\pm2\start-avaliacao-only.ps1'
$script:expectedPreparedAccount='ROD-SRVW-001\suporte'
$script:expectedPreparedSid='S-1-5-21-263687237-119212591-4036808788-1000'
$script:elevationBlocker='Usar console administrativo da mesma conta: servidor PM2 confirmado elevado.'

function Get-PreparedStartDecision {
    param([object]$Check,[bool]$Administrator,[string]$CallerName,[string]$CallerSid)
    if ($CallerName -ine $script:expectedPreparedAccount -or $CallerSid -ne $script:expectedPreparedSid) { return 'BLOCKED_ACCOUNT' }
    if ($Check.applyRequested -isnot [bool] -or $Check.applyRequested -or $Check.processesStarted -ne 0) { return 'BLOCKED_CHECK_CONTRACT' }
    if ($Check.ExitCode -eq 0 -and $Check.status -ceq 'PREREQUISITES_PASS_RUNTIME_NOT_STARTED' -and $Administrator) { return 'DIRECT_APPLY' }
    if ($Check.ExitCode -eq 1 -and $Check.status -ceq 'BLOCKED_NO_START' -and -not $Administrator -and
        @($Check.blockers).Count -eq 1 -and $Check.blockers[0] -ceq $script:elevationBlocker) { return 'LEGITIMATE_UAC' }
    return 'BLOCKED_PREREQUISITES'
}

function Invoke-PreparedHelper {
    param([switch]$Apply)
    $powershell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$powershell
    $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$script:preparedHelper+'"'+$(if($Apply){' -Apply'}else{''})
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.EnvironmentVariables.Clear()
    foreach($key in @('SystemRoot','WINDIR','TEMP','TMP','COMPUTERNAME')){
        $value=[Environment]::GetEnvironmentVariable($key);if($value){$info.EnvironmentVariables[$key]=$value}
    }
    $child=[Diagnostics.Process]::Start($info)
    try {
        $outputTask=$child.StandardOutput.ReadToEndAsync();$errorTask=$child.StandardError.ReadToEndAsync()
        $timeout=if($Apply){40000}else{20000}
        if(-not $child.WaitForExit($timeout)){throw 'OWN_HELPER_TIMEOUT_REVIEW_BEFORE_RETRY'}
        $output=$outputTask.GetAwaiter().GetResult();$discarded=$errorTask.GetAwaiter().GetResult()
        if($Apply){return [pscustomobject]@{ExitCode=$child.ExitCode;SafeOutput=$output}}
        try {$result=$output|ConvertFrom-Json} catch {throw 'PREFLIGHT_RESULT_UNAVAILABLE'}
        $result|Add-Member -NotePropertyName ExitCode -NotePropertyValue $child.ExitCode
        return $result
    } finally {$child.Dispose()}
}

function Invoke-PreparedElevation {
    $powershell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
    # Standard UAC consent; no credentials, bypass, alternate user or secrets in arguments.
    $child=Start-Process -FilePath $powershell -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+$script:preparedHelper+'" -Apply') -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    try {return $child.ExitCode} finally {$child.Dispose()}
}

if ($MyInvocation.InvocationName -eq '.') { return }
try {
    if($env:COMPUTERNAME -cne 'ROD-SRVW-001' -or (Get-ItemProperty -LiteralPath HKLM:\SOFTWARE\Microsoft\Cryptography -Name MachineGuid).MachineGuid -ne '307c6e6f-185b-4e19-b354-5cbd5c37adcc'){throw 'WRONG_VM'}
    . (Join-Path $PSScriptRoot 'prepare-production-config.ps1')
    Assert-NoReparsePoint $script:preparedHelper
    $allowed=@($script:expectedPreparedSid,'S-1-5-18','S-1-5-32-544')
    if(@((Get-Acl -LiteralPath $script:preparedHelper).Access|Where-Object{$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed}).Count -gt 0){throw 'HELPER_ACL_UNSAFE'}
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    $principal=[Security.Principal.WindowsPrincipal]::new($identity)
    $admin=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if($identity.Name -ine $script:expectedPreparedAccount -or $identity.User.Value -ne $script:expectedPreparedSid){throw 'WRONG_WINDOWS_ACCOUNT'}
    $check=Invoke-PreparedHelper
    if(-not $StartPrepared){$check|ConvertTo-Json -Depth 4;exit $check.ExitCode}
    $decision=Get-PreparedStartDecision -Check $check -Administrator $admin -CallerName $identity.Name -CallerSid $identity.User.Value
    switch($decision){
        'DIRECT_APPLY' {$result=Invoke-PreparedHelper -Apply;Write-Output $result.SafeOutput;exit $result.ExitCode}
        'LEGITIMATE_UAC' {Write-Output 'Preflight aprovado; confirmar UAC da mesma conta para iniciar somente a Avaliacao.';$code=Invoke-PreparedElevation;exit $code}
        default {$check|ConvertTo-Json -Depth 4;exit 1}
    }
} catch {
    Write-Output '[Avaliacao preparada] Operacao bloqueada/cancelada. Nenhum build, SQL, PM2 CLI ou save foi executado pelo wrapper. Confira os pre-requisitos; nao repetir apos falha parcial sem revisar o recibo.'
    exit 1
}

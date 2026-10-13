[CmdletBinding()]
param([switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

# Installed privately by install-local-sql-recovery.ps1. No SQL writes or global PM2 save.
function Get-AdcRecoveryDecision($Sql, $Previous, [string]$ConfigHash, [string]$ProbeCategory, [string]$ApiStatus) {
    if ($Sql.State -ne 'Running') { return 'WAIT_SQL' }
    if ($null -ne $Previous -and $Previous.requiresReview) { return 'REVIEW_PARTIAL_RECOVERY' }
    if ($null -ne $Previous -and $Previous.sqlPID -eq $Sql.Pid -and
        $Previous.sqlStartedUTC -ceq $Sql.StartedUTC -and $Previous.configSHA256 -ceq $ConfigHash) { return 'UNCHANGED' }
    if ($ApiStatus -ne 'online') { return 'WAIT_API_OPERATOR' }
    if ($Sql.AgeSeconds -lt 30) { return 'WAIT_SQL_STABLE' }
    if ($ProbeCategory -eq 'CONNECTED') { return 'RECORD_CONNECTED' }
    if ($ProbeCategory -in @('TLS_CA_CHAIN_UNTRUSTED','TLS_CERTIFICATE_VALIDATION_FAILED','TLS_SERVER_NAME_MISMATCH')) { return 'REFRESH_PRIVATE_TLS' }
    return 'WAIT_DATABASE'
}

function Save-AdcRecoveryJson([string]$Path, $Value) {
    $temporary=$Path+'.tmp'
    [IO.File]::WriteAllText($temporary,($Value|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    if(Test-Path -LiteralPath $Path){[IO.File]::Replace($temporary,$Path,[NullString]::Value)}else{[IO.File]::Move($temporary,$Path)}
}

function Invoke-AdcRecoveryCycle {
    $base='C:\Users\suporte\Documents\projetos\.runtime\pm2'
    $private='C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\sql-recovery'
    $config='C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\avaliacao-prod.properties'
    $java='C:\Users\suporte\AppData\Local\Programs\Eclipse Adoptium\jdk-21\bin\java.exe'
    $node='C:\Program Files\nodejs\node.exe'
    $windowsPowerShell='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
    $statePath=Join-Path $private 'state.json'
    $statusPath=Join-Path $private 'status.json'
    $lock=$null
    $changed=$false
    try {
        $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
        if($identity.User.Value -cne 'S-1-5-21-263687237-119212591-4036808788-1000' -or
            (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid -cne '307c6e6f-185b-4e19-b354-5cbd5c37adcc'){throw 'VM_ACCOUNT_IDENTITY'}
        foreach($key in @('NODE_OPTIONS','NODE_DEBUG','NODE_DEBUG_NATIVE','DEBUG','PM2_DEBUG','JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS')){Remove-Item ('Env:'+$key) -ErrorAction SilentlyContinue}
        . 'C:\Users\suporte\Documents\projetos\avaliacao-desempenho-competencias\scripts\prepare-production-config.ps1'
        Assert-NoReparsePoint $private
        Assert-PrivateAcl $private
        $baseline=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $private 'dependencies.json')|ConvertFrom-Json
        foreach($file in $baseline.files){
            Assert-NoReparsePoint $file.path
            if((Get-FileHash -LiteralPath $file.path).Hash -ine $file.sha256){throw 'RECOVERY_DEPENDENCY_CHANGED'}
        }
        try{$lock=[IO.File]::Open((Join-Path $private 'recovery.lock'),'OpenOrCreate','ReadWrite','None')}catch{return @{status='ALREADY_RUNNING';changed=$false}}
        $previous=if(Test-Path -LiteralPath $statePath){Get-Content -Raw -LiteralPath $statePath|ConvertFrom-Json}else{$null}
        $service=Get-CimInstance Win32_Service -Filter "Name='MSSQLSERVER'"
        $sql=[pscustomobject]@{State=$service.State;Pid=[int]$service.ProcessId;StartedUTC='';AgeSeconds=0}
        if($service.State -eq 'Running'){
            $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$service.ProcessId)
            $sql.StartedUTC=$process.CreationDate.ToUniversalTime().ToString('o')
            $sql.AgeSeconds=([DateTime]::UtcNow-$process.CreationDate.ToUniversalTime()).TotalSeconds
        }
        $configHash=(Get-FileHash -LiteralPath $config).Hash.ToLowerInvariant()
        $decision=Get-AdcRecoveryDecision $sql $previous $configHash '' 'online'
        if($decision -notin @('UNCHANGED','WAIT_SQL','WAIT_SQL_STABLE','REVIEW_PARTIAL_RECOVERY')){
            $liveRaw=& $node (Join-Path $base 'read-pm2.cjs')
            if($LASTEXITCODE -ne 0){throw 'RPC_READ_REFUSED'}
            $live=($liveRaw -join [Environment]::NewLine)|ConvertFrom-Json
            $api=@($live.processes|Where-Object name -eq 'avaliacao-api-28081')
            $apiStatus=if($api.Count -eq 1){$api[0].status}else{'absent'}
            if($apiStatus -ne 'online'){$decision='WAIT_API_OPERATOR'}else{
                $raw=& $java -cp ($base+'\tls-tools;'+$base+'\tls-tools\mssql-jdbc-13.4.0.jre11.jar') JdbcReadOnlyProbe $config
                $probe=($raw -join [Environment]::NewLine)|ConvertFrom-Json
                $category=if($probe.connectionEstablished){'CONNECTED'}else{$probe.category}
                $decision=Get-AdcRecoveryDecision $sql $previous $configHash $category $apiStatus
            }
        }
        if($decision -eq 'REFRESH_PRIVATE_TLS' -and $Apply){
            # Persist a stop marker first: a partial promotion must never cause a restart loop.
            Save-AdcRecoveryJson $statePath @{sqlPID=$sql.Pid;sqlStartedUTC=$sql.StartedUTC;configSHA256=$configHash;requiresReview=$true}
            $run=Join-Path $private ('recovery-'+[Guid]::NewGuid().ToString('N'))
            New-PrivateDirectory $run
            $template=Join-Path $private 'apply-scoped-tls.ps1'
            Copy-Item -LiteralPath $template -Destination $run
            $files=@($baseline.files|Where-Object{$_.path -ne $template}|ForEach-Object{@{path=$_.path;sha256=$_.sha256}})
            $files+=@(@{path=(Join-Path $run 'apply-scoped-tls.ps1');sha256=(Get-FileHash -LiteralPath $template).Hash.ToLowerInvariant()})
            $files+=@(@{path=$config;sha256=$configHash})
            Save-AdcRecoveryJson (Join-Path $run 'plan.json') @{files=$files}
            & $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $run 'apply-scoped-tls.ps1') -Apply
            $receipt=Get-Content -Raw -LiteralPath (Join-Path $run 'result.json')|ConvertFrom-Json
            if($LASTEXITCODE -ne 0 -or $receipt.status -cne 'AVALIACAO_TLS_RECOVERED'){throw 'PARTIAL_RECOVERY_REVIEW_REQUIRED'}
            $changed=$true
            $decision='RECOVERED'
            $configHash=(Get-FileHash -LiteralPath $config).Hash.ToLowerInvariant()
        }
        if($Apply -and $decision -in @('RECORD_CONNECTED','RECOVERED')){
            Save-AdcRecoveryJson $statePath @{sqlPID=$sql.Pid;sqlStartedUTC=$sql.StartedUTC;configSHA256=$configHash;requiresReview=$false;observedAtUTC=[DateTime]::UtcNow.ToString('o')}
        }
        $result=@{status=$decision;changed=$changed;apply=[bool]$Apply;sqlPID=$sql.Pid;observedAtUTC=[DateTime]::UtcNow.ToString('o');sqlChanges=$false}
        if($Apply){Save-AdcRecoveryJson $statusPath $result}
        return $result
    }catch{
        $code=if($_.Exception.Message -cmatch '^[A-Z_]+$'){$_.Exception.Message}else{'RECOVERY_CHECK_FAILED'}
        $result=@{status=$code;changed=$changed;observedAtUTC=[DateTime]::UtcNow.ToString('o');sqlChanges=$false}
        if($Apply -and (Test-Path -LiteralPath $private)){Save-AdcRecoveryJson $statusPath $result}
        return $result
    }finally{if($null -ne $lock){$lock.Dispose()}}
}

if($MyInvocation.InvocationName -eq '.'){return}
$result=Invoke-AdcRecoveryCycle
$result|ConvertTo-Json -Depth 5
if($result.status -in @('UNCHANGED','RECORD_CONNECTED','RECOVERED','ALREADY_RUNNING')){exit 0}
exit 1

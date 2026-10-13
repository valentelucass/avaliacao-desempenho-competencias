$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'watch-local-sql-recovery.ps1')
$sql=[pscustomobject]@{State='Running';Pid=100;StartedUTC='2026-10-07T21:00:00Z';AgeSeconds=60}
$state=[pscustomobject]@{sqlPID=100;sqlStartedUTC=$sql.StartedUTC;configSHA256='abc';requiresReview=$false}
$checks=0
function Assert-Decision($SqlValue,$StateValue,$HashValue,$ProbeValue,$ApiValue,$Expected){
    $actual=Get-AdcRecoveryDecision $SqlValue $StateValue $HashValue $ProbeValue $ApiValue
    if($actual -cne $Expected){throw ('Expected '+$Expected+', got '+$actual)}
    $script:checks++
}
Assert-Decision $sql $state 'abc' '' 'online' 'UNCHANGED'
$sql.State='Stopped'
Assert-Decision $sql $state 'abc' 'TLS_CA_CHAIN_UNTRUSTED' 'online' 'WAIT_SQL'
$sql.State='Running';$sql.Pid=200
Assert-Decision $sql $state 'abc' 'TLS_CA_CHAIN_UNTRUSTED' 'stopped' 'WAIT_API_OPERATOR'
Assert-Decision $sql $state 'abc' 'TLS_CA_CHAIN_UNTRUSTED' 'absent' 'WAIT_API_OPERATOR'
$sql.AgeSeconds=10
Assert-Decision $sql $state 'abc' 'TLS_CA_CHAIN_UNTRUSTED' 'online' 'WAIT_SQL_STABLE'
$sql.AgeSeconds=60
Assert-Decision $sql $state 'abc' 'TLS_CA_CHAIN_UNTRUSTED' 'online' 'REFRESH_PRIVATE_TLS'
Assert-Decision $sql $state 'abc' 'TLS_CERTIFICATE_VALIDATION_FAILED' 'online' 'REFRESH_PRIVATE_TLS'
Assert-Decision $sql $state 'abc' 'DEDICATED_SQL_LOGIN_REJECTED' 'online' 'WAIT_DATABASE'
Assert-Decision $sql $state 'abc' 'CONNECTION_FAILED' 'online' 'WAIT_DATABASE'
Assert-Decision $sql $state 'abc' 'CONNECTED' 'online' 'RECORD_CONNECTED'
$sql.Pid=100;$sql.StartedUTC='2026-10-08T21:00:00Z'
Assert-Decision $sql $state 'abc' 'TLS_CA_CHAIN_UNTRUSTED' 'online' 'REFRESH_PRIVATE_TLS'
$sql.StartedUTC=$state.sqlStartedUTC
Assert-Decision $sql $state 'different' 'CONNECTED' 'online' 'RECORD_CONNECTED'
$state.requiresReview=$true
Assert-Decision $sql $state 'abc' 'CONNECTED' 'online' 'REVIEW_PARTIAL_RECOVERY'
Assert-Decision $sql $null 'abc' 'CONNECTED' 'online' 'RECORD_CONNECTED'
$testDirectory=Join-Path ([IO.Path]::GetTempPath()) ('adc-recovery-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testDirectory)|Out-Null
$testPath=Join-Path $testDirectory 'state.json'
Save-AdcRecoveryJson $testPath @{requiresReview=$true;sqlPID=100}
Save-AdcRecoveryJson $testPath @{requiresReview=$false;sqlPID=200}
$read=Get-Content -Raw -LiteralPath $testPath|ConvertFrom-Json
if($read.requiresReview -or $read.sqlPID -ne 200 -or (Test-Path -LiteralPath ($testPath+'.tmp'))){throw 'Atomic state replacement failed'}
$checks++
Remove-Item -LiteralPath $testPath
[IO.Directory]::Delete($testDirectory)
Write-Output ($checks.ToString()+' recovery checks passed; no SQL or production operation performed.')

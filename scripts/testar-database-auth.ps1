[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $repositoryRoot 'database/scripts/solicitar-autenticacao-sql.ps1')
. (Join-Path $repositoryRoot 'database/scripts/sincronizar-certificado-sql-local.ps1')
function Read-Host { throw 'PROMPT_FORBIDDEN' }
function Assert-Auth([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message }; $script:passed++ }
$names = @('ADC_DB_USER','SQLCMDPASSWORD','ADC_DATABASE_SQL_USER','ADC_DATABASE_CREDENTIAL_FILE',
    'ADC_DATABASE_CONFIG','ADC_DATABASE_SQL_MODE','ADC_DATABASE_WINDOWS_AUTH','ADC_DATABASE_APPLY_ALL_CONFIRMED',
    'ADC_SQLCMD_EXECUTABLE','ADC_SQLCMD_SERVER_CERTIFICATE','ADC_SQLCMD_LOCAL_TLS_PROFILE','ADC_TEST_TLS_EXIT','FORCAR_AUTENTICACAO_SQL',
    'ADC_TEST_CREDENTIAL','ADC_TEST_TRACE','ADC_TEST_CONNECTION_EXIT','ADC_TEST_EXIT','PATH')
$before = @{}
foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name) }
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('adc-database-auth-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($tempRoot)
$passed = 0
try {
    foreach ($name in $names | Where-Object { $_ -ne 'PATH' }) { [Environment]::SetEnvironmentVariable($name,$null) }
    $profileFixture = [pscustomobject]@{machineGuid='11111111-2222-3333-4444-555555555555'; accountSid='S-1-5-21-1-2-3-1000'; sqlExecutable='C:\fixture\sqlservr.exe'}
    $serviceFixture = [pscustomobject]@{State='Running'; ProcessId=1234}
    $processFixture = [pscustomobject]@{ProcessId=1234; ExecutablePath=$profileFixture.sqlExecutable}
    $signatureFixture = [pscustomobject]@{Status='Valid'; SignerCertificate=[pscustomobject]@{Subject='CN=Microsoft Corporation, O=Microsoft Corporation'}}
    $listenerFixture = @([pscustomobject]@{OwningProcess=1234; LocalPort=1433; LocalAddress='127.0.0.1'})
    Assert-DatabaseSqlIdentity $profileFixture $profileFixture.machineGuid $profileFixture.accountSid $serviceFixture $processFixture $signatureFixture $listenerFixture
    Assert-Auth $true 'Verified local SQL identity must pass.'
    foreach ($case in @('machine','account','stopped','pid','executable','signature','signer','listenerOwner','listenerPort','listenerAddress','noListener')) {
        $machine=$profileFixture.machineGuid; $sid=$profileFixture.accountSid
        $service=$serviceFixture | ConvertTo-Json | ConvertFrom-Json
        $process=$processFixture | ConvertTo-Json | ConvertFrom-Json
        $signature=$signatureFixture | ConvertTo-Json | ConvertFrom-Json
        $listener=@($listenerFixture | ConvertTo-Json | ConvertFrom-Json)
        switch ($case) {
            machine { $machine='other-vm' }; account { $sid='other-account' }; stopped { $service.State='Stopped' }
            pid { $process.ProcessId=5678 }; executable { $process.ExecutablePath='C:\fixture\other.exe' }
            signature { $signature.Status='Invalid' }; signer { $signature.SignerCertificate.Subject='CN=Other, O=Other' }
            listenerOwner { $listener[0].OwningProcess=5678 }; listenerPort { $listener[0].LocalPort=1444 }
            listenerAddress { $listener[0].LocalAddress='192.0.2.1' }; noListener { $listener=@() }
        }
        $refused=$false
        try { Assert-DatabaseSqlIdentity $profileFixture $machine $sid $service $process $signature $listener } catch { $refused=$true }
        Assert-Auth $refused ('Local certificate refresh must refuse identity mismatch: '+$case)
    }
    $identityFixture=[pscustomobject]@{Pid=1234; Created=[DateTime]'2026-01-01'; Executable=$profileFixture.sqlExecutable}
    Assert-DatabaseSqlIdentityUnchanged $identityFixture $identityFixture
    Assert-Auth $true 'Stable SQL process identity must pass.'
    foreach ($case in @('Pid','Created','Executable')) {
        $changed=$identityFixture | ConvertTo-Json | ConvertFrom-Json
        switch ($case) { Pid {$changed.Pid=5678}; Created {$changed.Created=[DateTime]'2026-01-02'}; Executable {$changed.Executable='C:\fixture\other.exe'} }
        $refused=$false
        try { Assert-DatabaseSqlIdentityUnchanged $identityFixture $changed } catch { $refused=$true }
        Assert-Auth $refused ('SQL process changed during collection must be refused: '+$case)
    }
    $fingerprint='a'*64
    $bootFixture=[pscustomobject]@{status='TLS_PRIVATE_TRUST_REFRESHED_AND_PROBED';sqlServicePID=1234;tlsCertificateValidated=$true;
        queriesExecuted=0;sqlChanges=$false;globalTrustChanges=$false;certificateSHA256=$fingerprint;observedAtUTC='2026-01-02T00:00:00Z'}
    Assert-DatabaseSqlBootReceipt $bootFixture 1234 ([DateTime]'2026-01-01')
    Assert-Auth $true 'Verified protected boot proof must pass.'
    foreach ($case in @('status','pid','tls','queries','sqlChanges','globalTrust','hash','oldProof','futureProof')) {
        $changed=$bootFixture | ConvertTo-Json | ConvertFrom-Json
        switch ($case) {
            status {$changed.status='UNVERIFIED'}; pid {$changed.sqlServicePID=5678}; tls {$changed.tlsCertificateValidated=$false}
            queries {$changed.queriesExecuted=1}; sqlChanges {$changed.sqlChanges=$true}; globalTrust {$changed.globalTrustChanges=$true}
            hash {$changed.certificateSHA256='invalid'}; oldProof {$changed.observedAtUTC='2025-01-01T00:00:00Z'}
            futureProof {$changed.observedAtUTC=[DateTime]::UtcNow.AddDays(1).ToString('o')}
        }
        $refused=$false
        try { Assert-DatabaseSqlBootReceipt $changed 1234 ([DateTime]'2026-01-01') } catch { $refused=$true }
        Assert-Auth $refused ('Unverified or stale SQL boot proof must be refused: '+$case)
    }
    $captureFixture=[pscustomobject]@{captured=$true; handshakeAccepted=$false; credentialsSent=0; queriesExecuted=0; sha256=$fingerprint}
    Assert-DatabaseCertificateCapture $captureFixture $fingerprint
    Assert-Auth $true 'Public certificate collection without authentication must pass.'
    foreach ($case in @('captured','handshakeAccepted','credentialsSent','queriesExecuted','sha256')) {
        $changed=$captureFixture | ConvertTo-Json | ConvertFrom-Json
        switch ($case) { captured {$changed.captured=$false}; handshakeAccepted {$changed.handshakeAccepted=$true}; credentialsSent {$changed.credentialsSent=1}; queriesExecuted {$changed.queriesExecuted=1}; sha256 {$changed.sha256='b'*64} }
        $refused=$false
        try { Assert-DatabaseCertificateCapture $changed $fingerprint } catch { $refused=$true }
        Assert-Auth $refused ('Invalid public certificate collection must be refused: '+$case)
    }
    $env:ADC_TEST_CREDENTIAL = [Guid]::NewGuid().ToString('N') + '"%&!^'
    $env:ADC_DB_USER = 'fixture_login'
    $env:SQLCMDPASSWORD = $env:ADC_TEST_CREDENTIAL
    $env:ADC_TEST_EXIT = '0'
    $runner = Join-Path $tempRoot 'runner.bat'
    [IO.File]::WriteAllText($runner, @"
@echo off
powershell.exe -NoProfile -Command "if (`$env:ADC_DB_USER -ne 'fixture_login' -or `$env:ADC_DATABASE_SQL_USER -ne 'fixture_login' -or `$env:SQLCMDPASSWORD -cne `$env:ADC_TEST_CREDENTIAL) { exit 91 }"
if errorlevel 1 exit /b %ERRORLEVEL%
exit /b %ADC_TEST_EXIT%
"@, [Text.Encoding]::ASCII)
    foreach ($mode in @('','CHECK','CHECK_ALL','APPLY','APPLY_ALL','APPLY_BOOTSTRAP_PREREQUISITES','VALIDATE','RECOVER_V0001','RECOVER_EMPTY_BOOTSTRAP')) {
        $code = Invoke-DatabaseWithSqlAuthentication -RunnerPath $runner -Mode $mode
        Assert-Auth ($code -eq 0 -and -not $env:ADC_DATABASE_SQL_USER -and $env:SQLCMDPASSWORD -ceq $env:ADC_TEST_CREDENTIAL) ('Environment/credential preservation: '+$mode)
    }
    $env:ADC_TEST_EXIT = '23'
    Assert-Auth ((Invoke-DatabaseWithSqlAuthentication -RunnerPath $runner -Mode CHECK) -eq 23) 'Child failure must propagate.'
    $env:ADC_TEST_EXIT = '0'
    foreach ($login in @('','user&echo','user name')) {
        $env:ADC_DB_USER=$login; $refused=$false
        try { [void](Invoke-DatabaseWithSqlAuthentication -RunnerPath $runner -Mode CHECK) } catch { $refused=$true }
        Assert-Auth $refused 'Invalid or missing login must fail without input.'
    }
    $env:ADC_DB_USER='fixture_login'; $env:SQLCMDPASSWORD=$null; $refused=$false
    try { [void](Invoke-DatabaseWithSqlAuthentication -RunnerPath $runner -Mode CHECK) } catch { $refused=$true }
    Assert-Auth $refused 'Missing password must fail without input.'
    $credentialPath=Join-Path $tempRoot 'credential.xml'
    $secure=ConvertTo-SecureString -String $env:ADC_TEST_CREDENTIAL -AsPlainText -Force
    [Management.Automation.PSCredential]::new('fixture_login',$secure) | Export-Clixml -LiteralPath $credentialPath
    $env:ADC_DATABASE_CREDENTIAL_FILE=$credentialPath
    $env:ADC_DB_USER=$null
    Assert-Auth ((Invoke-DatabaseWithSqlAuthentication -RunnerPath $runner -Mode CHECK) -eq 0 -and -not $env:SQLCMDPASSWORD -and -not $env:ADC_DB_USER) 'DPAPI credential must load and leave no credential in caller environment.'
    Assert-Auth (-not [IO.File]::ReadAllText($credentialPath).Contains($env:ADC_TEST_CREDENTIAL)) 'Protected file must not contain plaintext password.'
    $env:ADC_DATABASE_CREDENTIAL_FILE=Join-Path $tempRoot 'absent.xml'; $refused=$false
    try { [void](Invoke-DatabaseWithSqlAuthentication -RunnerPath $runner -Mode CHECK) } catch { $refused=$true }
    Assert-Auth $refused 'Unavailable protected credential must fail without prompting or Windows fallback.'
    $env:ADC_DATABASE_CREDENTIAL_FILE=$null
    $dbRoot=Join-Path $tempRoot 'database'
    [void][IO.Directory]::CreateDirectory($dbRoot)
    Copy-Item (Join-Path $repositoryRoot 'database/executar-database.bat') $dbRoot
    Copy-Item (Join-Path $repositoryRoot 'database/scripts') $dbRoot -Recurse
    Copy-Item (Join-Path $repositoryRoot 'database/sql') $dbRoot -Recurse
    $bin=Join-Path $tempRoot 'bin'
    [void][IO.Directory]::CreateDirectory($bin)
    $stub=Join-Path $bin 'sqlcmd.exe'
    Add-Type -OutputAssembly $stub -OutputType ConsoleApplication -TypeDefinition @"
using System;
using System.IO;
using System.Linq;
class SqlFixture {
 static string Arg(string[] a,string key) { int i=Array.IndexOf(a,key); return i<0?null:a[i+1]; }
 static int Main(string[] a) {
  string login=Arg(a,"-U"), secret=Environment.GetEnvironmentVariable("SQLCMDPASSWORD");
  if(a.Contains("-P") || (secret!=null && a.Any(x=>x.Contains(secret)))) return 81;
  if(login!=null && (login!="fixture_login" || secret!=Environment.GetEnvironmentVariable("ADC_TEST_CREDENTIAL"))) return 82;
  if(login==null && !a.Contains("-E")) return 83;
  if(!a.Contains("-N") || (Environment.GetEnvironmentVariable("ADC_DB_NAME")=="AVALIACAO_PROD" && a.Contains("-C"))) return 84;
  string cert=Arg(a,"-J");
  if(cert!=null && (!File.Exists(cert) || Arg(a,"-N")!="true" || a.Contains("-C") || a.Contains("-f"))) return 85;
  File.AppendAllText(Environment.GetEnvironmentVariable("ADC_TEST_TRACE"),(login==null?"WINDOWS":"SQL")+"|"+Environment.GetEnvironmentVariable("ADC_DB_NAME")+"|"+(cert==null?"STANDARD":"PINNED")+Environment.NewLine);
  string input=Arg(a,"-i");
  if(input!=null) { if(Path.GetFileName(input)!="003_verificar_banco.sql") return 86; Console.WriteLine("MISSING"); }
  else { if(Arg(a,"-Q")!="SET NOCOUNT ON; SELECT 1;") return 87; string failure=Environment.GetEnvironmentVariable("ADC_TEST_CONNECTION_EXIT"); if(!string.IsNullOrEmpty(failure))return int.Parse(failure); }
  return 0;
 }
}
"@
    $env:PATH=$bin+';'+$env:PATH
    $env:ADC_TEST_TRACE=Join-Path $tempRoot 'sql-trace.txt'
    [IO.File]::WriteAllText($env:ADC_TEST_TRACE,'')
    $cert=Join-Path $tempRoot 'public-fixture.pem'
    [IO.File]::WriteAllText($cert,'PUBLIC_FIXTURE_ONLY')
    foreach ($target in @(@('config.local.bat','AVALIACAO_DEV'),@('config.production.local.bat','AVALIACAO_PROD'))) {
        $text="@echo off`r`nset `"ADC_DB_SERVER=localhost`"`r`nset `"ADC_DB_PORT=1433`"`r`nset `"ADC_DB_NAME=$($target[1])`"`r`nset `"ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=0`"`r`nset `"ADC_DB_USER=configured_login`"`r`nset `"ADC_DATABASE_CREDENTIAL_FILE=$credentialPath`"`r`nset `"ADC_SQLCMD_EXECUTABLE=$stub`"`r`nset `"ADC_SQLCMD_SERVER_CERTIFICATE=$cert`"`r`nexit /b 0`r`n"
        [IO.File]::WriteAllText((Join-Path $dbRoot $target[0]),$text,[Text.Encoding]::ASCII)
    }
    Push-Location $dbRoot
    try {
        $output=& cmd.exe /d /c 'executar-database.bat --check-all 2>&1' | Out-String
        $trace=[IO.File]::ReadAllLines($env:ADC_TEST_TRACE)
        Assert-Auth ($LASTEXITCODE -eq 0 -and $trace.Length -eq 4 -and $trace[0] -eq 'SQL|AVALIACAO_DEV|PINNED' -and $trace[2] -eq 'SQL|AVALIACAO_PROD|PINNED') 'Automatic protected authentication, certificate pinning and DEV/PROD order.'
        Assert-Auth (-not $output.Contains($env:ADC_TEST_CREDENTIAL)) 'Password must not be printed.'
        $syncFixture=Join-Path $dbRoot 'scripts/sincronizar-certificado-sql-local.ps1'
        [IO.File]::WriteAllText($syncFixture,"Write-Output 'TLS_SYNC_FIXTURE'; exit ([int]`$env:ADC_TEST_TLS_EXIT)",[Text.Encoding]::ASCII)
        $env:ADC_SQLCMD_LOCAL_TLS_PROFILE='fixture-profile-only'
        $env:ADC_TEST_TLS_EXIT='19'
        $count=$trace.Length
        $output=& cmd.exe /d /c 'executar-database.bat --check-all 2>&1' | Out-String
        Assert-Auth ($LASTEXITCODE -eq 1 -and [IO.File]::ReadAllLines($env:ADC_TEST_TRACE).Length -eq $count) 'Refused certificate synchronization must stop before SQL authentication.'
        $env:ADC_TEST_TLS_EXIT='0'
        $output=& cmd.exe /d /c 'executar-database.bat --check-all 2>&1' | Out-String
        $trace=[IO.File]::ReadAllLines($env:ADC_TEST_TRACE)
        Assert-Auth ($LASTEXITCODE -eq 0 -and $trace.Length -eq $count+4 -and ([regex]::Matches($output,'TLS_SYNC_FIXTURE')).Count -eq 2) 'Both targets must synchronize their certificate before connecting.'
        $env:ADC_SQLCMD_LOCAL_TLS_PROFILE=$null
        $output=& cmd.exe /d /c 'executar-database.bat --check-all --windows 2>&1' | Out-String
        $trace=[IO.File]::ReadAllLines($env:ADC_TEST_TRACE)
        Assert-Auth ($LASTEXITCODE -eq 0 -and $trace[-4] -eq 'WINDOWS|AVALIACAO_DEV|PINNED' -and $trace[-2] -eq 'WINDOWS|AVALIACAO_PROD|PINNED') 'Explicit Windows must override local SQL credential.'
        foreach ($argsText in @('--sql --windows','--windows --sql')) {
            $count=$trace.Length
            $output=& cmd.exe /d /c ('executar-database.bat '+$argsText+' 2>&1') | Out-String
            Assert-Auth ($LASTEXITCODE -ne 0 -and [IO.File]::ReadAllLines($env:ADC_TEST_TRACE).Length -eq $count) 'Conflicting auth choices must not connect.'
        }
        $env:ADC_TEST_CONNECTION_EXIT='88'
        $count=$trace.Length
        $output=& cmd.exe /d /c 'executar-database.bat 2>&1' | Out-String
        $trace=[IO.File]::ReadAllLines($env:ADC_TEST_TRACE)
        Assert-Auth ($LASTEXITCODE -eq 1 -and $trace.Length -eq $count+1 -and $trace[-1] -eq 'SQL|AVALIACAO_DEV|PINNED') 'No-argument automatic mode must stop after failed DEV connection.'
        $env:ADC_DATABASE_CREDENTIAL_FILE=$credentialPath
        $output=& cmd.exe /d /c 'executar-database.bat --check --sql 2>&1' | Out-String
        Assert-Auth ($LASTEXITCODE -eq 1 -and -not $output.Contains($env:ADC_TEST_CREDENTIAL)) 'Explicit SQL must load existing protected credential without exposing it.'
    } finally { Pop-Location }
    $global:LASTEXITCODE=0
    Write-Host "Autenticacao automatica: $passed verificacoes aprovadas; SQL simulado; nenhum prompt."
} finally {
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$before[$name])}
    $resolved=[IO.Path]::GetFullPath($tempRoot)
    $prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
    if(-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or -not [IO.Path]::GetFileName($resolved).StartsWith('adc-database-auth-') -or (Get-Item $resolved -Force).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)){throw 'Unsafe fixture cleanup target'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

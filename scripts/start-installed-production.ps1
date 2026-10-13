[CmdletBinding()]
param([switch]$Elevated)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$private='C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\sql-recovery'
$runtime='C:\Users\suporte\Documents\projetos\.runtime\pm2'
$node='C:\Program Files\nodejs\node.exe'
$windowsPowerShell='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
try{
    if($identity.User.Value -cne 'S-1-5-21-263687237-119212591-4036808788-1000'){throw 'WINDOWS_ACCOUNT_CHANGED'}
    if(!([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
        if($Elevated){throw 'ELEVATION_REQUIRED'}
        Write-Host 'Confirmar a janela do Windows para subir a Avaliacao no gerenciador existente.'
        $child=Start-Process -FilePath $windowsPowerShell -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -Elevated')
        if($child.ExitCode -eq 0){Write-Host 'Avaliacao pronta: https://formulario.rodogarcia.com.br/'}
        exit $child.ExitCode
    }
    . (Join-Path $private 'watch-local-sql-recovery.ps1')
    . (Join-Path $PSScriptRoot 'prepare-production-config.ps1')
    Assert-NoReparsePoint $private
    Assert-PrivateAcl $private
    $baseline=Get-Content -Raw -LiteralPath (Join-Path $private 'dependencies.json')|ConvertFrom-Json
    foreach($file in $baseline.files){
        Assert-NoReparsePoint $file.path
        if((Get-FileHash -LiteralPath $file.path).Hash -ine $file.sha256){throw 'INSTALLED_ARTIFACT_CHANGED'}
    }
    $lock=[IO.File]::Open((Join-Path $private 'recovery.lock'),'OpenOrCreate','ReadWrite','None')
    try{
        $ensure=Join-Path $private 'ensure-avaliacao-running.cjs'
        $raw=& $node $ensure
        if($LASTEXITCODE -ne 0){throw 'APPLICATION_PREFLIGHT_FAILED'}
        $statePath=Join-Path $private 'state.json'
        $previous=if(Test-Path -LiteralPath $statePath){Get-Content -Raw -LiteralPath $statePath|ConvertFrom-Json}else{$null}
        Save-AdcRecoveryJson $statePath @{sqlPID=0;sqlStartedUTC='';configSHA256='';requiresReview=$true}
        # Existing helper verifies SQL executable/signature/listener and tests the candidate before promotion.
        $tlsRaw=& (Join-Path $runtime 'refresh-local-sql-tls.ps1')
        $tls=($tlsRaw -join [Environment]::NewLine)|ConvertFrom-Json
        $restartApi=$tls.changed -or ($null -ne $previous -and $previous.requiresReview)
        $argsForNode=@('--apply');if($restartApi){$argsForNode+='--restart-api'}
        $raw=& $node $ensure @argsForNode
        if($LASTEXITCODE -ne 0){throw 'APPLICATION_START_FAILED'}
        $ready=$false
        for($attempt=0;$attempt -lt 45;$attempt++){
            try{
                $api=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:28081/api/v1/auth/csrf' -TimeoutSec 2
                $front=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:38080/' -TimeoutSec 2
                if($api.StatusCode -eq 200 -and $front.StatusCode -eq 200){$ready=$true;break}
            }catch{}
            Start-Sleep -Seconds 1
        }
        if(!$ready){throw 'APPLICATION_READINESS_TIMEOUT'}
        $java='C:\Users\suporte\AppData\Local\Programs\Eclipse Adoptium\jdk-21\bin\java.exe'
        $config='C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\avaliacao-prod.properties'
        $probeRaw=& $java -cp ($runtime+'\tls-tools;'+$runtime+'\tls-tools\mssql-jdbc-13.4.0.jre11.jar') JdbcReadOnlyProbe $config
        if($LASTEXITCODE -ne 0){throw 'DATABASE_CONNECTION_UNAVAILABLE'}
        $sql=Get-CimInstance Win32_Service -Filter "Name='MSSQLSERVER'"
        $proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$sql.ProcessId)
        Save-AdcRecoveryJson $statePath @{sqlPID=[int]$sql.ProcessId;sqlStartedUTC=$proc.CreationDate.ToUniversalTime().ToString('o');configSHA256=(Get-FileHash -LiteralPath $config).Hash.ToLowerInvariant();requiresReview=$false}
        Save-AdcRecoveryJson (Join-Path $private 'start-result.json') @{status='AVALIACAO_READY';observedAtUTC=[DateTime]::UtcNow.ToString('o');databaseConnected=$true;tlsValidated=$true;runtime=($raw -join [Environment]::NewLine|ConvertFrom-Json)}
        Write-Host 'Avaliacao pronta: https://formulario.rodogarcia.com.br/'
    }finally{$lock.Dispose()}
    exit 0
}catch{
    $code=if($_.Exception.Message -cmatch '^[A-Z_]+$'){$_.Exception.Message}else{'CHECK_OR_START_FAILED'}
    Write-Host ('Nao foi possivel concluir a subida: '+$code+'.')
    if(Test-Path -LiteralPath $private){[IO.File]::WriteAllText((Join-Path $private 'start-error.txt'),([DateTime]::UtcNow.ToString('o')+' '+$code))}
    exit 1
}

Set-StrictMode -Version Latest

function Get-ProductionCaller {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        return [pscustomobject]@{
            Sid = $identity.User.Value
            Administrator = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole(
                [Security.Principal.WindowsBuiltInRole]::Administrator)
        }
    } finally { $identity.Dispose() }
}

function Get-ProductionAccessDecision {
    param([int]$ProbeExitCode, [bool]$Administrator)
    if ($ProbeExitCode -eq 0) { return 'DIRECT' }
    if ($ProbeExitCode -eq 5 -and -not $Administrator) { return 'ELEVATE' }
    return 'BLOCKED'
}

function New-ProductionElevationCommand {
    param([string]$Launcher, [string]$CallerSid, [string]$LogPath)
    # Only local paths and the caller SID are embedded, escaped as PS literals.
    $launcherLiteral = $Launcher.Replace("'", "''")
    $sidLiteral = $CallerSid.Replace("'", "''")
    $logLiteral = $LogPath.Replace("'", "''")
    return @"
`$ErrorActionPreference = 'Stop'
`$result = 1
`$transcribing = `$false
try {
    `$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        if (`$identity.User.Value -cne '$sidLiteral') { throw 'WINDOWS_ACCOUNT_CHANGED' }
        if (-not ([Security.Principal.WindowsPrincipal]::new(`$identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ELEVATION_REQUIRED' }
    } finally { `$identity.Dispose() }
    Start-Transcript -LiteralPath '$logLiteral' -Force | Out-Null
    `$transcribing = `$true
    Write-Host '[Avaliacao PROD] Execucao elevada iniciada.'
    & '$launcherLiteral' --publicar
    `$result = `$LASTEXITCODE
} catch {
    Write-Host ('[Avaliacao PROD] Publicacao interrompida: ' + `$_.Exception.Message)
    `$result = 1
} finally {
    if (`$transcribing) { Stop-Transcript | Out-Null }
}
exit `$result
"@
}

function Invoke-ProductionElevation {
    param([Parameter(Mandatory)][string]$CallerSid)
    . (Join-Path $PSScriptRoot 'prepare-production-config.ps1')
    $logDirectory = Join-Path ([IO.Path]::GetTempPath()) ('adc-publicacao-' + [guid]::NewGuid().ToString('N'))
    New-PrivateDirectory $logDirectory
    $logPath = Join-Path $logDirectory 'publicacao.log'
    $launcher = Join-Path $PSScriptRoot 'run-production-from-env.ps1'
    $command = New-ProductionElevationCommand -Launcher $launcher -CallerSid $CallerSid -LogPath $logPath
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $powershell = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
    Write-Host '[Avaliacao PROD] Confirme o UAC da mesma conta para publicar usando o PM2 existente.'
    Write-Host "[Avaliacao PROD] Log da publicacao: $logPath"
    $child = $null
    $reader = $null
    $showOutput = $false
    try {
        $child = Start-Process -FilePath $powershell -Verb RunAs -WindowStyle Hidden -PassThru `
            -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + $encoded)
        do {
            $finished = $child.HasExited
            if ($null -eq $reader -and (Test-Path -LiteralPath $logPath)) {
                $stream = [IO.File]::Open($logPath, 'Open', 'Read', 'ReadWrite')
                $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true)
            }
            if ($null -ne $reader) {
                while ($null -ne ($line = $reader.ReadLine())) {
                    if ($line -eq '[Avaliacao PROD] Execucao elevada iniciada.') { $showOutput = $true }
                    if ($showOutput) { Write-Host $line }
                }
            }
            if (-not $finished) { Start-Sleep -Milliseconds 250 }
        } while (-not $finished)
        $child.WaitForExit()
        if ($child.ExitCode -ne 0) {
            Write-Host '[Avaliacao PROD] Publicacao nao concluida. Consulte a falha acima e o log; nao houve repeticao automatica.'
        }
        return $child.ExitCode
    } catch {
        if ($_.Exception -is [ComponentModel.Win32Exception] -and $_.Exception.NativeErrorCode -eq 1223) {
            Write-Host '[Avaliacao PROD] UAC cancelado; a publicacao nao foi iniciada.'
            return 1
        }
        throw
    } finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $child) { $child.Dispose() }
    }
}

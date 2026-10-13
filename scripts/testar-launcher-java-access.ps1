[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:cases = 0
function Assert-LauncherCase([bool]$Condition, [string]$Name) {
    if (-not $Condition) { throw "LAUNCHER_FIXTURE_FAILED: $Name" }
    $script:cases++
}

# Isolate candidate discovery/version reads; no real Java, SQL or PM2 starts here.
& {
    . (Join-Path $PSScriptRoot 'select-production-java.ps1')
    $originalJava = $env:JAVA_HOME
    $originalPath = $env:PATH
    function Get-ChildItem {
        param($LiteralPath, [switch]$Directory)
        foreach ($major in $script:availableVersions) {
            [pscustomobject]@{ Name = "jdk-$major"; FullName = "C:\fixture\jdk-$major" }
        }
    }
    function Test-Path {
        param($LiteralPath, $PathType)
        return -not ($LiteralPath -like '*jdk-22*javac.exe')
    }
    function Get-LauncherJavaMajorVersion {
        param($JavaExecutable)
        return [int]([regex]::Match($JavaExecutable, 'jdk-(\d+)').Groups[1].Value)
    }
    try {
        foreach ($scenario in @(
            @{ Home = 'C:\fixture\jdk-17'; Versions = @(21); Expected = 21 },
            @{ Home = ''; Versions = @(21); Expected = 21 },
            @{ Home = 'C:\fixture\jdk-25'; Versions = @(21); Expected = 25 },
            @{ Home = 'C:\fixture\jdk-26'; Versions = @(21); Expected = 21 },
            @{ Home = 'C:\fixture\jdk-22'; Versions = @(21); Expected = 21 },
            @{ Home = 'C:\fixture\jdk-17'; Versions = @(17, 26); Expected = 0 }
        )) {
            $env:JAVA_HOME = $scenario.Home
            $env:PATH = $originalPath
            $script:availableVersions = $scenario.Versions
            $failed = $false
            try { Select-ProductionJava -Mode DEV 6>$null } catch { $failed = $true }
            if ($scenario.Expected -eq 0) {
                Assert-LauncherCase $failed 'no compatible JDK is refused'
                Assert-LauncherCase ($env:JAVA_HOME -eq $scenario.Home -and $env:PATH -eq $originalPath) 'failure preserves environment'
            } else {
                Assert-LauncherCase (-not $failed -and $env:JAVA_HOME -eq "C:\fixture\jdk-$($scenario.Expected)") 'compatible full JDK selected'
                Assert-LauncherCase ($env:PATH.StartsWith("C:\fixture\jdk-$($scenario.Expected)\bin;")) 'Maven and runtime share Java'
            }
        }
    } finally { $env:JAVA_HOME = $originalJava; $env:PATH = $originalPath }
}

. (Join-Path $PSScriptRoot 'production-launcher-access.ps1')
foreach ($scenario in @(
    @(0, $false, 'DIRECT'), @(0, $true, 'DIRECT'),
    @(5, $false, 'ELEVATE'), @(5, $true, 'BLOCKED'),
    @(1, $false, 'BLOCKED'), @(1, $true, 'BLOCKED')
)) {
    Assert-LauncherCase ((Get-ProductionAccessDecision $scenario[0] $scenario[1]) -eq $scenario[2]) 'PM2 access decision'
}

$fixture = Join-Path ([IO.Path]::GetTempPath()) ('adc-java-access-test-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory((Join-Path $fixture 'scripts'))
$originalJava = $env:JAVA_HOME
$originalPath = $env:PATH
$script:elevationLogDirectories = @()
$originalProbe = $env:ADC_TEST_PROBE
$originalAdmin = $env:ADC_TEST_ADMIN
try {
    # Execute actual DEV flow, replacing only the build with a sentinel that aborts
    # before certificates, listeners, application processes or database access.
    $devSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'iniciar-dev-local.ps1'))
    $tokens = $null; $parseErrors = $null
    $ast = [Management.Automation.Language.Parser]::ParseInput($devSource, [ref]$tokens, [ref]$parseErrors)
    $build = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'New-DevelopmentBackendArtifact' }, $true)
    $devSource = $devSource.Substring(0, $build.Body.Extent.StartOffset) + '{ throw ("BUILD_SENTINEL:" + $env:JAVA_HOME) }' + $devSource.Substring($build.Body.Extent.EndOffset)
    $devFixture = Join-Path $fixture 'scripts\iniciar-dev-local.ps1'
    [IO.File]::WriteAllText($devFixture, $devSource, [Text.UTF8Encoding]::new($true))
    [IO.File]::WriteAllText((Join-Path $fixture 'scripts\select-production-java.ps1'), @'
function Select-ProductionJava {
    param([string]$Mode)
    if ($Mode -ne 'DEV') { throw 'WRONG_JAVA_MODE' }
    $env:JAVA_HOME = 'C:\fixture\jdk-21'
    $env:PATH = 'C:\fixture\jdk-21\bin;' + $env:PATH
}
'@)
    foreach ($initialHome in @('C:\fixture\jdk-17', '')) {
        $env:JAVA_HOME = $initialHome
        $failure = ''
        try { & $devFixture 6>$null } catch { $failure = $_.Exception.Message }
        Assert-LauncherCase ($failure -eq 'BUILD_SENTINEL:C:\fixture\jdk-21') 'DEV selects Java before Maven build'
        Assert-LauncherCase ([string]$env:JAVA_HOME -eq $initialHome -and $env:PATH -eq $originalPath) 'DEV restores caller environment after failure'
    }

    # Exercise the complete production wrapper with harmless dependency shims.
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-production-from-env.ps1') -Destination (Join-Path $fixture 'scripts')
    [IO.File]::WriteAllText((Join-Path $fixture 'scripts\production-launcher-access.ps1'), ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'production-launcher-access.ps1')) + @'

function Get-ProductionCaller { return [pscustomobject]@{ Sid = 'fixture'; Administrator = ($env:ADC_TEST_ADMIN -eq '1') } }
function Invoke-ProductionElevation { param($CallerSid); Write-Host 'ELEVATION_SENTINEL'; return 17 }
'@))
    [IO.File]::WriteAllText((Join-Path $fixture 'scripts\select-production-java.ps1'), "function Select-ProductionJava { Write-Host 'JAVA_SENTINEL' }")
    [IO.File]::WriteAllText((Join-Path $fixture 'node.cmd'), "@echo off`r`necho PROBE_SENTINEL`r`nexit /b %ADC_TEST_PROBE%`r`n")
    [IO.File]::WriteAllText((Join-Path $fixture 'iniciar-prod.bat'), "@echo off`r`necho PUBLISH_SENTINEL %*`r`nexit /b 23`r`n")
    $env:PATH = $fixture + ';' + $originalPath
    foreach ($scenario in @(
        @{ Args = ''; Probe = 0; Admin = 0; Exit = 23; Marker = 'PUBLISH_SENTINEL' },
        @{ Args = '--publicar'; Probe = 5; Admin = 0; Exit = 17; Marker = 'ELEVATION_SENTINEL' },
        @{ Args = ''; Probe = 5; Admin = 1; Exit = 1; Marker = 'Publicacao interrompida' },
        @{ Args = ''; Probe = 1; Admin = 0; Exit = 1; Marker = 'Publicacao interrompida' },
        @{ Args = '--check'; Probe = 5; Admin = 0; Exit = 23; Marker = 'PUBLISH_SENTINEL --check' },
        @{ Args = '--invalid'; Probe = 0; Admin = 0; Exit = 2; Marker = 'Use iniciar-prod.bat' },
        @{ Args = '--publicar extra'; Probe = 0; Admin = 0; Exit = 2; Marker = 'Use iniciar-prod.bat' }
    )) {
        $env:ADC_TEST_PROBE = [string]$scenario.Probe
        $env:ADC_TEST_ADMIN = [string]$scenario.Admin
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $fixture 'scripts\run-production-from-env.ps1'))
        if ($scenario.Args) { $arguments += $scenario.Args -split ' ' }
        $output = & powershell.exe @arguments | Out-String
        Assert-LauncherCase ($LASTEXITCODE -eq $scenario.Exit -and $output.Contains($scenario.Marker)) 'production wrapper routing and exit code'
        if ($scenario.Exit -ne 23) {
            Assert-LauncherCase (-not $output.Contains('PUBLISH_SENTINEL') -and -not $output.Contains('JAVA_SENTINEL')) 'blocked or elevated parent cannot build'
        }
        if ($scenario.Args -eq '--check' -or $scenario.Exit -eq 2) {
            Assert-LauncherCase (-not $output.Contains('PROBE_SENTINEL') -and -not $output.Contains('ELEVATION_SENTINEL')) 'diagnostics and invalid arguments do not elevate'
        }
    }
    $env:PATH = $originalPath

    # Real cmd + nested PowerShell under a transcript: output must arrive before
    # the child exits. A finished-process mock did not catch the original defect.
    $env:ADC_TEST_PROBE = '0'; $env:ADC_TEST_ADMIN = '0'
    [IO.File]::WriteAllText((Join-Path $fixture 'iniciar-prod.bat'), "@echo off`r`necho NATIVE_BEFORE_WAIT`r`npowershell.exe -NoProfile -NonInteractive -Command `"Start-Sleep -Seconds 5; Write-Output 'NATIVE_AFTER_WAIT'`"`r`nexit /b 23`r`n")
    $transcriptPath = Join-Path $fixture 'stream.log'
    $driverPath = Join-Path $fixture 'stream-driver.ps1'
    $driver = "Start-Transcript -LiteralPath '$transcriptPath' -Force | Out-Null`n& '$(Join-Path $fixture 'scripts\run-production-from-env.ps1')' --publicar`n`$code = `$LASTEXITCODE`nStop-Transcript | Out-Null`nexit `$code"
    [IO.File]::WriteAllText($driverPath, $driver)
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = (Get-Command powershell.exe).Source
    $info.Arguments = '-NoProfile -NonInteractive -File "' + $driverPath + '"'
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $info.EnvironmentVariables['PATH'] = $fixture + ';' + $originalPath
    $streamChild = [Diagnostics.Process]::Start($info)
    try {
        $stdout = $streamChild.StandardOutput.ReadToEndAsync()
        $stderr = $streamChild.StandardError.ReadToEndAsync()
        $deadline = [DateTime]::UtcNow.AddSeconds(4)
        $streamed = $false
        do {
            if (Test-Path -LiteralPath $transcriptPath) {
                $logStream = [IO.File]::Open($transcriptPath, 'Open', 'Read', 'ReadWrite')
                $logReader = [IO.StreamReader]::new($logStream)
                try { $streamed = $logReader.ReadToEnd().Contains('NATIVE_BEFORE_WAIT') }
                finally { $logReader.Dispose() }
            }
            if ($streamed) { break }
            Start-Sleep -Milliseconds 100
        } while ([DateTime]::UtcNow -lt $deadline)
        Assert-LauncherCase ($streamed -and -not $streamChild.HasExited) 'native output transcribed while child still running'
        Assert-LauncherCase ($streamChild.WaitForExit(15000)) 'native fixture finishes'
        Assert-LauncherCase ($streamChild.ExitCode -eq 23) 'native fixture preserves failure code'
        Assert-LauncherCase ([IO.File]::ReadAllText($transcriptPath).Contains('NATIVE_AFTER_WAIT')) 'nested PowerShell output transcribed'
        $null = $stdout.GetAwaiter().GetResult(); $null = $stderr.GetAwaiter().GetResult()
    } finally {
        if (-not $streamChild.HasExited) { $streamChild.Kill(); $streamChild.WaitForExit() }
        $streamChild.Dispose()
    }

    # Production gate must delegate credential handling without asking anything.
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'verify-production-quality.ps1') -Destination (Join-Path $fixture 'scripts')
    [IO.File]::WriteAllText((Join-Path $fixture 'scripts\verify-quality.ps1'), 'param($BackendBuildDirectory); Write-Output "GATE_WITHOUT_PROMPT:$BackendBuildDirectory"; exit 29')
    $gateOutput = & powershell.exe -NoProfile -NonInteractive -Command "`$env:ADC_DB_USER='fixture_login'; `$env:SQLCMDPASSWORD=`$null; & '$(Join-Path $fixture 'scripts\verify-production-quality.ps1')' -BackendBuildDirectory target/fixture; exit `$LASTEXITCODE" | Out-String
    Assert-LauncherCase ($LASTEXITCODE -eq 29 -and $gateOutput.Contains('GATE_WITHOUT_PROMPT:target/fixture')) 'SQL user without password never triggers prompt in publication wrapper'

    # Check the actual elevated payload and forwarding without requesting UAC.
    $script:cancelElevation = $false
    $script:elevationLogDirectories = @()
    function Start-Process {
        param($FilePath, $Verb, $WindowStyle, [switch]$PassThru, $ArgumentList)
        Assert-LauncherCase ($Verb -eq 'RunAs' -and $WindowStyle -eq 'Hidden' -and $PassThru) 'standard UAC only'
        $encoded = ($ArgumentList -split ' ')[-1]
        $command = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($encoded))
        $tokens = $null; $parseErrors = $null
        [void][Management.Automation.Language.Parser]::ParseInput($command, [ref]$tokens, [ref]$parseErrors)
        Assert-LauncherCase ($parseErrors.Count -eq 0) 'elevated payload parses'
        Assert-LauncherCase ($command.Contains("-cne 'S-1-5-21-1000'") -and $command.Contains('WindowsBuiltInRole]::Administrator')) 'same SID and elevated token required'
        Assert-LauncherCase ($command.Contains('run-production-from-env.ps1') -and $command.Contains('--publicar') -and -not $command.Contains('--publicar | Out-Host')) 'full publication reenters guarded wrapper without outer output buffering'
        $logPath = [regex]::Match($command, "Start-Transcript -LiteralPath '([^']+)'").Groups[1].Value
        $script:elevationLogDirectories += Split-Path -Parent $logPath
        if ($script:cancelElevation) { throw [ComponentModel.Win32Exception]::new(1223) }
        [IO.File]::WriteAllText($logPath, "TRANSCRIPT_HEADER_HIDDEN`r`n[Avaliacao PROD] Execucao elevada iniciada.`r`nBUILD_FIXTURE_OUTPUT`r`n", [Text.UTF8Encoding]::new($false))
        $child = [pscustomobject]@{ HasExited = $true; ExitCode = 17 }
        $child | Add-Member ScriptMethod WaitForExit {}
        $child | Add-Member ScriptMethod Dispose {}
        return $child
    }
    $result = Invoke-ProductionElevation -CallerSid 'S-1-5-21-1000' 6>&1
    Assert-LauncherCase ($result[-1] -eq 17) 'child failure code is preserved'
    Assert-LauncherCase (($result | Out-String).Contains('BUILD_FIXTURE_OUTPUT')) 'child output reaches original terminal'
    Assert-LauncherCase (-not ($result | Out-String).Contains('TRANSCRIPT_HEADER_HIDDEN')) 'transcript metadata is not sent to terminal'
    $script:cancelElevation = $true
    Assert-LauncherCase ((Invoke-ProductionElevation -CallerSid 'S-1-5-21-1000' 6>$null) -eq 1) 'UAC cancellation fails without fallback'

    $command = New-ProductionElevationCommand -Launcher "C:\fixture's folder\launcher.ps1" -CallerSid 'S-1-5-21-1000' -LogPath "C:\fixture's folder\run.log"
    $tokens = $null; $parseErrors = $null
    [void][Management.Automation.Language.Parser]::ParseInput($command, [ref]$tokens, [ref]$parseErrors)
    Assert-LauncherCase ($parseErrors.Count -eq 0) 'paths with apostrophes are escaped'
} finally {
    $env:JAVA_HOME = $originalJava; $env:PATH = $originalPath
    $env:ADC_TEST_PROBE = $originalProbe; $env:ADC_TEST_ADMIN = $originalAdmin
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    foreach ($owned in @($fixture) + @($script:elevationLogDirectories)) {
        $resolved = [IO.Path]::GetFullPath($owned)
        if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
            (Split-Path -Leaf $resolved) -notmatch '^adc-(java-access-test|publicacao)-[a-f0-9]{32}$') { throw 'UNSAFE_FIXTURE_CLEANUP' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
$global:LASTEXITCODE = 0
Write-Host "Java/UAC: $script:cases verificacoes aprovadas, sem aplicacao, SQL, PM2 ou UAC real."

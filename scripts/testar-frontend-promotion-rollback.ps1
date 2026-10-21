Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('adc-frontend-rollback-' + [guid]::NewGuid().ToString('N'))
$helperSource = Join-Path $PSScriptRoot 'frontend-staging.ps1'
$api = 'https://api.synthetic.invalid/api/v1'
$script:checks = 0
$previousEnvironment = @{}
foreach ($name in @('ADC_FRONTEND_BUILD_DIRECTORY', 'ADC_FRONTEND_API_BASE_URL', 'ADC_BROWSER_ARTIFACT_DIRECTORY', 'ADC_CYCLE_SCREENSHOT_DIRECTORY', 'VITE_API_BASE_URL')) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}

function Assert-RollbackCase {
    param([bool]$Passed, [string]$Message)
    if (-not $Passed) { throw $Message }
    $script:checks++
}

function Write-FixtureFile {
    param([string]$Path, [string]$Content)
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($Path)) -Force | Out-Null
    if ([IO.Path]::GetExtension($Path) -eq '.ps1') {
        [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($true))
    }
    else { [IO.File]::WriteAllText($Path, $Content) }
}

function Read-FixtureLog {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $reader = [IO.StreamReader]::new($stream)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Get-FixtureProcessDiagnostic {
    param([Diagnostics.Process]$Process, [string]$LogPrefix)
    $exited = $Process.HasExited
    return ([ordered]@{
        pid = $Process.Id
        hasExited = $exited
        exitCode = if ($exited) { $Process.ExitCode } else { $null }
        stdout = Read-FixtureLog ($LogPrefix + '.stdout.log')
        stderr = Read-FixtureLog ($LogPrefix + '.stderr.log')
    } | ConvertTo-Json -Compress)
}

function Get-FixtureInventory {
    param([string]$Directory)
    $lines = @(foreach ($item in Get-ChildItem -LiteralPath $Directory -Recurse -Force | Sort-Object FullName) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Unexpected fixture link.' }
        $relative = $item.FullName.Substring($Directory.Length).TrimStart('\', '/').Replace('\', '/')
        if ($item.PSIsContainer) { 'D:' + $relative }
        else {
            'F:' + $relative + ':' + (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash + ':' + $item.LastWriteTimeUtc.Ticks
        }
    })
    return ($lines -join "`n")
}

function New-RollbackFixture {
    param([string]$Name, [switch]$LogoDirectory)
    $root = Join-Path $fixtureRoot $Name
    $repository = Join-Path $root 'repository with spaces'
    $helper = Join-Path $repository 'scripts\frontend-staging.ps1'
    $mutexName = 'Local\Rodogarcia-Avaliacao-Frontend-Promotion-fixture-' + [guid]::NewGuid().ToString('N')
    $source = [IO.File]::ReadAllText($helperSource)
    $productionMutex = 'Global\Rodogarcia-Avaliacao-Frontend-Promotion-v1'
    if (-not $source.Contains($productionMutex)) { throw 'Promotion mutex contract changed; review fixture isolation.' }
    $source = $source.Replace($productionMutex, $mutexName)
    Write-FixtureFile $helper $source
    $served = Join-Path $repository 'frontend\dist'
    Write-FixtureFile (Join-Path $served 'index.html') '<script src="/assets/old.js"></script>'
    Write-FixtureFile (Join-Path $served 'assets\old.js') 'approved-old-application'
    Write-FixtureFile (Join-Path $served 'unused\preserved.txt') 'never-delete-this-file'
    if ($LogoDirectory) { Write-FixtureFile (Join-Path $served 'logo.svg\sentinel.txt') 'directory-must-remain' }
    else { Write-FixtureFile (Join-Path $served 'logo.svg') 'approved-old-logo' }
    foreach ($file in Get-ChildItem -LiteralPath $served -Recurse -File) {
        [IO.File]::SetLastWriteTimeUtc($file.FullName, [DateTime]::Parse('2026-10-01T01:02:03.4567890Z').ToUniversalTime())
    }
    return [pscustomobject]@{ Root = $root; Repository = $repository; Helper = $helper; Served = $served; Mutex = $mutexName }
}

function New-ApprovedRollbackCandidate {
    param([string]$Marker)
    $stage = Initialize-FrontendStage
    Start-FrontendBuild -Directory $stage.BuildDirectory -ApiBaseUrl $api
    Write-FixtureFile (Join-Path $stage.BuildDirectory 'index.html') ('<script src="/assets/new.js"></script><!--' + $Marker + '-->')
    Write-FixtureFile (Join-Path $stage.BuildDirectory 'logo.svg') ('new-logo-' + $Marker)
    Write-FixtureFile (Join-Path $stage.BuildDirectory 'assets\new.js') ('const api="' + $api + '";const marker="' + $Marker + '";')
    Write-FixtureFile (Join-Path $stage.BuildDirectory 'new-directory\nested\new.txt') ('new-file-' + $Marker)
    Complete-FrontendBuild -Directory $stage.BuildDirectory -ApiBaseUrl $api
    Approve-FrontendBuild -Directory $stage.BuildDirectory
    return $stage
}

$holder = $null
$contender = $null
try {
    foreach ($scenario in @('copy-fixed-asset', 'before-index', 'after-index', 'source-mutates', 'destination-corrupts')) {
        $script:currentFixture = New-RollbackFixture $scenario
        . $currentFixture.Helper
        $script:mode = $scenario
        $script:injected = $false
        $script:indexChanged = $false
        $script:indexRollbackObserved = $false
        $script:servedIndex = Join-Path $currentFixture.Served 'index.html'
        $script:oldIndexSha = (Get-FileHash -LiteralPath $servedIndex -Algorithm SHA256).Hash
        $before = Get-FixtureInventory $currentFixture.Served
        $stage = New-ApprovedRollbackCandidate $scenario
        $script:originalApprovedAssert = ${function:Assert-FrontendApprovedFile}

        function Assert-FrontendApprovedFile {
            param([string]$Path, [string]$Sha256)
            & $script:originalApprovedAssert -Path $Path -Sha256 $Sha256
            if ($script:indexChanged -and $Path -eq $script:servedIndex -and $Sha256 -eq $script:oldIndexSha) {
                Assert-RollbackCase (Test-Path -LiteralPath (Join-Path $script:currentFixture.Served 'assets\new.js')) 'Rollback removed new assets before restoring the old index.'
                $script:indexRollbackObserved = $true
            }
        }

        function Invoke-FrontendAssetCopy {
            param([string]$Source, [string]$Destination)
            [IO.File]::Copy($Source, $Destination, $true)
            if ([IO.Path]::GetFileName($Destination) -eq 'logo.svg') {
                if ($script:mode -eq 'copy-fixed-asset') {
                    $script:injected = $true
                    throw 'FIXTURE_FAILURE_AFTER_FIXED_ASSET_COPY'
                }
                if ($script:mode -eq 'source-mutates') {
                    $script:injected = $true
                    [IO.File]::WriteAllText($Source, 'changed-source-after-approved-copy')
                }
                if ($script:mode -eq 'destination-corrupts') {
                    $script:injected = $true
                    [IO.File]::WriteAllText($Destination, 'corrupted-destination-copy')
                }
            }
        }

        function Invoke-FrontendIndexReplace {
            param([string]$Source, [string]$Destination, [string]$Backup)
            if ($script:mode -eq 'before-index') {
                $script:injected = $true
                throw 'FIXTURE_FAILURE_BEFORE_INDEX_REPLACE'
            }
            [IO.File]::Replace($Source, $Destination, $Backup)
            if ($script:mode -eq 'after-index') {
                $script:indexChanged = $true
                $script:injected = $true
                Assert-RollbackCase ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $script:oldIndexSha) 'Fixture did not replace the index before injecting failure.'
                throw 'FIXTURE_FAILURE_AFTER_INDEX_REPLACE'
            }
        }

        $failure = $null
        try { Publish-FrontendStage -Directory $stage.BuildDirectory -ApiBaseUrl $api | Out-Null }
        catch { $failure = $_ }
        Assert-RollbackCase ($null -ne $failure) ('Promotion unexpectedly passed: ' + $scenario)
        Assert-RollbackCase $script:injected ('Failure injection was not reached: ' + $scenario)
        Assert-RollbackCase ((Get-FixtureInventory $currentFixture.Served) -ceq $before) ('Rollback changed bytes, inventory or file timestamps: ' + $scenario)
        Assert-RollbackCase ((Get-FixtureInventory (Join-Path $stage.Directory 'previous-dist')) -ceq $before) ('Complete backup did not preserve original files: ' + $scenario)
        if ($scenario -eq 'after-index') {
            Assert-RollbackCase $script:indexRollbackObserved 'Old index was not observed restored before new asset cleanup.'
        }
        if ($scenario -in @('source-mutates', 'destination-corrupts')) {
            Assert-RollbackCase ($failure.Exception.Message -match 'SHA-256|SHA') 'Mutation was not refused by approved SHA verification.'
        }
    }

    $collision = New-RollbackFixture 'directory-collision' -LogoDirectory
    . $collision.Helper
    $collisionBefore = Get-FixtureInventory $collision.Served
    $stage = New-ApprovedRollbackCandidate 'collision'
    $failed = $false
    try { Publish-FrontendStage -Directory $stage.BuildDirectory -ApiBaseUrl $api | Out-Null } catch { $failed = $true }
    Assert-RollbackCase $failed 'File/directory collision was promoted.'
    Assert-RollbackCase ((Get-FixtureInventory $collision.Served) -ceq $collisionBefore) 'Collision changed the served directory.'
    Assert-RollbackCase (-not (Test-Path -LiteralPath (Join-Path $stage.Directory 'previous-dist'))) 'Collision was not refused before backup/write.'

    $concurrent = New-RollbackFixture 'concurrent-promotions'
    . $concurrent.Helper
    $first = New-ApprovedRollbackCandidate 'first-promoter'
    $second = New-ApprovedRollbackCandidate 'second-promoter'
    $worker = Join-Path $concurrent.Root 'promotion-worker.ps1'
    $ready = Join-Path $concurrent.Root 'holder-ready.txt'
    $release = Join-Path $concurrent.Root 'release-holder.txt'
    $workerSource = @'
param([string]$Helper,[string]$Directory,[string]$Mode,[string]$Ready,[string]$Release)
$ErrorActionPreference='Stop'
. $Helper
if($Mode -eq 'holder'){
    function Invoke-FrontendIndexReplace {
        param([string]$Source,[string]$Destination,[string]$Backup)
        [IO.File]::WriteAllText($Ready,'mutex-held-inside-promotion')
        $deadline=[DateTime]::UtcNow.AddSeconds(20)
        while(-not(Test-Path -LiteralPath $Release)){
            if([DateTime]::UtcNow -gt $deadline){throw 'FIXTURE_HOLDER_TIMEOUT'}
            Start-Sleep -Milliseconds 25
        }
        [IO.File]::Replace($Source,$Destination,$Backup)
    }
}
try{
    Publish-FrontendStage -Directory $Directory -ApiBaseUrl 'https://api.synthetic.invalid/api/v1' | Out-Null
    if($Mode -eq 'contender'){throw 'CONCURRENT_PROMOTION_WAS_NOT_REFUSED'}
    Write-Output 'HOLDER_PROMOTION_COMPLETED'
    exit 0
}catch{
    if($Mode -eq 'contender' -and $_.Exception.Message -match 'andamento'){
        Write-Output 'CONCURRENT_PROMOTION_REFUSED_WITHOUT_WRITES'
        exit 0
    }
    Write-Error $_
    exit 1
}
'@
    Write-FixtureFile $worker $workerSource
    $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $sharedArguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '" -Helper "' + $concurrent.Helper + '"'
    $holder = Start-Process -FilePath $powershell -ArgumentList ($sharedArguments + ' -Directory "' + $first.BuildDirectory + '" -Mode holder -Ready "' + $ready + '" -Release "' + $release + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $concurrent.Root 'holder.stdout.log') -RedirectStandardError (Join-Path $concurrent.Root 'holder.stderr.log')
    # Windows PowerShell 5.1 must retain the process handle before waiting.
    $holderHandle = $holder.Handle
    Assert-RollbackCase ($holderHandle -ne [IntPtr]::Zero) 'Could not retain the owned holder process handle.'
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while (-not (Test-Path -LiteralPath $ready) -and -not $holder.HasExited -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 25 }
    Assert-RollbackCase (Test-Path -LiteralPath $ready) ('First promoter did not hold the fixture mutex: ' + (Get-FixtureProcessDiagnostic $holder (Join-Path $concurrent.Root 'holder')))
    $whileHeld = Get-FixtureInventory $concurrent.Served
    $contender = Start-Process -FilePath $powershell -ArgumentList ($sharedArguments + ' -Directory "' + $second.BuildDirectory + '" -Mode contender -Ready "' + $ready + '" -Release "' + $release + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $concurrent.Root 'contender.stdout.log') -RedirectStandardError (Join-Path $concurrent.Root 'contender.stderr.log')
    $contenderHandle = $contender.Handle
    Assert-RollbackCase ($contenderHandle -ne [IntPtr]::Zero) 'Could not retain the owned contender process handle.'
    Assert-RollbackCase ($contender.WaitForExit(8000)) 'Concurrent promotion did not fail fast.'
    $contender.WaitForExit()
    $contender.Refresh()
    Assert-RollbackCase ($contender.ExitCode -eq 0) ('Second promoter failed unexpectedly: ' + (Get-FixtureProcessDiagnostic $contender (Join-Path $concurrent.Root 'contender')))
    Assert-RollbackCase ((Get-FixtureInventory $concurrent.Served) -ceq $whileHeld) 'Concurrent promoter changed files while the first held the mutex.'
    Assert-RollbackCase (-not (Test-Path -LiteralPath (Join-Path $second.Directory 'previous-dist'))) 'Concurrent promoter wrote backup before acquiring the mutex.'
    [IO.File]::WriteAllText($release, 'allow-first-promotion-to-complete')
    Assert-RollbackCase ($holder.WaitForExit(8000)) 'First promotion did not finish after release.'
    $holder.WaitForExit()
    $holder.Refresh()
    Assert-RollbackCase ($holder.ExitCode -eq 0) ('First promotion failed unexpectedly: ' + (Get-FixtureProcessDiagnostic $holder (Join-Path $concurrent.Root 'holder')))
    Assert-RollbackCase (([IO.File]::ReadAllText((Join-Path $concurrent.Served 'index.html'))).Contains('first-promoter')) 'Concurrent test did not preserve the first approved index.'
    Publish-FrontendStage -Directory $second.BuildDirectory -ApiBaseUrl $api | Out-Null
    Assert-RollbackCase (([IO.File]::ReadAllText((Join-Path $concurrent.Served 'index.html'))).Contains('second-promoter')) 'Promotion mutex was not released after completion.'
    $global:LASTEXITCODE = 0
    Write-Output ("Frontend promotion rollback: $script:checks checks passed in seven isolated scenarios; no real promotion, production mutex, SQL, network or PM2.")
}
finally {
    foreach ($ownedProcess in @($holder, $contender)) {
        if ($null -ne $ownedProcess) {
            try { if (-not $ownedProcess.HasExited) { $ownedProcess.Kill(); $ownedProcess.WaitForExit() } }
            finally { $ownedProcess.Dispose() }
        }
    }
    foreach ($name in $previousEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
    $resolved = [IO.Path]::GetFullPath($fixtureRoot)
    $temporary = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($temporary, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolved) -notmatch '^adc-frontend-rollback-[0-9a-f]{32}$') { throw 'Fixture cleanup outside TEMP refused.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}

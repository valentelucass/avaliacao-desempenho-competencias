Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('adc-frontend-staging-' + [guid]::NewGuid().ToString('N'))
$fixtureRepository = Join-Path $fixture 'repository with spaces'
$fixtureScripts = Join-Path $fixtureRepository 'scripts'
$cases = 0
$previousFixtureEnvironment = @{}
foreach ($name in @('ADC_FRONTEND_BUILD_DIRECTORY', 'ADC_FRONTEND_API_BASE_URL', 'ADC_BROWSER_ARTIFACT_DIRECTORY', 'ADC_CYCLE_SCREENSHOT_DIRECTORY')) {
    $previousFixtureEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}

function Assert-StagingCase {
    param([bool]$Passed, [string]$Message)
    if (-not $Passed) { throw $Message }
    $script:cases++
}

function Get-ServedManifest {
    return ((@(Get-ChildItem -LiteralPath $script:served -File -Recurse | Sort-Object FullName | ForEach-Object {
        $_.FullName.Substring($script:served.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    })) -join "`n")
}

function New-Candidate {
    param([string]$Api = 'https://api.synthetic.invalid/api/v1', [switch]$Approve)
    $stage = Initialize-FrontendStage
    Start-FrontendBuild -Directory $stage.BuildDirectory -ApiBaseUrl $Api
    New-Item -ItemType Directory -Path (Join-Path $stage.BuildDirectory 'assets') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $stage.BuildDirectory 'index.html'), '<script type="module" src="/assets/new.js"></script>')
    [IO.File]::WriteAllText((Join-Path $stage.BuildDirectory 'assets\new.js'), ('const api=' + '"' + $Api + '";'))
    Complete-FrontendBuild -Directory $stage.BuildDirectory -ApiBaseUrl $Api
    if ($Approve) { Approve-FrontendBuild -Directory $stage.BuildDirectory }
    return $stage
}

function Assert-PromotionRejected {
    param([string]$Directory)
    $before = Get-ServedManifest
    $failed = $false
    try { Publish-FrontendStage -Directory $Directory -ApiBaseUrl 'https://api.synthetic.invalid/api/v1' | Out-Null }
    catch { $failed = $true }
    Assert-StagingCase $failed 'Uma candidata inválida foi promovida.'
    Assert-StagingCase ((Get-ServedManifest) -eq $before) 'A promoção recusada alterou o dist servido.'
}

try {
    New-Item -ItemType Directory -Path $fixtureScripts -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRepository 'backend') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRepository 'frontend\node_modules') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'frontend-staging.ps1') -Destination $fixtureScripts
    $fixtureHelper = Join-Path $fixtureScripts 'frontend-staging.ps1'
    [IO.File]::WriteAllText($fixtureHelper,
        ([IO.File]::ReadAllText($fixtureHelper)).Replace('Global\Rodogarcia-Avaliacao-Frontend-Promotion-v1',
            ('Local\Rodogarcia-Avaliacao-Staging-Fixture-' + [guid]::NewGuid().ToString('N'))), [Text.UTF8Encoding]::new($true))
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'verify.ps1') -Destination $fixtureScripts
    . (Join-Path $fixtureScripts 'frontend-staging.ps1')
    $script:served = Join-Path $fixtureRepository 'frontend\dist'
    New-Item -ItemType Directory -Path (Join-Path $served 'assets') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $served 'index.html'), '<script src="/assets/old.js"></script>')
    [IO.File]::WriteAllText((Join-Path $served 'assets\old.js'), 'approved-production-sentinel')
    [IO.File]::WriteAllText((Join-Path $served 'older.png'), 'existing-asset-sentinel')
    $original = Get-ServedManifest
    foreach ($forbidden in @($served, $fixtureRepository, (Join-Path $fixtureRepository 'backend\target'))) {
        $failed = $false
        try { Initialize-FrontendStage -Directory $forbidden | Out-Null } catch { $failed = $true }
        Assert-StagingCase $failed 'O staging aceitou um destino fora da candidata exclusiva.'
    }
    $stage = New-Candidate
    Assert-StagingCase ($stage.BuildDirectory.StartsWith($fixtureRepository)) 'A fixture não isolou seu staging.'
    Assert-PromotionRejected $stage.BuildDirectory
    Approve-FrontendBuild -Directory $stage.BuildDirectory
    Add-Content -LiteralPath (Join-Path $stage.BuildDirectory 'assets\new.js') -Value 'changed-after-gate'
    Assert-PromotionRejected $stage.BuildDirectory
    $wrongApi = New-Candidate -Api '/api/v1' -Approve
    Add-Content -LiteralPath (Join-Path $wrongApi.BuildDirectory 'assets\new.js') -Value 'const unrelated="https://api.synthetic.invalid/api/v1";'
    Complete-FrontendBuild -Directory $wrongApi.BuildDirectory -ApiBaseUrl '/api/v1'
    Approve-FrontendBuild -Directory $wrongApi.BuildDirectory
    Assert-PromotionRejected $wrongApi.BuildDirectory
    $missing = New-Candidate -Approve
    [IO.File]::WriteAllText((Join-Path $missing.BuildDirectory 'index.html'), '<script src="/assets/missing.js"></script>')
    Complete-FrontendBuild -Directory $missing.BuildDirectory -ApiBaseUrl 'https://api.synthetic.invalid/api/v1'
    Approve-FrontendBuild -Directory $missing.BuildDirectory
    Assert-PromotionRejected $missing.BuildDirectory

    $outside = Join-Path $fixture 'outside-assets'
    New-Item -ItemType Directory -Path $outside -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $outside 'sentinel.txt'), 'do-not-change')
    $preservedAssets = Join-Path $fixture 'preserved-assets'
    foreach ($ownedPath in @($served, $preservedAssets, $outside)) {
        if (-not ([IO.Path]::GetFullPath($ownedPath)).StartsWith($fixture.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar,
                [StringComparison]::OrdinalIgnoreCase)) { throw 'Movimento fora da fixture recusado.' }
    }
    Move-Item -LiteralPath (Join-Path $served 'assets') -Destination $preservedAssets
    $junction = Join-Path $served 'assets'
    New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
    $linked = New-Candidate -Approve
    $failed = $false
    try { Publish-FrontendStage -Directory $linked.BuildDirectory -ApiBaseUrl 'https://api.synthetic.invalid/api/v1' | Out-Null } catch { $failed = $true }
    Assert-StagingCase $failed 'A promoção atravessou uma junction do destino.'
    Assert-StagingCase (-not (Test-Path -LiteralPath (Join-Path $outside 'new.js'))) 'A promoção escreveu fora do dist.'
    Assert-StagingCase (([IO.File]::ReadAllText((Join-Path $outside 'sentinel.txt'))) -eq 'do-not-change') 'A junction alterou o arquivo sentinela.'
    [IO.Directory]::Delete($junction)
    Move-Item -LiteralPath $preservedAssets -Destination $junction

    [IO.File]::WriteAllText((Join-Path $fixtureRepository 'backend\mvnw.cmd'), "@exit /b 0`r`n")
    $global:AdcStagingNpmCalls = @()
    $global:AdcStagingFailBuild = $false
    function npm {
        $global:AdcStagingNpmCalls += [pscustomobject]@{ arguments = @($args); api = $env:VITE_API_BASE_URL }
        $global:LASTEXITCODE = 0
        if ($args[0] -eq 'run' -and $args[1] -eq 'build') {
            $position = [Array]::IndexOf([object[]]$args, '--outDir')
            if ($position -lt 0) { throw 'Build sem --outDir isolado.' }
            $directory = $args[$position + 1]
            New-Item -ItemType Directory -Path (Join-Path $directory 'assets') -Force | Out-Null
            [IO.File]::WriteAllText((Join-Path $directory 'index.html'), '<script src="/assets/build.js"></script>')
            [IO.File]::WriteAllText((Join-Path $directory 'assets\build.js'), ('const api="' + $env:VITE_API_BASE_URL + '";'))
            if ($global:AdcStagingFailBuild) { $global:LASTEXITCODE = 23 }
        }
    }
    $previousApi = $env:VITE_API_BASE_URL
    $env:VITE_API_BASE_URL = 'https://caller.synthetic.invalid/api/v1'
    try {
        $verified = Initialize-FrontendStage
        & (Join-Path $fixtureScripts 'verify.ps1') -FrontendBuildDirectory $verified.BuildDirectory -FrontendApiBaseUrl 'https://api.synthetic.invalid/api/v1'
        Assert-StagingCase ($env:VITE_API_BASE_URL -eq 'https://caller.synthetic.invalid/api/v1') 'verify não restaurou o ambiente do chamador.'
        $buildCalls = @($global:AdcStagingNpmCalls | Where-Object { $_.arguments[0] -eq 'run' -and $_.arguments[1] -eq 'build' })
        $otherCalls = @($global:AdcStagingNpmCalls | Where-Object { -not ($_.arguments[0] -eq 'run' -and $_.arguments[1] -eq 'build') })
        Assert-StagingCase ($buildCalls.Count -eq 1 -and $buildCalls[0].api -eq 'https://api.synthetic.invalid/api/v1') 'A base pública não ficou restrita ao build candidato.'
        Assert-StagingCase (@($otherCalls | Where-Object { $_.api }).Count -eq 0) 'Uma validação recebeu a base pública de Vite.'
        Assert-StagingCase ((Get-ServedManifest) -eq $original) 'verify alterou arquivos servidos.'
        Assert-PromotionRejected $verified.BuildDirectory
        $global:AdcStagingFailBuild = $true
        $failed = $false
        $failedStage = Initialize-FrontendStage
        try { & (Join-Path $fixtureScripts 'verify.ps1') -FrontendBuildDirectory $failedStage.BuildDirectory -FrontendApiBaseUrl 'https://api.synthetic.invalid/api/v1' } catch { $failed = $true }
        Assert-StagingCase $failed 'Uma falha de build foi ignorada.'
        Assert-StagingCase ($env:VITE_API_BASE_URL -eq 'https://caller.synthetic.invalid/api/v1') 'A falha de build não restaurou o ambiente.'
        Assert-PromotionRejected $failedStage.BuildDirectory
    }
    finally { $env:VITE_API_BASE_URL = $previousApi }

    $approved = New-Candidate -Approve
    Publish-FrontendStage -Directory $approved.BuildDirectory -ApiBaseUrl 'https://api.synthetic.invalid/api/v1' | Out-Null
    Assert-StagingCase (([IO.File]::ReadAllText((Join-Path $served 'index.html'))) -eq '<script type="module" src="/assets/new.js"></script>') 'O index aprovado não foi promovido.'
    Assert-StagingCase (Test-Path -LiteralPath (Join-Path $served 'assets\old.js')) 'Um asset anterior foi apagado.'
    Assert-StagingCase (([IO.File]::ReadAllText((Join-Path $approved.Directory 'previous-dist\assets\old.js'))) -eq 'approved-production-sentinel') 'O backup completo não preservou assets antigos.'
    Assert-StagingCase (([IO.File]::ReadAllText((Join-Path $approved.Directory 'previous-dist\index.html'))) -eq '<script src="/assets/old.js"></script>') 'O backup do index não corresponde ao original.'
    Assert-PromotionRejected $approved.BuildDirectory
    $global:LASTEXITCODE = 0
    Write-Output ("Frontend staging: $cases verificações fictícias aprovadas; zero build real, PM2, SQL ou rede.")
}
finally {
    foreach ($name in $previousFixtureEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousFixtureEnvironment[$name], 'Process')
    }
    $resolvedFixture = [IO.Path]::GetFullPath($fixture)
    $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedFixture.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolvedFixture) -notmatch '^adc-frontend-staging-[0-9a-f]{32}$') { throw 'Limpeza fora da fixture recusada.' }
    if (Test-Path -LiteralPath $resolvedFixture) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force }
}

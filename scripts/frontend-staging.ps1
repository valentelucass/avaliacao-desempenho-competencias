[CmdletBinding()]
param(
    [ValidateSet('Prepare', 'Promote')][string]$Action,
    [string]$BuildDirectory,
    [string]$ExpectedApiBaseUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-FrontendPathWithoutLinks {
    param([Parameter(Mandatory)][string]$Path)

    $current = [IO.Path]::GetFullPath($Path)
    while (-not [string]::IsNullOrWhiteSpace($current)) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'O caminho do frontend não pode atravessar links ou junctions.'
            }
        }
        $parent = [IO.Path]::GetDirectoryName($current)
        if ($parent -eq $current) { break }
        $current = $parent
    }
}

function Initialize-FrontendStage {
    param([string]$Directory)

    $repository = Split-Path -Parent $PSScriptRoot
    $stageRoot = [IO.Path]::GetFullPath((Join-Path $repository 'backend\target\frontend-staging'))
    if ([string]::IsNullOrWhiteSpace($Directory)) {
        $Directory = Join-Path $stageRoot (([guid]::NewGuid().ToString('N')) + '\dist')
    }
    $resolved = [IO.Path]::GetFullPath($Directory)
    $prefix = $stageRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'O build de verificação deve ficar no staging privado do frontend.'
    }
    $relative = $resolved.Substring($prefix.Length)
    if ($relative -notmatch '^[0-9a-fA-F]{32}[\\/]dist$') {
        throw 'O diretório do build deve pertencer a uma candidata exclusiva.'
    }
    Assert-FrontendPathWithoutLinks -Path $resolved
    $stage = [IO.Path]::GetDirectoryName($resolved)
    $marker = Join-Path $stage 'stage.json'
    if (Test-Path -LiteralPath $stage) {
        if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
            throw 'Diretório de staging preexistente sem identificação; nenhum arquivo foi alterado.'
        }
        $record = Get-Content -LiteralPath $marker -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($record.buildDirectory -ne $resolved) { throw 'A identificação do staging não corresponde ao build.' }
    }
    else {
        New-Item -ItemType Directory -Path $stage -Force | Out-Null
        [ordered]@{ buildDirectory = $resolved; createdAt = [DateTime]::UtcNow.ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8
    }
    return [pscustomobject]@{
        Directory = $stage
        BuildDirectory = $resolved
        BrowserArtifactsDirectory = Join-Path $stage 'browser-checks'
    }
}

function Invoke-FrontendAssetCopy {
    param([string]$Source, [string]$Destination)
    [IO.File]::Copy($Source, $Destination, $true)
}

function Invoke-FrontendIndexReplace {
    param([string]$Source, [string]$Destination, [string]$Backup)
    if (Test-Path -LiteralPath $Destination) { [IO.File]::Replace($Source, $Destination, $Backup) }
    else { [IO.File]::Move($Source, $Destination) }
}

function Assert-FrontendApprovedFile {
    param([string]$Path, [string]$Sha256)
    Assert-FrontendPathWithoutLinks -Path $Path
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or
        (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Sha256) {
        throw 'Um arquivo da promoção não corresponde ao SHA-256 aprovado pelo gate.'
    }
}

function Assert-FrontendApprovedInventory {
    param([string]$Directory, [hashtable]$Files)
    $currentFiles = @(Get-ChildItem -LiteralPath $Directory -File -Recurse -Force)
    if ($currentFiles.Count -ne $Files.Count) { throw 'O inventário candidato mudou durante a promoção.' }
    foreach ($file in $currentFiles) {
        $relative = $file.FullName.Substring($Directory.Length).TrimStart('\', '/')
        if (-not $Files.ContainsKey($relative)) { throw 'O inventário candidato mudou durante a promoção.' }
        Assert-FrontendApprovedFile -Path $file.FullName -Sha256 $Files[$relative]
    }
}

function Publish-FrontendStage {
    param(
        [Parameter(Mandatory)][string]$Directory,
        [Parameter(Mandatory)][string]$ApiBaseUrl
    )

    $mutex = [Threading.Mutex]::new($false, 'Global\Rodogarcia-Avaliacao-Frontend-Promotion-v1')
    $locked = $false
    try {
        try { $locked = $mutex.WaitOne(0) }
        catch [Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw 'Outra promoção do frontend da Avaliação está em andamento.' }

        $stage = Initialize-FrontendStage -Directory $Directory
        $source = $stage.BuildDirectory
        $receiptPath = Join-Path $stage.Directory 'build.json'
        if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { throw 'O build candidato não possui aprovação do gate.' }
        $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($receipt.status -ne 'QUALITY_PASSED' -or $receipt.apiBaseUrl -ne $ApiBaseUrl) {
            throw 'A candidata não possui gate aprovado para a API pública esperada.'
        }
        $repository = Split-Path -Parent $PSScriptRoot
        $destination = [IO.Path]::GetFullPath((Join-Path $repository 'frontend\dist'))
        Assert-FrontendPathWithoutLinks -Path $destination
        $apiUri = $null
        if (-not [Uri]::TryCreate($ApiBaseUrl, [UriKind]::Absolute, [ref]$apiUri) -or
            $apiUri.Scheme -ne 'https' -or $apiUri.UserInfo -or $apiUri.Query -or $apiUri.Fragment) {
            throw 'A promoção exige a URL HTTPS pública da API, sem credenciais, query ou fragmento.'
        }
        $index = Join-Path $source 'index.html'
        if (-not (Test-Path -LiteralPath $index -PathType Leaf)) { throw 'O build candidato não contém index.html.' }
        $files = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force)
        if ($files.Count -lt 2) { throw 'O build candidato está incompleto.' }
        if ($files.Count -ne @($receipt.files).Count) { throw 'O inventário candidato mudou após a aprovação.' }
        $apiFound = $false
        $approved = @{}
        foreach ($file in $files) {
            Assert-FrontendPathWithoutLinks -Path $file.FullName
            $relative = $file.FullName.Substring($source.Length).TrimStart('\', '/')
            $target = Join-Path $destination $relative
            Assert-FrontendPathWithoutLinks -Path $target
            if ((Test-Path -LiteralPath $target) -and -not (Test-Path -LiteralPath $target -PathType Leaf)) {
                throw 'Um arquivo candidato conflita com um diretório existente no frontend servido.'
            }
            $expected = @($receipt.files | Where-Object { $_.path -eq $relative })
            if ($expected.Count -ne 1 -or $expected[0].sha256 -ne
                (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) {
                throw 'Um arquivo candidato mudou após a aprovação.'
            }
            $approved[$relative] = $expected[0].sha256
            if ($file.Extension -eq '.js' -and
                ([IO.File]::ReadAllText($file.FullName)).Contains($ApiBaseUrl.TrimEnd('/'))) {
                $apiFound = $true
            }
        }
        if (-not $apiFound) { throw 'A URL pública esperada não foi encontrada no JavaScript candidato.' }
        $indexContent = [IO.File]::ReadAllText($index)
        foreach ($match in [regex]::Matches($indexContent, '(?:src|href)=["'']([^"''?#]+)')) {
            $reference = $match.Groups[1].Value
            if ($reference -match '^[A-Za-z][A-Za-z0-9+.-]*:' -or $reference.StartsWith('//')) {
                throw 'O index candidato contém uma referência externa não esperada.'
            }
            $asset = [IO.Path]::GetFullPath((Join-Path $source $reference.TrimStart('/', '\')))
            if (-not $asset.StartsWith($source.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar,
                    [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $asset -PathType Leaf)) {
                throw 'O index candidato referencia um asset ausente ou fora do build.'
            }
        }
        $backup = Join-Path $stage.Directory 'previous-dist'
        if (Test-Path -LiteralPath $backup) { throw 'A candidata já possui backup; uma promoção não pode ser repetida.' }
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        $before = @()
        $originalFiles = @{}
        if (Test-Path -LiteralPath $destination) {
            foreach ($file in Get-ChildItem -LiteralPath $destination -File -Recurse -Force) {
                Assert-FrontendPathWithoutLinks -Path $file.FullName
                $relative = $file.FullName.Substring($destination.Length).TrimStart('\', '/')
                $copy = Join-Path $backup $relative
                New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($copy)) -Force | Out-Null
                [IO.File]::Copy($file.FullName, $copy)
                $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
                if ((Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash -ne $hash) { throw 'O backup do frontend não confere.' }
                $record = [ordered]@{ path = $relative; sha256 = $hash; lastWriteTimeUtc = $file.LastWriteTimeUtc.ToString('o') }
                $before += $record
                $originalFiles[$relative] = $record
            }
        }
        ConvertTo-Json -InputObject @($before) -Depth 3 | Set-Content -LiteralPath (Join-Path $stage.Directory 'previous-dist-manifest.json') -Encoding UTF8
        $touched = [Collections.Generic.List[string]]::new()
        $createdDirectories = [Collections.Generic.List[string]]::new()
        $temporaryIndex = $null
        $ensureDirectory = {
            param([string]$Path)
            Assert-FrontendPathWithoutLinks -Path $Path
            $missing = $Path
            while (-not (Test-Path -LiteralPath $missing)) {
                if (-not $createdDirectories.Contains($missing)) { $createdDirectories.Add($missing) }
                $missing = [IO.Path]::GetDirectoryName($missing)
            }
            New-Item -ItemType Directory -Path $Path -Force | Out-Null
        }
        try {
            & $ensureDirectory $destination
            foreach ($file in $files | Where-Object { $_.FullName -ne $index }) {
                $relative = $file.FullName.Substring($source.Length).TrimStart('\', '/')
                $target = Join-Path $destination $relative
                Assert-FrontendApprovedFile -Path $file.FullName -Sha256 $approved[$relative]
                Assert-FrontendPathWithoutLinks -Path $target
                & $ensureDirectory ([IO.Path]::GetDirectoryName($target))
                $touched.Add($relative)
                Invoke-FrontendAssetCopy -Source $file.FullName -Destination $target
                Assert-FrontendApprovedFile -Path $file.FullName -Sha256 $approved[$relative]
                Assert-FrontendApprovedFile -Path $target -Sha256 $approved[$relative]
            }
            $temporaryIndex = Join-Path $destination ('index.adc-' + [guid]::NewGuid().ToString('N') + '.tmp')
            Assert-FrontendApprovedFile -Path $index -Sha256 $approved['index.html']
            [IO.File]::Copy($index, $temporaryIndex)
            Assert-FrontendApprovedFile -Path $temporaryIndex -Sha256 $approved['index.html']
            Assert-FrontendApprovedInventory -Directory $source -Files $approved
            foreach ($relative in $approved.Keys) {
                if ($relative -ne 'index.html') {
                    Assert-FrontendApprovedFile -Path (Join-Path $destination $relative) -Sha256 $approved[$relative]
                }
            }
            $servedIndex = Join-Path $destination 'index.html'
            Assert-FrontendPathWithoutLinks -Path $servedIndex
            $touched.Add('index.html')
            Invoke-FrontendIndexReplace -Source $temporaryIndex -Destination $servedIndex -Backup (
                Join-Path $stage.Directory ('index-before-replace-' + [guid]::NewGuid().ToString('N') + '.html'))
            Assert-FrontendApprovedInventory -Directory $source -Files $approved
            foreach ($relative in $approved.Keys) {
                Assert-FrontendApprovedFile -Path (Join-Path $destination $relative) -Sha256 $approved[$relative]
            }
        }
        catch {
            $promotionError = $_
            $rollbackErrors = [Collections.Generic.List[Exception]]::new()
            # O index antigo volta antes de qualquer asset novo ser removido.
            foreach ($relative in $touched | Sort-Object { if ($_ -eq 'index.html') { 0 } else { 1 } }) {
                try {
                    $target = Join-Path $destination $relative
                    Assert-FrontendPathWithoutLinks -Path $target
                    if ($originalFiles.ContainsKey($relative)) {
                        $record = $originalFiles[$relative]
                        $saved = Join-Path $backup $relative
                        Assert-FrontendApprovedFile -Path $saved -Sha256 $record.sha256
                        if ($relative -eq 'index.html') {
                            $rollbackIndex = Join-Path $destination ('index.adc-rollback-' + [guid]::NewGuid().ToString('N') + '.tmp')
                            try {
                                [IO.File]::Copy($saved, $rollbackIndex)
                                Assert-FrontendApprovedFile -Path $rollbackIndex -Sha256 $record.sha256
                                if (Test-Path -LiteralPath $target) {
                                    [IO.File]::Replace($rollbackIndex, $target, (Join-Path $stage.Directory (
                                        'index-failed-' + [guid]::NewGuid().ToString('N') + '.html')))
                                }
                                else { [IO.File]::Move($rollbackIndex, $target) }
                            }
                            finally {
                                if (Test-Path -LiteralPath $rollbackIndex) { [IO.File]::Delete($rollbackIndex) }
                            }
                        }
                        else { [IO.File]::Copy($saved, $target, $true) }
                        [IO.File]::SetLastWriteTimeUtc($target, [DateTime]::Parse($record.lastWriteTimeUtc).ToUniversalTime())
                        Assert-FrontendApprovedFile -Path $target -Sha256 $record.sha256
                    }
                    elseif (Test-Path -LiteralPath $target) { [IO.File]::Delete($target) }
                }
                catch {
                    $rollbackErrors.Add($_.Exception)
                    if ($relative -eq 'index.html') { break }
                }
            }
            if ($temporaryIndex -and (Test-Path -LiteralPath $temporaryIndex)) {
                try { [IO.File]::Delete($temporaryIndex) } catch { $rollbackErrors.Add($_.Exception) }
            }
            foreach ($createdDirectory in $createdDirectories | Sort-Object Length -Descending) {
                try {
                    Assert-FrontendPathWithoutLinks -Path $createdDirectory
                    if ((Test-Path -LiteralPath $createdDirectory) -and
                        @(Get-ChildItem -LiteralPath $createdDirectory -Force).Count -eq 0) {
                        [IO.Directory]::Delete($createdDirectory)
                    }
                }
                catch { $rollbackErrors.Add($_.Exception) }
            }
            if ($rollbackErrors.Count -gt 0) {
                $rollbackErrors.Insert(0, $promotionError.Exception)
                throw [AggregateException]::new('A promoção falhou e a recuperação automática encontrou erros; backup preservado.', $rollbackErrors)
            }
            throw $promotionError
        }
        Write-Output 'Frontend aprovado promovido: hashes aprovados conferidos e index substituído por último; backup completo preservado.'
    }
    finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

function Start-FrontendBuild {
    param([Parameter(Mandatory)][string]$Directory, [Parameter(Mandatory)][string]$ApiBaseUrl)
    $stage = Initialize-FrontendStage -Directory $Directory
    [ordered]@{ status = 'BUILDING'; apiBaseUrl = $ApiBaseUrl; files = @() } | ConvertTo-Json -Depth 3 |
        Set-Content -LiteralPath (Join-Path $stage.Directory 'build.json') -Encoding UTF8
}

function Complete-FrontendBuild {
    param([Parameter(Mandatory)][string]$Directory, [Parameter(Mandatory)][string]$ApiBaseUrl)
    $stage = Initialize-FrontendStage -Directory $Directory
    $manifest = @(foreach ($file in Get-ChildItem -LiteralPath $stage.BuildDirectory -File -Recurse -Force) {
        Assert-FrontendPathWithoutLinks -Path $file.FullName
        [ordered]@{
            path = $file.FullName.Substring($stage.BuildDirectory.Length).TrimStart('\', '/')
            sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        }
    })
    [ordered]@{ status = 'BUILD_COMPLETE'; apiBaseUrl = $ApiBaseUrl; files = $manifest } | ConvertTo-Json -Depth 4 |
        Set-Content -LiteralPath (Join-Path $stage.Directory 'build.json') -Encoding UTF8
}

function Approve-FrontendBuild {
    param([Parameter(Mandatory)][string]$Directory)
    $stage = Initialize-FrontendStage -Directory $Directory
    $receiptPath = Join-Path $stage.Directory 'build.json'
    $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($receipt.status -ne 'BUILD_COMPLETE') { throw 'O frontend não possui build concluído para aprovação.' }
    $receipt.status = 'QUALITY_PASSED'
    $receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
}

if ($MyInvocation.InvocationName -ne '.') {
    if ($Action -eq 'Prepare') { Initialize-FrontendStage -Directory $BuildDirectory | ConvertTo-Json }
    elseif ($Action -eq 'Promote') { Publish-FrontendStage -Directory $BuildDirectory -ApiBaseUrl $ExpectedApiBaseUrl }
    else { throw 'Informe Prepare ou Promote.' }
}

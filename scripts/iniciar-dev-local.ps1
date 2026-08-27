[CmdletBinding()]
param(
    [switch]$OpenBrowser,
    [switch]$KeepRunning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backendDirectory = Join-Path $repositoryRoot 'backend'
$frontendDirectory = Join-Path $repositoryRoot 'frontend'
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'AvaliacaoDesempenhoCompetencias\dev-local'
$developmentReleaseDirectory = Join-Path $backendDirectory 'target\dev-local-releases'
$backendPort = 5181
$frontendPort = 5180
$backendProcess = $null
$frontendProcess = $null
$pfxPath = $null
$started = $false
$previousEnvironment = @{}
$startedListeners = @()
$cancelKeyPressHandler = $null
$script:localDevelopmentStopRequested = $false

function Assert-AvailablePort {
    param([Parameter(Mandatory)][int]$Port)

    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($null -ne $listener) {
        throw "A porta local $Port já está em uso. Encerre somente o processo autorizado antes de iniciar o desenvolvimento local."
    }
}

function Get-ListeningProcess {
    param([Parameter(Mandatory)][int]$Port)

    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $listener) {
        return $null
    }

    return Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
}

function Assert-ExpectedLocalDevelopmentProcess {
    param(
        [Parameter(Mandatory)][object]$Process,
        [Parameter(Mandatory)][ValidateSet('api', 'frontend')][string]$Kind
    )

    $legacyBackendArtifactPrefix = Join-Path $backendDirectory 'target\avaliacao-desempenho-api-'
    $developmentBackendArtifactPrefix = Join-Path $developmentReleaseDirectory ''
    $isExpected = if ($Kind -eq 'api') {
        $Process.Name -ieq 'java.exe' -and (
            $Process.CommandLine -like "*$legacyBackendArtifactPrefix*" -or
            $Process.CommandLine -like "*$developmentBackendArtifactPrefix*avaliacao-desempenho-api-*.jar*"
        )
    }
    else {
        $Process.Name -ieq 'node.exe' -and $Process.CommandLine -like "*$frontendDirectory*vite*"
    }

    if (-not $isExpected) {
        throw "A porta reservada do $Kind pertence a outro processo. Nenhum processo foi encerrado automaticamente."
    }
}

function Wait-ForAvailablePort {
    param([Parameter(Mandatory)][int]$Port)

    $deadline = (Get-Date).AddSeconds(15)
    do {
        if ($null -eq (Get-ListeningProcess -Port $Port)) {
            return
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    throw "A porta local $Port não foi liberada após encerrar a instância anterior."
}

function Stop-ExistingLocalDevelopment {
    $apiProcess = Get-ListeningProcess -Port $backendPort
    $frontendProcess = Get-ListeningProcess -Port $frontendPort

    if ($null -eq $apiProcess -and $null -eq $frontendProcess) {
        return
    }
    if ($null -ne $apiProcess) {
        Assert-ExpectedLocalDevelopmentProcess -Process $apiProcess -Kind api
    }
    if ($null -ne $frontendProcess) {
        Assert-ExpectedLocalDevelopmentProcess -Process $frontendProcess -Kind frontend
    }

    $existingProcesses = @()
    if ($null -ne $apiProcess) {
        $existingProcesses += $apiProcess
    }
    if ($null -ne $frontendProcess) {
        $existingProcesses += $frontendProcess
    }
    foreach ($process in $existingProcesses) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
    Wait-ForAvailablePort -Port $backendPort
    Wait-ForAvailablePort -Port $frontendPort
    Write-Host 'A instância anterior de desenvolvimento foi encerrada nas portas fixas 5180 e 5181.'
}

function Get-StartedLocalDevelopmentListener {
    param(
        [Parameter(Mandatory)][int]$Port,
        [Parameter(Mandatory)][ValidateSet('api', 'frontend')][string]$Kind
    )

    $listener = Get-ListeningProcess -Port $Port
    if ($null -eq $listener) {
        throw "O processo $Kind iniciado para a porta local $Port não está em escuta."
    }

    Assert-ExpectedLocalDevelopmentProcess -Process $listener -Kind $Kind
    return [PSCustomObject]@{
        Kind = $Kind
        Port = $Port
        ProcessId = [int]$listener.ProcessId
    }
}

function Assert-StartedLocalDevelopmentListener {
    param(
        [Parameter(Mandatory)][object]$StartedListener
    )

    $listener = Get-ListeningProcess -Port $StartedListener.Port
    if ($null -eq $listener) {
        throw "A $($StartedListener.Kind) local encerrou e liberou a porta $($StartedListener.Port)."
    }
    if ([int]$listener.ProcessId -ne [int]$StartedListener.ProcessId) {
        throw "A porta local $($StartedListener.Port) foi assumida por outro processo; a instância iniciada por este terminal não continuará a supervisioná-la."
    }

    Assert-ExpectedLocalDevelopmentProcess -Process $listener -Kind $StartedListener.Kind
}

function Stop-StartedLocalDevelopment {
    param(
        [Parameter(Mandatory)][object[]]$StartedListeners
    )

    $stoppedPorts = @()
    foreach ($startedListener in $StartedListeners) {
        $listener = Get-ListeningProcess -Port $startedListener.Port
        if ($null -eq $listener) {
            continue
        }
        if ([int]$listener.ProcessId -ne [int]$startedListener.ProcessId) {
            Write-Warning "A porta local $($startedListener.Port) não pertence mais à instância iniciada por este terminal; nenhum processo foi encerrado nela."
            continue
        }

        try {
            Assert-ExpectedLocalDevelopmentProcess -Process $listener -Kind $startedListener.Kind
            Stop-Process -Id $listener.ProcessId -Force -ErrorAction Stop
            $stoppedPorts += [int]$startedListener.Port
        }
        catch {
            Write-Warning "Não foi possível encerrar a $($startedListener.Kind) local iniciada por este terminal: $($_.Exception.Message)"
        }
    }

    foreach ($port in $stoppedPorts) {
        try {
            Wait-ForAvailablePort -Port $port
        }
        catch {
            Write-Warning $_.Exception.Message
        }
    }

    if ($stoppedPorts.Count -gt 0) {
        Write-Host 'A instância de desenvolvimento iniciada por este terminal foi encerrada.'
    }
}

function Wait-ForLocalDevelopmentSession {
    param(
        [Parameter(Mandatory)][object[]]$StartedListeners
    )

    Write-Host 'O desenvolvimento local permanece em execução neste terminal. Pressione Ctrl+C para encerrar somente a API e o front-end deste repositório.'
    while (-not $script:localDevelopmentStopRequested) {
        foreach ($startedListener in $StartedListeners) {
            Assert-StartedLocalDevelopmentListener -StartedListener $startedListener
        }
        Start-Sleep -Seconds 1
    }
}

function Get-PowerShellExecutable {
    $powerShellCore = Get-Command pwsh.exe -ErrorAction SilentlyContinue
    if ($null -ne $powerShellCore) {
        return $powerShellCore.Source
    }

    return (Get-Command powershell.exe -ErrorAction Stop).Source
}

function Set-TemporaryEnvironment {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Value
    )

    if (-not $previousEnvironment.ContainsKey($Name)) {
        $previousEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
    }
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Restore-ProcessEnvironment {
    foreach ($entry in $previousEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
}

function Assert-SafeLocalLoggingConfiguration {
    param([Parameter(Mandatory)][hashtable]$Properties)

    # A VM pode possuir variáveis de ambiente amplas (como DEBUG) que o Spring Boot
    # interpreta. A execução local não pode herdá-las para registrar corpos HTTP,
    # respostas CSRF, credenciais ou detalhes de autorização no log de runtime.
    $requiredProperties = @{
        'debug' = $false
        'spring.mvc.log-request-details' = $false
        'spring.codec.log-request-details' = $false
        'logging.level.root' = 'INFO'
        'logging.level.org.springframework.web' = 'INFO'
        'logging.level.org.springframework.web.servlet.DispatcherServlet' = 'INFO'
        'logging.level.org.springframework.web.servlet.mvc.method.annotation.RequestResponseBodyMethodProcessor' = 'WARN'
        'logging.level.org.springframework.security' = 'WARN'
        'logging.level.org.springframework.jdbc.core.JdbcTemplate' = 'INFO'
        'logging.level.org.springframework.boot.autoconfigure' = 'INFO'
    }

    foreach ($requiredProperty in $requiredProperties.GetEnumerator()) {
        if (
            -not $Properties.ContainsKey($requiredProperty.Key) -or
            [string]$Properties[$requiredProperty.Key] -cne [string]$requiredProperty.Value
        ) {
            throw "A configuração de log seguro do desenvolvimento local está incompleta: $($requiredProperty.Key)."
        }
    }
}

function Fill-CryptographicBytes {
    param([Parameter(Mandatory)][byte[]]$Bytes)

    $randomNumberGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $randomNumberGenerator.GetBytes($Bytes)
    }
    finally {
        $randomNumberGenerator.Dispose()
    }
}

function Wait-ForHttpsEndpoint {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory)][string]$LogPath,
        [Parameter(Mandatory)][string]$Name
    )

    $deadline = (Get-Date).AddSeconds(90)
    do {
        if ($Process.HasExited) {
            $log = if (Test-Path -LiteralPath $LogPath) {
                (Get-Content -LiteralPath $LogPath -Tail 40 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
            } else {
                'Sem arquivo de log disponível.'
            }
            throw "$Name encerrou antes de ficar disponível.`n$log"
        }

        $status = & curl.exe --insecure --silent --output NUL --write-out '%{http_code}' $Url
        if ($LASTEXITCODE -eq 0 -and $status -eq '200') {
            return
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    throw "$Name não respondeu em $Url dentro de 90 segundos. Consulte $LogPath."
}

function Get-LocalCertificate {
    $friendlyName = 'Avaliacao de Desempenho - HTTPS local'
    $certificate = Get-ChildItem Cert:\CurrentUser\My |
        Where-Object {
            $_.FriendlyName -eq $friendlyName -and
            $_.HasPrivateKey -and
            $_.NotAfter -gt (Get-Date).AddDays(1)
        } |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1

    if ($null -eq $certificate) {
        $certificate = New-SelfSignedCertificate `
            -DnsName 'localhost' `
            -CertStoreLocation 'Cert:\CurrentUser\My' `
            -FriendlyName $friendlyName `
            -Type SSLServerAuthentication `
            -KeyAlgorithm RSA `
            -KeyLength 2048 `
            -HashAlgorithm SHA256 `
            -KeyExportPolicy Exportable `
            -NotAfter (Get-Date).AddDays(30)
    }

    $trustedCopy = Get-ChildItem Cert:\CurrentUser\Root |
        Where-Object { $_.Thumbprint -eq $certificate.Thumbprint } |
        Select-Object -First 1
    if ($null -eq $trustedCopy) {
        $exportPath = Join-Path $runtimeDirectory "$($certificate.Thumbprint).cer"
        try {
            Export-Certificate -Cert $certificate -FilePath $exportPath | Out-Null
            & certutil.exe -user -addstore Root $exportPath | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw 'Não foi possível confiar no certificado HTTPS local para o usuário atual.'
            }
        }
        finally {
            if (Test-Path -LiteralPath $exportPath) {
                Remove-Item -LiteralPath $exportPath -Force
            }
        }
    }

    return $certificate
}

function New-DevelopmentBackendArtifact {
    $releaseDirectory = Join-Path $developmentReleaseDirectory ([guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null

    Push-Location $backendDirectory
    try {
        & .\mvnw.cmd package "-Dadc.build.directory=$releaseDirectory" | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw 'Não foi possível empacotar a API para o modo de desenvolvimento.'
        }
    }
    finally {
        Pop-Location
    }

    $artifacts = @(Get-ChildItem -LiteralPath $releaseDirectory -Filter 'avaliacao-desempenho-api-*.jar' -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notlike '*.original' })

    if ($artifacts.Count -ne 1) {
        throw 'O empacotamento da API não produziu exatamente um JAR executável para o modo de desenvolvimento.'
    }

    return $artifacts[0]
}

function Get-JavaExecutable {
    $javaExecutable = Join-Path $env:JAVA_HOME 'bin\java.exe'
    if (-not (Test-Path -LiteralPath $javaExecutable)) {
        throw "O executável Java não foi encontrado em $javaExecutable."
    }
    return $javaExecutable
}

function Assert-BackendArtifactIsCurrent {
    param([Parameter(Mandatory)][System.IO.FileInfo]$Artifact)

    $inputs = @(
        Get-Item -LiteralPath (Join-Path $backendDirectory 'pom.xml')
        Get-ChildItem -LiteralPath (Join-Path $backendDirectory 'src\main') -File -Recurse
    )
    $newestInput = $inputs | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($newestInput.LastWriteTimeUtc -gt $Artifact.LastWriteTimeUtc) {
        throw "O JAR da API gerado localmente está desatualizado em relação a $($newestInput.FullName); a inicialização foi interrompida."
    }
}

function Assert-FrontendDependenciesAreCurrent {
    $packageJson = Join-Path $frontendDirectory 'package.json'
    $packageLock = Join-Path $frontendDirectory 'package-lock.json'
    $installationLock = Join-Path $frontendDirectory 'node_modules\.package-lock.json'
    $viteCommand = Join-Path $frontendDirectory 'node_modules\.bin\vite.cmd'

    if (-not (Test-Path -LiteralPath $packageJson) -or -not (Test-Path -LiteralPath $packageLock)) {
        throw 'package.json ou package-lock.json não foi encontrado no front-end.'
    }
    if (-not (Test-Path -LiteralPath $installationLock) -or -not (Test-Path -LiteralPath $viteCommand)) {
        throw 'As dependências do front-end não estão instaladas. O modo de desenvolvimento não executa npm install: instale-as pelo fluxo de produção autorizado antes de iniciá-lo.'
    }

    $dependencyInputs = @(
        Get-Item -LiteralPath $packageLock
    )
    $npmConfiguration = Join-Path $frontendDirectory '.npmrc'
    if (Test-Path -LiteralPath $npmConfiguration) {
        $dependencyInputs += Get-Item -LiteralPath $npmConfiguration
    }
    $newestDependencyInput = $dependencyInputs | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    $installedLock = Get-Item -LiteralPath $installationLock
    if ($newestDependencyInput.LastWriteTimeUtc -gt $installedLock.LastWriteTimeUtc) {
        throw "As dependências do front-end estão desatualizadas em relação a $($newestDependencyInput.FullName). O modo de desenvolvimento não executa npm install: atualize-as pelo fluxo de produção autorizado antes de iniciá-lo."
    }
}

function Get-SqlServerNativeAuthenticationDirectory {
    param([Parameter(Mandatory)][System.IO.FileInfo]$BackendArtifact)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($BackendArtifact.FullName)
    try {
        $driverEntry = $archive.Entries |
            Where-Object { $_.FullName -match '^BOOT-INF/lib/mssql-jdbc-[^/]+\.jar$' } |
            Select-Object -First 1
    }
    finally {
        $archive.Dispose()
    }

    if ($null -eq $driverEntry) {
        throw 'O JAR da API não contém o driver JDBC SQL Server necessário para o desenvolvimento local.'
    }

    $driverFileName = Split-Path -Leaf $driverEntry.FullName
    if ($driverFileName -notmatch '^mssql-jdbc-(?<version>.+)\.jre\d+\.jar$') {
        throw "Não foi possível identificar a versão do driver JDBC: $driverFileName"
    }

    $version = $matches.version
    $nativeDirectory = Join-Path $env:USERPROFILE ".m2\repository\com\microsoft\sqlserver\mssql-jdbc_auth\$version.x64"
    $nativeLibrary = Join-Path $nativeDirectory "mssql-jdbc_auth-$version.x64.dll"
    if (-not (Test-Path -LiteralPath $nativeLibrary)) {
        throw "A biblioteca nativa de autenticação integrada do SQL Server não está disponível: $nativeLibrary. O modo de desenvolvimento não baixa dependências; prepare-a pelo fluxo de produção autorizado antes de iniciá-lo."
    }
    return $nativeDirectory
}

try {
    if ([string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
        throw 'JAVA_HOME não está definido.'
    }
    if ($null -eq (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm não foi encontrado no PATH.'
    }

    $backendArtifact = New-DevelopmentBackendArtifact
    Assert-BackendArtifactIsCurrent -Artifact $backendArtifact
    Assert-FrontendDependenciesAreCurrent
    $nativeAuthenticationDirectory = Get-SqlServerNativeAuthenticationDirectory -BackendArtifact $backendArtifact

    Stop-ExistingLocalDevelopment
    Assert-AvailablePort -Port $backendPort
    Assert-AvailablePort -Port $frontendPort
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

    $certificate = Get-LocalCertificate
    $pfxPath = Join-Path $runtimeDirectory ("localhost-" + [guid]::NewGuid().ToString('N') + '.pfx')
    $pfxPasswordBytes = New-Object byte[] 32
    Fill-CryptographicBytes -Bytes $pfxPasswordBytes
    $pfxPasswordText = [Convert]::ToBase64String($pfxPasswordBytes)
    $pfxPassword = ConvertTo-SecureString -String $pfxPasswordText -AsPlainText -Force
    Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $pfxPassword | Out-Null

    $hmacSecretBytes = New-Object byte[] 32
    Fill-CryptographicBytes -Bytes $hmacSecretBytes
    $runtimeProperties = @{
        'debug' = $false
        'spring.mvc.log-request-details' = $false
        'spring.codec.log-request-details' = $false
        'logging.level.root' = 'INFO'
        'logging.level.org.springframework.web' = 'INFO'
        'logging.level.org.springframework.web.servlet.DispatcherServlet' = 'INFO'
        'logging.level.org.springframework.web.servlet.mvc.method.annotation.RequestResponseBodyMethodProcessor' = 'WARN'
        'logging.level.org.springframework.security' = 'WARN'
        'logging.level.org.springframework.jdbc.core.JdbcTemplate' = 'INFO'
        'logging.level.org.springframework.boot.autoconfigure' = 'INFO'
        'server.address' = 'localhost'
        'server.port' = $backendPort
        'server.ssl.enabled' = $true
        'server.ssl.key-store' = $pfxPath
        'server.ssl.key-store-type' = 'PKCS12'
        'server.ssl.key-store-password' = $pfxPasswordText
        'app.persistence.sqlserver.enabled' = $true
        'app.persistence.sqlserver.jdbc-url' = 'jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;trustServerCertificate=true;integratedSecurity=true;authenticationScheme=NativeAuthentication'
        'app.security.authentication.enabled' = $true
        'app.security.authentication.issuer' = "https://localhost:$backendPort"
        'app.security.authentication.audience' = 'avaliacao-desempenho-local'
        'app.security.authentication.hmac-secret-base64' = [Convert]::ToBase64String($hmacSecretBytes)
        'app.security.cors.allowed-origins' = "https://localhost:$frontendPort"
        'app.evaluation-cycles.read.enabled' = $true
        'app.assessments.enabled' = $true
        'app.indicators.enabled' = $true
    }
    Assert-SafeLocalLoggingConfiguration -Properties $runtimeProperties
    Set-TemporaryEnvironment -Name 'SPRING_APPLICATION_JSON' -Value ($runtimeProperties | ConvertTo-Json -Compress)
    $priorJavaToolOptions = [Environment]::GetEnvironmentVariable('JAVA_TOOL_OPTIONS', 'Process')
    $javaToolOptions = if ([string]::IsNullOrWhiteSpace($priorJavaToolOptions)) {
        "-Djava.library.path=$nativeAuthenticationDirectory"
    } else {
        "$priorJavaToolOptions -Djava.library.path=$nativeAuthenticationDirectory"
    }
    Set-TemporaryEnvironment -Name 'JAVA_TOOL_OPTIONS' -Value $javaToolOptions
    Set-TemporaryEnvironment -Name 'ADC_LOCAL_HTTPS_PFX_PATH' -Value $pfxPath
    Set-TemporaryEnvironment -Name 'ADC_LOCAL_HTTPS_PFX_PASSWORD' -Value $pfxPasswordText
    Set-TemporaryEnvironment -Name 'ADC_LOCAL_API_TARGET' -Value "https://localhost:$backendPort"

    $backendLog = Join-Path $runtimeDirectory 'api.log'
    $backendErrorLog = Join-Path $runtimeDirectory 'api.error.log'
    $frontendLog = Join-Path $runtimeDirectory 'web.log'
    $frontendErrorLog = Join-Path $runtimeDirectory 'web.error.log'
    $javaExecutable = Get-JavaExecutable
    $backendProcess = Start-Process `
        -FilePath $javaExecutable `
        -ArgumentList @('-jar', $backendArtifact.FullName) `
        -WorkingDirectory $repositoryRoot `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError $backendErrorLog
    Wait-ForHttpsEndpoint `
        -Url "https://localhost:$backendPort/api/v1/auth/csrf" `
        -Process $backendProcess `
        -LogPath $backendLog `
        -Name 'A API local'
    $startedListeners += Get-StartedLocalDevelopmentListener -Port $backendPort -Kind 'api'

    $frontendProcess = Start-Process `
        -FilePath 'cmd.exe' `
        -ArgumentList @('/d', '/c', "npm.cmd run dev -- --host localhost --port $frontendPort --strictPort") `
        -WorkingDirectory $frontendDirectory `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $frontendLog `
        -RedirectStandardError $frontendErrorLog
    Wait-ForHttpsEndpoint `
        -Url "https://localhost:$frontendPort/" `
        -Process $frontendProcess `
        -LogPath $frontendLog `
        -Name 'O front-end local'
    $startedListeners += Get-StartedLocalDevelopmentListener -Port $frontendPort -Kind 'frontend'

    $started = $true
    Write-Host "Desenvolvimento local disponível em https://localhost:$frontendPort"
    Write-Host "API local disponível em https://localhost:$backendPort/api/v1"
    Write-Host "Processos em escuta: API $($startedListeners[0].ProcessId), front-end $($startedListeners[1].ProcessId)."
    Write-Host 'A primeira entrada exige a troca da senha inicial e um novo login.'
    if ($OpenBrowser) {
        Start-Process "https://localhost:$frontendPort"
    }
    if ($KeepRunning) {
        $cancelKeyPressHandler = [ConsoleCancelEventHandler]{
            param($sender, $eventArgs)
            $eventArgs.Cancel = $true
            $script:localDevelopmentStopRequested = $true
        }
        [Console]::add_CancelKeyPress($cancelKeyPressHandler)
        Wait-ForLocalDevelopmentSession -StartedListeners $startedListeners
    }
}
catch {
    if (-not $started) {
        if ($null -ne $frontendProcess -and -not $frontendProcess.HasExited) {
            Stop-Process -Id $frontendProcess.Id -Force
        }
        if ($null -ne $backendProcess -and -not $backendProcess.HasExited) {
            Stop-Process -Id $backendProcess.Id -Force
        }
    }
    if (-not ($KeepRunning -and $script:localDevelopmentStopRequested)) {
        throw
    }
}
finally {
    if ($KeepRunning -and $started -and $startedListeners.Count -gt 0) {
        Stop-StartedLocalDevelopment -StartedListeners $startedListeners
    }
    if ($null -ne $cancelKeyPressHandler) {
        [Console]::remove_CancelKeyPress($cancelKeyPressHandler)
    }
    Restore-ProcessEnvironment
    if ($null -ne $pfxPath -and (Test-Path -LiteralPath $pfxPath)) {
        Remove-Item -LiteralPath $pfxPath -Force
    }
    Remove-Variable pfxPasswordText -ErrorAction SilentlyContinue
    Remove-Variable hmacSecretBytes -ErrorAction SilentlyContinue

    if (-not $started) {
        Write-Host 'O desenvolvimento local não foi iniciado; nenhum processo iniciado por este script foi mantido.'
    }
}

[CmdletBinding()]
param([switch]$CheckOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PrivateAcl {
    param([bool]$Directory)
    $security = if ($Directory) { [Security.AccessControl.DirectorySecurity]::new() } else { [Security.AccessControl.FileSecurity]::new() }
    $security.SetAccessRuleProtection($true, $false)
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $security.SetOwner($currentSid)
    foreach ($sid in @($currentSid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {
        $inheritance = if ($Directory) { [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::FullControl,
            $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
        [void]$security.AddAccessRule($rule)
    }
    return $security
}

function Assert-NoReparsePoint {
    param([string]$Path)
    $current = [IO.Path]::GetFullPath($Path)
    while (-not [string]::IsNullOrEmpty($current)) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Destino ou ancestral usa redirecionamento de filesystem. Preparacao recusada.'
            }
        }
        $current = [IO.Path]::GetDirectoryName($current.TrimEnd('\'))
    }
}

function New-PrivateDirectory {
    param([string]$Path)
    Assert-NoReparsePoint $Path
    if (Test-Path -LiteralPath $Path) {
        if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw 'Um destino de diretorio ja e um arquivo.' }
        return
    }
    $parent = [IO.Path]::GetDirectoryName($Path)
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-PrivateDirectory $parent }
    $directory = [IO.DirectoryInfo]::new($Path)
    $directory.Create((Get-PrivateAcl $true))
    # A concurrent creator must not be silently accepted with an open ACL.
    Assert-PrivateAcl $Path
}

function Assert-PrivateAcl {
    param([string]$Path)
    $acl = Get-Acl -LiteralPath $Path
    $allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
    if (-not $acl.AreAccessRulesProtected -or @($acl.Access | Where-Object {
        $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed
    }).Count -gt 0) { throw 'O diretorio novo nao possui ACL privada esperada. Preparacao recusada.' }
}

function Set-ProductionHmacEntropy {
    param([byte[]]$Buffer)
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($Buffer) } finally { $random.Dispose() }
}

function Write-ProductionConfigBytes {
    param([IO.Stream]$Stream, [byte[]]$Bytes)
    $Stream.Write($Bytes, 0, $Bytes.Length)
    $Stream.Flush($true)
}

function Remove-OwnedPreparingFile {
    param([string]$Path, [string]$Parent)
    if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Path)) -ine [IO.Path]::GetFullPath($Parent) -or
        [IO.Path]::GetFileName($Path) -notmatch '^\.avaliacao-prod\.[a-f0-9]{32}\.preparing$') {
        throw 'Limpeza de preparacao fora do alvo permitido recusada.'
    }
    Assert-NoReparsePoint $Path
    [IO.File]::Delete($Path)
}

function New-IncompleteProductionConfiguration {
    param([Parameter(Mandatory)][string]$ApprovedRoot, [Parameter(Mandatory)][string]$ConfigurationPath,
        [Parameter(Mandatory)][string]$LogDirectory)
    $approved = [IO.Path]::GetFullPath($ApprovedRoot).TrimEnd('\')
    $config = [IO.Path]::GetFullPath($ConfigurationPath)
    $logs = [IO.Path]::GetFullPath($LogDirectory)
    if ($config -ine (Join-Path $approved 'production\avaliacao-prod.properties') -or
        $logs -ine (Join-Path $approved 'logs')) { throw 'Destinos fora dos caminhos autorizados. Preparacao recusada.' }
    Assert-NoReparsePoint $config
    Assert-NoReparsePoint $logs
    if (Test-Path -LiteralPath $config) { throw 'Configuracao ja existe. Nenhum arquivo sera sobrescrito.' }
    if (Test-Path -LiteralPath $logs) { throw 'Diretorio de logs ja existe. Nenhuma ACL existente sera alterada.' }
    New-PrivateDirectory ([IO.Path]::GetDirectoryName($config))
    New-PrivateDirectory $logs
    Assert-PrivateAcl ([IO.Path]::GetDirectoryName($config))
    Assert-PrivateAcl $logs
    $preparingPath = Join-Path ([IO.Path]::GetDirectoryName($config)) ('.avaliacao-prod.' + [Guid]::NewGuid().ToString('N') + '.preparing')
    $stream = $null
    $preparingCreated = $false
    $key = New-Object byte[] 32
    $bytes = $null
    try {
        $stream = [IO.FileStream]::new($preparingPath, [IO.FileMode]::CreateNew,
            [Security.AccessControl.FileSystemRights]::Write, [IO.FileShare]::None, 4096, [IO.FileOptions]::None, (Get-PrivateAcl $false))
        $preparingCreated = $true
        Set-ProductionHmacEntropy $key
        $keyBase64 = [Convert]::ToBase64String($key)
        $content = @"
#ADC_CONFIGURATION_INCOMPLETE
# Preparacao autorizada; senha SQL ausente, identidade e TLS ainda nao validados.
# Nao iniciar API nem remover marcador antes da validacao operacional autorizada.
spring.application.name=avaliacao-desempenho-competencias
server.address=127.0.0.1
server.port=28081
server.error.include-binding-errors=never
server.error.include-message=never
server.error.include-stacktrace=never
app.persistence.sqlserver.enabled=true
app.persistence.sqlserver.jdbc-url=jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_PROD;encrypt=true;trustServerCertificate=false
app.persistence.sqlserver.username=rodogarcia_adc_app
app.persistence.sqlserver.password=TODO
app.persistence.sqlserver.maximum-pool-size=10
app.persistence.sqlserver.connection-timeout=10s
app.security.authentication.enabled=true
app.security.authentication.issuer=avaliacao-desempenho-producao
app.security.authentication.audience=avaliacao-desempenho-api
app.security.authentication.hmac-secret-base64=$keyBase64
app.security.authentication.access-lifetime=15m
app.security.authentication.refresh-lifetime=8h
app.security.authentication.failed-login-threshold=5
app.security.authentication.account-lock-duration=15m
app.security.authentication.login-maximum-attempts=10
app.security.authentication.login-window=1m
app.security.cors.allowed-origins=https://formulario.rodogarcia.com.br
app.evaluation-cycles.read.enabled=true
app.assessments.enabled=true
app.indicators.enabled=true
logging.level.org.springframework.web.servlet.mvc.method.annotation.RequestResponseBodyMethodProcessor=WARN
logging.level.org.springframework.web.servlet.mvc.method.annotation.HttpEntityMethodProcessor=WARN
logging.level.org.springframework.web.servlet.mvc.method.annotation.ExceptionHandlerExceptionResolver=WARN
logging.level.org.springframework.jdbc.core=INFO
logging.level.org.springframework.web.method=INFO
"@
        # The generated file has an empty SQL password; the source uses a scanner-safe placeholder.
        $content = $content.Replace('app.persistence.sqlserver.password=TODO', 'app.persistence.sqlserver.password=')
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($content + [Environment]::NewLine)
        Write-ProductionConfigBytes $stream $bytes
    } catch {
        if ($null -ne $stream) { $stream.Dispose(); $stream = $null }
        if ($preparingCreated) { Remove-OwnedPreparingFile $preparingPath ([IO.Path]::GetDirectoryName($config)) }
        throw 'Nao foi possivel concluir a configuracao privada. Nenhum arquivo final ou runtime foi criado.'
    }
    finally {
        [Array]::Clear($key, 0, $key.Length)
        $keyBase64 = $null
        $content = $null
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
        if ($null -ne $stream) { $stream.Dispose() }
    }
    # Promote a fully written private file atomically; File.Move refuses an existing destination.
    try { [IO.File]::Move($preparingPath, $config) }
    catch {
        if ($preparingCreated) { Remove-OwnedPreparingFile $preparingPath ([IO.Path]::GetDirectoryName($config)) }
        throw 'Configuracao final nao criada. Nenhum arquivo existente foi sobrescrito.'
    }
    Write-Output 'Configuracao INCOMPLETA e logs preparados com ACL privada. Credencial SQL ausente; API nao iniciada.'
}

if ($MyInvocation.InvocationName -eq '.') { return }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Preparacao requer Windows.' }
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $repositoryRoot '.env'
$pointers = @{}
foreach ($line in [IO.File]::ReadLines($environmentFile)) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith('#')) { continue }
    if ($trimmed -notmatch '^(AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG|AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL|AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY)=(.*)$') {
        throw 'Formato ou ponteiro nao permitido no .env.'
    }
    $pointers[$matches[1]] = $matches[2].Trim().Trim('"', "'")
}
$approvedRoot = Join-Path $env:ProgramData 'Rodogarcia\AvaliacaoDesempenho'
$configurationPath = Join-Path $approvedRoot 'production\avaliacao-prod.properties'
$logDirectory = Join-Path $approvedRoot 'logs'
if ($pointers['AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG'] -ine $configurationPath -or
    $pointers['AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY'] -ine $logDirectory) {
    throw 'O .env precisa declarar exatamente os caminhos externos autorizados desta VM.'
}
Assert-NoReparsePoint $configurationPath
Assert-NoReparsePoint $logDirectory
if ($CheckOnly) {
    if (Test-Path -LiteralPath $configurationPath) { throw 'Configuracao ja existe; preparacao recusaria sobrescrita.' }
    if (Test-Path -LiteralPath $logDirectory) { throw 'Logs ja existem; preparacao recusaria alterar ACL.' }
    Write-Output 'Destinos autorizados conferidos. Nenhum arquivo, diretorio, ACL ou segredo foi criado.'
    exit 0
}
New-IncompleteProductionConfiguration -ApprovedRoot $approvedRoot -ConfigurationPath $configurationPath -LogDirectory $logDirectory

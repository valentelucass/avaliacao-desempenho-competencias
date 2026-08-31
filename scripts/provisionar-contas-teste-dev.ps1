[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$seedScript = Join-Path $repositoryRoot 'database\sql\manual\012_preparar_contas_perfis_teste_dev.sql'
$sqlServer = 'localhost,1433'
$database = 'AVALIACAO_DEV'
$credentialsDirectory = Join-Path $repositoryRoot 'secrets'
$credentialsFile = Join-Path $credentialsDirectory 'contas-teste-dev.csv'
$passwords = @{}
$hashes = @{}
$credentialsFileCreated = $false
$sqlPrepared = $false

function New-RandomPassword {
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return 'A!' + [Convert]::ToBase64String($bytes).Replace('+', 'x').Replace('/', 'y').Replace('=', 'z')
    }
    finally {
        $rng.Dispose()
    }
}

function New-BcryptHash {
    param([Parameter(Mandatory)][string]$PlainText)

    $jshell = Get-Command jshell.exe -ErrorAction SilentlyContinue
    if ($null -eq $jshell) {
        throw 'jshell não está disponível para criar as credenciais fictícias.'
    }

    $cryptoJar = Get-ChildItem -Path (Join-Path $env:USERPROFILE '.m2\repository\org\springframework\security\spring-security-crypto') `
        -Recurse -Filter 'spring-security-crypto-*.jar' -File -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($null -eq $cryptoJar) {
        throw 'A biblioteca BCrypt do projeto não está disponível no repositório Maven local.'
    }

    $previousPassword = [Environment]::GetEnvironmentVariable('ADC_DEV_TEST_PASSWORD', 'Process')
    try {
        [Environment]::SetEnvironmentVariable('ADC_DEV_TEST_PASSWORD', $PlainText, 'Process')
        $input = @(
            'import org.springframework.security.crypto.bcrypt.BCrypt;',
            'System.out.println(BCrypt.hashpw(System.getenv("ADC_DEV_TEST_PASSWORD"), BCrypt.gensalt(12)));',
            '/exit'
        ) -join [Environment]::NewLine
        $output = $input | & $jshell.Source --class-path $cryptoJar.FullName -q 2>$null
        $match = [regex]::Match(($output -join [Environment]::NewLine), '\$2[aby]\$12\$[./A-Za-z0-9]{53}')
        if (-not $match.Success) {
            throw 'Não foi possível gerar um hash BCrypt para as contas fictícias.'
        }
        return $match.Value
    }
    finally {
        [Environment]::SetEnvironmentVariable('ADC_DEV_TEST_PASSWORD', $previousPassword, 'Process')
    }
}

function New-ProtectedCredentialsFile {
    if (Test-Path -LiteralPath $credentialsFile) {
        throw 'O arquivo local de credenciais de teste já existe; ele não será sobrescrito.'
    }

    New-Item -ItemType Directory -Path $credentialsDirectory -Force | Out-Null
    @(
        [PSCustomObject]@{ Perfil = 'RH'; Login = 'teste.rh@avaliacao.test'; Senha = $passwords['RH'] }
        [PSCustomObject]@{ Perfil = 'Gestor'; Login = 'teste.gestor@avaliacao.test'; Senha = $passwords['GESTOR'] }
        [PSCustomObject]@{ Perfil = 'Diretoria'; Login = 'teste.diretoria@avaliacao.test'; Senha = $passwords['DIRETORIA'] }
        [PSCustomObject]@{ Perfil = 'Colaborador'; Login = 'teste.colaborador@avaliacao.test'; Senha = $passwords['COLABORADOR'] }
    ) | Export-Csv -LiteralPath $credentialsFile -NoTypeInformation -Encoding utf8

    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentIdentity, 'FullControl', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $credentialsFile -AclObject $acl
    $script:credentialsFileCreated = $true
}

function Invoke-SqlSeed {
    $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
    if ($null -eq $sqlcmd) {
        throw 'sqlcmd não está disponível para preparar as contas fictícias em DEV.'
    }
    if (-not (Test-Path -LiteralPath $seedScript)) {
        throw 'O script SQL de contas fictícias não foi encontrado.'
    }

    $output = & $sqlcmd.Source -S $sqlServer -E -N -C -d $database -b -r 1 -f 65001 `
        -v "ADC_TEST_RH_BCRYPT_HASH=$($hashes['RH'])" `
           "ADC_TEST_GESTOR_BCRYPT_HASH=$($hashes['GESTOR'])" `
           "ADC_TEST_DIRETORIA_BCRYPT_HASH=$($hashes['DIRETORIA'])" `
           "ADC_TEST_COLABORADOR_BCRYPT_HASH=$($hashes['COLABORADOR'])" `
        -i $seedScript 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'A preparação das contas e vínculos fictícios em AVALIACAO_DEV falhou.'
    }
    $script:sqlPrepared = $true
}

try {
    foreach ($profile in @('RH', 'GESTOR', 'DIRETORIA', 'COLABORADOR')) {
        $passwords[$profile] = New-RandomPassword
        $hashes[$profile] = New-BcryptHash -PlainText $passwords[$profile]
    }

    New-ProtectedCredentialsFile
    Invoke-SqlSeed

    Write-Host 'Quatro contas fictícias e o ciclo TESTE-PERFIS-DEV foram preparados exclusivamente em AVALIACAO_DEV.'
    Write-Host 'As credenciais estão no arquivo local protegido secrets\contas-teste-dev.csv, ignorado pelo Git.'
}
catch {
    if ($credentialsFileCreated -and -not $sqlPrepared -and (Test-Path -LiteralPath $credentialsFile)) {
        Remove-Item -LiteralPath $credentialsFile -Force
    }
    throw
}
finally {
    [Environment]::SetEnvironmentVariable('ADC_DEV_TEST_PASSWORD', $null, 'Process')
    $hashes.Clear()
    $passwords.Clear()
}

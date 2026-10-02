[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $repositoryRoot 'database/scripts/solicitar-autenticacao-sql.ps1')

function Assert-DatabaseAuth {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    if ($AsSecureString) {
        $script:maskedPrompts++
        if (-not $script:credentialInput) { return [Security.SecureString]::new() }
        return (ConvertTo-SecureString -String $script:credentialInput -AsPlainText -Force)
    }
    $script:loginPrompts++
    return $script:loginInput
}

$environmentNames = @('ADC_DB_USER', 'ADC_DATABASE_SQL_USER', 'SQLCMDPASSWORD',
    'ADC_DATABASE_CONFIG', 'ADC_DATABASE_SQL_MODE', 'ADC_DATABASE_APPLY_ALL_CONFIRMED',
    'FORCAR_AUTENTICACAO_SQL', 'ADC_TEST_EXPECTED_CREDENTIAL', 'ADC_TEST_TRACE',
    'ADC_TEST_EXIT_CODE', 'ADC_TEST_SQL_TRACE', 'PATH')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name) }
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('adc-database-auth-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temporaryRoot)
$passed = 0

try {
    foreach ($name in $environmentNames | Where-Object { $_ -ne 'PATH' }) {
        [Environment]::SetEnvironmentVariable($name, $null)
    }
    $script:credentialInput = [Guid]::NewGuid().ToString('N') + '"%&!^'
    $script:loginInput = 'fixture_login'
    $env:ADC_TEST_EXPECTED_CREDENTIAL = $script:credentialInput
    $env:ADC_TEST_TRACE = Join-Path $temporaryRoot 'runner-arguments.txt'
    $env:ADC_TEST_EXIT_CODE = '0'
    $fixtureRunner = Join-Path $temporaryRoot 'fixture-runner.bat'
    [IO.File]::WriteAllText($fixtureRunner, @'
@echo off
powershell.exe -NoProfile -Command "if ($env:ADC_DB_USER -ne 'fixture_login' -or $env:ADC_DATABASE_SQL_USER -ne 'fixture_login' -or $env:SQLCMDPASSWORD -cne $env:ADC_TEST_EXPECTED_CREDENTIAL) { exit 91 }"
if errorlevel 1 exit /b %ERRORLEVEL%
echo %* > "%ADC_TEST_TRACE%"
exit /b %ADC_TEST_EXIT_CODE%
'@.Replace("`n", "`r`n"), [Text.Encoding]::ASCII)

    $modes = [ordered]@{
        '' = ''
        CHECK = '--check'
        CHECK_ALL = '--check-all'
        APPLY = '--apply'
        APPLY_ALL = '--apply-all'
        APPLY_BOOTSTRAP_PREREQUISITES = '--apply-bootstrap-prerequisites'
        VALIDATE = '--validate'
        RECOVER_V0001 = '--recover-v0001-partial'
        RECOVER_EMPTY_BOOTSTRAP = '--recover-empty-bootstrap'
    }
    foreach ($mode in $modes.Keys) {
        $script:maskedPrompts = 0
        $script:loginPrompts = 0
        $code = Invoke-DatabaseWithSqlAuthentication -RunnerPath $fixtureRunner -Mode $mode
        $arguments = [IO.File]::ReadAllText($env:ADC_TEST_TRACE).Trim()
        # ECHO sem argumentos em CMD responde com seu estado; o caso padrao tem esse retorno.
        if (-not $mode) { Assert-DatabaseAuth ($arguments -notmatch '--') 'O modo padrao foi convertido em modo explicito.' }
        else { Assert-DatabaseAuth ($arguments -eq $modes[$mode]) 'O modo solicitado nao foi preservado.' }
        Assert-DatabaseAuth ($code -eq 0) 'A credencial com metacaracteres nao chegou intacta ao filho.'
        Assert-DatabaseAuth ($script:maskedPrompts -eq 1 -and $script:loginPrompts -eq 1) 'O pedido de senha deve usar entrada oculta.'
        Assert-DatabaseAuth ([string]::IsNullOrEmpty($env:SQLCMDPASSWORD) -and
            [string]::IsNullOrEmpty($env:ADC_DB_USER) -and
            [string]::IsNullOrEmpty($env:ADC_DATABASE_SQL_USER)) 'Credencial ficou no ambiente apos a execucao.'
        Assert-DatabaseAuth (-not $arguments.Contains($script:credentialInput)) 'Senha apareceu em argumentos.'
        $passed++
    }

    $env:ADC_TEST_EXIT_CODE = '23'
    Assert-DatabaseAuth ((Invoke-DatabaseWithSqlAuthentication -RunnerPath $fixtureRunner -Mode CHECK) -eq 23) 'Falha do executor foi mascarada.'
    Assert-DatabaseAuth ([string]::IsNullOrEmpty($env:SQLCMDPASSWORD)) 'Falha deixou senha no ambiente.'
    $passed++
    $env:ADC_TEST_EXIT_CODE = '0'

    $env:ADC_DB_USER = 'fixture_login'
    $env:ADC_DATABASE_SQL_USER = 'previous_override'
    $env:SQLCMDPASSWORD = $script:credentialInput
    $script:maskedPrompts = 0
    $script:loginPrompts = 0
    Assert-DatabaseAuth ((Invoke-DatabaseWithSqlAuthentication -RunnerPath $fixtureRunner -Mode CHECK) -eq 0) 'Credencial do processo foi rejeitada.'
    Assert-DatabaseAuth ($script:maskedPrompts -eq 0 -and $script:loginPrompts -eq 0) 'Credencial existente pediu senha novamente.'
    Assert-DatabaseAuth ($env:ADC_DATABASE_SQL_USER -eq 'previous_override' -and
        $env:SQLCMDPASSWORD -ceq $script:credentialInput -and $env:ADC_DB_USER -eq 'fixture_login') 'Ambiente anterior nao foi restaurado.'
    $passed++
    $env:ADC_DB_USER = $null
    $env:ADC_DATABASE_SQL_USER = $null
    $env:SQLCMDPASSWORD = $null

    foreach ($invalidLogin in @('', 'user&echo', 'user name')) {
        Remove-Item -LiteralPath $env:ADC_TEST_TRACE -Force
        $script:loginInput = $invalidLogin
        $script:maskedPrompts = 0
        $refused = $false
        try { Invoke-DatabaseWithSqlAuthentication -RunnerPath $fixtureRunner -Mode CHECK | Out-Null }
        catch { $refused = $true }
        Assert-DatabaseAuth ($refused -and -not (Test-Path -LiteralPath $env:ADC_TEST_TRACE)) 'Login invalido executou o runner.'
        Assert-DatabaseAuth ($script:maskedPrompts -eq 0) 'Senha foi solicitada para login invalido.'
        $passed++
        [IO.File]::WriteAllText($env:ADC_TEST_TRACE, '')
    }
    $script:loginInput = 'fixture_login'

    $fixtureCredential = $script:credentialInput
    $script:credentialInput = ''
    $refused = $false
    try { Invoke-DatabaseWithSqlAuthentication -RunnerPath $fixtureRunner -Mode CHECK | Out-Null }
    catch { $refused = $true }
    Assert-DatabaseAuth ($refused -and [string]::IsNullOrEmpty($env:SQLCMDPASSWORD)) 'Senha vazia deve cancelar a execucao.'
    $passed++
    $script:credentialInput = $fixtureCredential

    # Copia isolada com sqlcmd EXE simulado; nenhuma chamada pode atingir o SQL real.
    $databaseRoot = Join-Path $temporaryRoot 'database'
    [void][IO.Directory]::CreateDirectory($databaseRoot)
    Copy-Item -LiteralPath (Join-Path $repositoryRoot 'database/executar-database.bat') -Destination $databaseRoot
    Copy-Item -LiteralPath (Join-Path $repositoryRoot 'database/scripts') -Destination $databaseRoot -Recurse
    Copy-Item -LiteralPath (Join-Path $repositoryRoot 'database/sql') -Destination $databaseRoot -Recurse
    foreach ($target in @(@('config.local.bat', 'AVALIACAO_DEV', '1'), @('config.production.local.bat', 'AVALIACAO_PROD', '0'))) {
        $configuration = "@echo off`r`nset `"ADC_DB_SERVER=localhost`"`r`nset `"ADC_DB_PORT=1433`"`r`nset `"ADC_DB_NAME=$($target[1])`"`r`nset `"ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=$($target[2])`"`r`n"
        if ($target[1] -eq 'AVALIACAO_PROD') { $configuration += "set `"ADC_DB_USER=configured_login`"`r`n" }
        [IO.File]::WriteAllText((Join-Path $databaseRoot $target[0]), $configuration, [Text.Encoding]::ASCII)
    }
    $stubDirectory = Join-Path $temporaryRoot 'bin'
    [void][IO.Directory]::CreateDirectory($stubDirectory)
    Add-Type -OutputAssembly (Join-Path $stubDirectory 'sqlcmd.exe') -OutputType ConsoleApplication -TypeDefinition @'
using System;
using System.IO;
using System.Linq;
class SqlcmdAuthFixture {
    static string Value(string[] a, string flag) { int i = Array.IndexOf(a, flag); return i < 0 ? null : a[i + 1]; }
    static int Main(string[] a) {
        string credential = Environment.GetEnvironmentVariable("SQLCMDPASSWORD");
        string login = Value(a, "-U");
        if (a.Contains("-P") || (credential != null && a.Any(x => x.Contains(credential)))) return 81;
        if (login != null && (login != "fixture_login" || credential != Environment.GetEnvironmentVariable("ADC_TEST_EXPECTED_CREDENTIAL"))) return 82;
        if (login == null && !a.Contains("-E")) return 83;
        string database = Environment.GetEnvironmentVariable("ADC_DB_NAME");
        if (!a.Contains("-N") || (database == "AVALIACAO_PROD" && a.Contains("-C"))) return 84;
        File.AppendAllText(Environment.GetEnvironmentVariable("ADC_TEST_SQL_TRACE"), (login == null ? "WINDOWS" : "SQL") + "|" + database + Environment.NewLine);
        string input = Value(a, "-i");
        if (input != null) {
            if (Path.GetFileName(input) != "003_verificar_banco.sql") return 85;
            Console.WriteLine("MISSING");
        } else if (Value(a, "-Q") != "SET NOCOUNT ON; SELECT 1;") return 86;
        return 0;
    }
}
'@
    $env:PATH = $stubDirectory + ';' + $env:PATH
    $env:ADC_TEST_SQL_TRACE = Join-Path $temporaryRoot 'sql-trace.txt'
    $env:ADC_DB_USER = 'fixture_login'
    $env:SQLCMDPASSWORD = $script:credentialInput
    Push-Location $databaseRoot
    try {
        $output = & cmd.exe /d /c 'executar-database.bat --check-all --sql' 2>&1 | Out-String
        Assert-DatabaseAuth ($LASTEXITCODE -eq 0) 'O --sql nao verificou os dois alvos na copia isolada.'
        $trace = [IO.File]::ReadAllLines($env:ADC_TEST_SQL_TRACE)
        Assert-DatabaseAuth ($trace.Length -eq 4 -and
            $trace[0] -eq 'SQL|AVALIACAO_DEV' -and $trace[2] -eq 'SQL|AVALIACAO_PROD') 'SQL nao preservou ordem e override de login nos dois alvos.'
        Assert-DatabaseAuth (-not $output.Contains($script:credentialInput)) 'O terminal revelou a credencial.'
        $passed++

        $env:ADC_DB_USER = $null
        $env:SQLCMDPASSWORD = $null
        $output = & cmd.exe /d /c 'executar-database.bat --check' 2>&1 | Out-String
        Assert-DatabaseAuth ($LASTEXITCODE -eq 0) 'Autenticacao Windows sem --sql deixou de funcionar.'
        $trace = [IO.File]::ReadAllLines($env:ADC_TEST_SQL_TRACE)
        Assert-DatabaseAuth ($trace[-1] -eq 'WINDOWS|AVALIACAO_DEV') 'O caminho Windows foi substituido.'
        $passed++
    } finally { Pop-Location }

    $global:LASTEXITCODE = 0
    Write-Host "Autenticacao do executor: $passed cenarios aprovados com credenciais ficticias e SQL simulado."
} finally {
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name]) }
    $resolvedRoot = [IO.Path]::GetFullPath($temporaryRoot)
    $temporaryPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedRoot.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        -not [IO.Path]::GetFileName($resolvedRoot).StartsWith('adc-database-auth-') -or
        (Get-Item -LiteralPath $resolvedRoot -Force).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
        throw 'Alvo de limpeza fora do diretorio temporario de teste.'
    }
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
}

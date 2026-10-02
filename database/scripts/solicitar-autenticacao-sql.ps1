[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-DatabaseWithSqlAuthentication {
    [CmdletBinding()]
    param(
        [string]$RunnerPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'executar-database.bat'),
        [AllowEmptyString()]
        [ValidateSet('', 'CHECK', 'CHECK_ALL', 'APPLY', 'APPLY_ALL',
            'APPLY_BOOTSTRAP_PREREQUISITES', 'VALIDATE', 'RECOVER_V0001', 'RECOVER_EMPTY_BOOTSTRAP')]
        [string]$Mode = ''
    )

    if (-not (Test-Path -LiteralPath $RunnerPath -PathType Leaf) -or
        [IO.Path]::GetExtension($RunnerPath) -ine '.bat') {
        throw 'Executor de banco nao encontrado.'
    }

    $argumentsByMode = @{
        CHECK = '--check'
        CHECK_ALL = '--check-all'
        APPLY = '--apply'
        APPLY_ALL = '--apply-all'
        APPLY_BOOTSTRAP_PREREQUISITES = '--apply-bootstrap-prerequisites'
        VALIDATE = '--validate'
        RECOVER_V0001 = '--recover-v0001-partial'
        RECOVER_EMPTY_BOOTSTRAP = '--recover-empty-bootstrap'
    }
    $runnerArguments = @()
    if ($Mode) { $runnerArguments = @($argumentsByMode[$Mode]) }

    $login = $env:ADC_DB_USER
    if ([string]::IsNullOrWhiteSpace($login)) {
        $login = Read-Host 'Login SQL existente e autorizado para os alvos selecionados'
    }
    if ($login -notmatch '^[A-Za-z_][A-Za-z0-9_.-]{0,127}$') {
        throw 'Login SQL invalido ou nao informado. Operacao cancelada.'
    }

    $previousLogin = $env:ADC_DB_USER
    $previousOverride = $env:ADC_DATABASE_SQL_USER
    $previousPassword = $env:SQLCMDPASSWORD
    $securePassword = $null
    try {
        if ([string]::IsNullOrEmpty($previousPassword)) {
            $securePassword = Read-Host 'Senha SQL (entrada oculta)' -AsSecureString
            if ($securePassword.Length -eq 0) {
                throw 'Senha SQL nao informada. Operacao cancelada.'
            }
            $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
            try {
                $env:SQLCMDPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
            } finally {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            }
        }
        $env:ADC_DB_USER = $login
        $env:ADC_DATABASE_SQL_USER = $login
        $global:LASTEXITCODE = 0
        & $RunnerPath @runnerArguments | Out-Host
        return [int]$LASTEXITCODE
    } finally {
        $env:SQLCMDPASSWORD = $previousPassword
        $env:ADC_DB_USER = $previousLogin
        $env:ADC_DATABASE_SQL_USER = $previousOverride
        if ($null -ne $securePassword) { $securePassword.Dispose() }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        $code = Invoke-DatabaseWithSqlAuthentication -Mode $env:ADC_DATABASE_SQL_MODE
        exit $code
    } catch {
        [Console]::Error.WriteLine('[ERRO] ' + $_.Exception.Message)
        exit 1
    }
}

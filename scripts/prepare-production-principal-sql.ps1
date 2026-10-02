[CmdletBinding()]
param(
    [ValidateSet('rodogarcia_adc_app','rodogarcia_adc_runtime')]
    [string]$ApplicationUser='rodogarcia_adc_app',
    [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

function Get-ProductionPrincipalSql {
    param([ValidateSet('rodogarcia_adc_app','rodogarcia_adc_runtime')]
        [string]$ApplicationUser='rodogarcia_adc_app')
    $repositoryRoot=Split-Path -Parent $PSScriptRoot
    $values=@{DatabaseName='AVALIACAO_PROD';ApplicationLogin='rodogarcia_adc_app';ApplicationUser=$ApplicationUser}
    $names=@('002_validar_login_e_usuario_da_aplicacao.sql','003_conceder_delete_objetos_da_aplicacao.sql',
        '004_conceder_delete_cadastros_sem_uso.sql')
    foreach ($name in $names) {
        $source=Join-Path $repositoryRoot ('database\production\'+$name)
        $sql=[IO.File]::ReadAllText($source,[Text.Encoding]::UTF8)
        # Resolve only the three declared, fixed/allowlisted names. No sqlcmd execution.
        $sql=[regex]::Replace($sql,'(?m)^:setvar (DatabaseName|ApplicationLogin|ApplicationUser) "[^"]*"\r?\n','')
        if ($sql -match '(?m)^\s*:') { throw 'UNSUPPORTED_SQLCMD_DIRECTIVE' }
        foreach ($key in $values.Keys) { $sql=$sql.Replace('$('+ $key +')',$values[$key]) }
        if ($sql -match '\$\(') { throw 'UNRESOLVED_SQLCMD_VARIABLE' }
        [pscustomobject]@{Name=$name;Sql=$sql}
    }
}

if ($MyInvocation.InvocationName -eq '.') { return }
$resolved=@(Get-ProductionPrincipalSql -ApplicationUser $ApplicationUser)
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    [ordered]@{Status='CHECK_ONLY_NO_FILES_NO_SQL';ApplicationUser=$ApplicationUser;Scripts=$resolved.Count;SqlExecuted=$false}|ConvertTo-Json
    exit 0
}
$output=[IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\')
$repositoryRoot=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
if ($output -ieq $repositoryRoot -or $output.StartsWith($repositoryRoot+'\',[StringComparison]::OrdinalIgnoreCase)) {
    throw 'OUTPUT_MUST_BE_OUTSIDE_REPOSITORY'
}
. (Join-Path $PSScriptRoot 'prepare-production-config.ps1')
Assert-NoReparsePoint $output
if (Test-Path -LiteralPath $output) { throw 'OUTPUT_EXISTS_OVERWRITE_REFUSED' }
New-PrivateDirectory $output
Assert-PrivateAcl $output
foreach ($item in $resolved) {
    $stream=[IO.File]::Open((Join-Path $output $item.Name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes($item.Sql)
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}
[ordered]@{Status='PRIVATE_SQL_REVIEW_COPY_ONLY';ApplicationUser=$ApplicationUser;OutputDirectory=$output;
    Scripts=$resolved.Count;SqlExecuted=$false;OriginalScriptsChanged=$false}|ConvertTo-Json

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$MigrationPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$SqlValidationPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Contains {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$Expected,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if ($Content.IndexOf($Expected, [System.StringComparison]::Ordinal) -lt 0) {
        throw "Regra de delegacao de senha ausente: $Description"
    }
}

try {
    $migration = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $MigrationPath).Path)
    $sqlValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $SqlValidationPath).Path)

    foreach ($permission in @("N'SENHAS.REDEFINIR'", "N'SENHAS.DELEGAR_REDEFINICAO'")) {
        Assert-Contains -Content $migration -Expected $permission -Description "catalogo $permission"
        Assert-Contains -Content $sqlValidation -Expected $permission -Description "validacao $permission"
    }

    Assert-Contains -Content $migration -Expected "'MIGRACAO.CATALOGO_DELEGACAO_SENHA'" -Description 'auditoria da migration'
    Assert-Contains -Content $sqlValidation -Expected "WHERE version = N'V0015'" -Description 'estado pendente explicito'
    Assert-Contains -Content $sqlValidation -Expected 'dbo.papel_permissao' -Description 'proibicao de perfil'

    $databaseRunner = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\executar-database.bat')).Path)
    Assert-Contains -Content $databaseRunner -Expected '015_validar_delegacao_individual_redefinicao_senha.sql' -Description 'execucao da validacao apos a migration'

    Write-Output 'Regras estaticas da V0015 (delegacao individual de senha) validadas.'
}
catch {
    [Console]::Error.WriteLine("Falha ao testar a V0015: $($_.Exception.Message)")
    exit 1
}

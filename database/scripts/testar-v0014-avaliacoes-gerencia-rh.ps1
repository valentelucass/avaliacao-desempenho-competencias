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
        throw "Regra de avaliacao da Gerencia de RH ausente: $Description"
    }
}

try {
    $migration = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $MigrationPath).Path)
    $sqlValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $SqlValidationPath).Path)

    foreach ($permission in @(
        "N'AVALIACOES.AVALIAR_VINCULADOS'",
        "N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'",
        "N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'",
        "N'AUTOAVALIACOES.PREENCHER_PROPRIA'",
        "N'AUTOAVALIACOES.ENVIAR_PROPRIA'",
        "N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'"
    )) {
        Assert-Contains -Content $migration -Expected $permission -Description "concessao de $permission"
        Assert-Contains -Content $sqlValidation -Expected $permission -Description "validacao de $permission"
    }

    Assert-Contains -Content $migration -Expected "N'GERENCIA_RH'" -Description 'papel de RH'
    Assert-Contains -Content $migration -Expected "'MIGRACAO.HABILITAR_AVALIACOES_GERENCIA_RH'" -Description 'auditoria da migration'
    Assert-Contains -Content $sqlValidation -Expected "WHERE version = N'V0014'" -Description 'estado pendente explicito'
    Assert-Contains -Content $sqlValidation -Expected "papel.codigo = N'ADMINISTRADOR_PLATAFORMA'" -Description 'segregacao do administrador tecnico'

    $databaseRunner = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\executar-database.bat')).Path)
    Assert-Contains -Content $databaseRunner -Expected '014_validar_avaliacoes_e_autoavaliacoes_gerencia_rh.sql' -Description 'execucao da validacao apos a migration'

    Write-Output 'Regras estaticas da V0014 (avaliacoes e autoavaliacoes da Gerencia de RH) validadas.'
}
catch {
    [Console]::Error.WriteLine("Falha ao testar a V0014: $($_.Exception.Message)")
    exit 1
}

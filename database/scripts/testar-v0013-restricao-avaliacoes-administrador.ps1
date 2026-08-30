[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$MigrationPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$SqlValidationPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ProfileValidationPath
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
        throw "Regra de segregacao ausente: $Description"
    }
}

try {
    $migration = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $MigrationPath).Path)
    $sqlValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $SqlValidationPath).Path)
    $profileValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $ProfileValidationPath).Path)

    foreach ($permission in @(
        "N'AVALIACOES.AVALIAR_VINCULADOS'",
        "N'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'",
        "N'AVALIACOES.VISUALIZAR_TODAS'",
        "N'AUTOAVALIACOES.PREENCHER_PROPRIA'",
        "N'AUTOAVALIACOES.ENVIAR_PROPRIA'",
        "N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'"
    )) {
        Assert-Contains -Content $migration -Expected $permission -Description "revogacao de $permission"
        Assert-Contains -Content $sqlValidation -Expected $permission -Description "validacao de $permission"
    }

    Assert-Contains -Content $migration -Expected "'MIGRACAO.RESTRINGIR_AVALIACOES_ADMINISTRADOR'" -Description 'auditoria da migration'
    Assert-Contains -Content $sqlValidation -Expected "WHERE version = N'V0013'" -Description 'estado pendente explicito'
    Assert-Contains -Content $profileValidation -Expected 'DECLARE @v0013_aplicada bit' -Description 'compatibilidade do catalogo tecnico apos V0013'

    Write-Output 'Regras estaticas da V0013 (segregacao de avaliacoes do administrador tecnico) validadas.'
}
catch {
    [Console]::Error.WriteLine("Falha ao testar a V0013: $($_.Exception.Message)")
    exit 1
}

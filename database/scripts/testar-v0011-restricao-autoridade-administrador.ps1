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
        [Parameter(Mandatory = $true)]
        [string]$Content,

        [Parameter(Mandatory = $true)]
        [string]$Expected,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    if ($Content.IndexOf($Expected, [System.StringComparison]::Ordinal) -lt 0) {
        throw "Regra de restricao de autoridade ausente: $Description"
    }
}

try {
    $migration = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $MigrationPath).Path)
    $sqlValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $SqlValidationPath).Path)
    $profileValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $ProfileValidationPath).Path)

    $migrationRequirements = @(
        @("N'AVALIACOES.PUBLICAR'", 'revogacao de publicacao'),
        @("N'AVALIACOES.REABRIR'", 'revogacao de reabertura'),
        @("N'INDICADORES.VISUALIZAR'", 'revogacao de indicadores'),
        @("N'DADOS.EXPORTAR'", 'revogacao de exportacao'),
        @('UPDATE papel_permissao', 'revogacao historica de permissoes'),
        @('revogado_por_usuario_id = @ator_usuario_id', 'ator auditavel da revogacao'),
        @('UPDATE atribuicao', 'normalizacao historica de perfis'),
        @("(N'GESTOR')", 'perfil gestor normalizado'),
        @("(N'GERENCIA_RH')", 'perfil RH normalizado'),
        @("(N'DIRETORIA')", 'perfil diretoria normalizado'),
        @("(N'COLABORADOR')", 'perfil colaborador normalizado'),
        @("'ACESSO.PAPEL.RESTRINGIR_AUTORIDADE'", 'auditoria da migration')
    )

    foreach ($requirement in $migrationRequirements) {
        Assert-Contains -Content $migration -Expected $requirement[0] -Description $requirement[1]
    }

    $validationRequirements = @(
        @("WHERE version = N'V0011'", 'estado pendente da V0011'),
        @("N'V0011_PENDENTE'", 'resultado pendente explicito'),
        @("N'ADMINISTRADOR_PLATAFORMA'", 'verificacao do administrador'),
        @("N'GERENCIA_RH'", 'verificacao do perfil RH'),
        @("N'DIRETORIA'", 'verificacao do perfil diretoria'),
        @('concessao.revogado_em_utc IS NULL', 'somente permissoes ativas'),
        @('atribuicao_negocio.revogado_em_utc IS NULL', 'somente perfis ativos')
    )

    foreach ($requirement in $validationRequirements) {
        Assert-Contains -Content $sqlValidation -Expected $requirement[0] -Description $requirement[1]
    }

    Assert-Contains -Content $profileValidation -Expected 'DECLARE @v0011_aplicada bit' -Description 'compatibilidade da validacao V0009 apos V0011'
    Assert-Contains -Content $profileValidation -Expected 'concessao.revogado_em_utc IS NULL' -Description 'contagem apenas de permissoes ativas apos V0011'

    Write-Output 'Regras estaticas da V0011 (restricao de autoridade) validadas.'
}
catch {
    [Console]::Error.WriteLine("Falha ao testar a V0011: $($_.Exception.Message)")
    exit 1
}

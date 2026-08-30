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
        [Parameter(Mandatory = $true)]
        [string]$Content,

        [Parameter(Mandatory = $true)]
        [string]$Expected,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    if ($Content.IndexOf($Expected, [System.StringComparison]::Ordinal) -lt 0) {
        throw "Regra de feedback integrada ausente: $Description"
    }
}

try {
    $migration = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $MigrationPath).Path)
    $sqlValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $SqlValidationPath).Path)

    $migrationRequirements = @(
        @('CREATE TABLE dbo.vinculo_diretoria_gerencia', 'tabela de vinculo separado'),
        @('UX_vinculo_diretoria_gerencia_gerencia_ativo', 'exclusividade de Gerencia ativa'),
        @("'DIRETORIA_GERENCIA'", 'novo tipo de avaliacao'),
        @('FK_avaliacao_vinculo_diretoria_gerencia', 'integridade da avaliacao de Diretoria'),
        @('CREATE TABLE dbo.feedback_avaliacao', 'feedback interno por versao'),
        @('UQ_feedback_avaliacao_versao', 'unicidade de feedback por versao'),
        @("'NAO_APLICAVEL', 'PENDENTE', 'CONCLUIDO'", 'estados de feedback'),
        @("N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'", 'permissao de feedback proprio'),
        @("N'AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS'", 'permissao de Diretoria'),
        @("papel.codigo = N'COLABORADOR'", 'revogacao do perfil sem login'),
        @("'MIGRACAO.FEEDBACK.E_VINCULO_DIRETORIA_GERENCIA'", 'auditoria da migration')
    )

    foreach ($requirement in $migrationRequirements) {
        Assert-Contains -Content $migration -Expected $requirement[0] -Description $requirement[1]
    }

    $validationRequirements = @(
        @("WHERE version = N'V0012'", 'estado pendente explicito'),
        @("N'V0012_PENDENTE'", 'resultado pendente'),
        @("OBJECT_ID(N'dbo.vinculo_diretoria_gerencia', N'U')", 'tabela de vinculo'),
        @("OBJECT_ID(N'dbo.feedback_avaliacao', N'U')", 'tabela de feedback'),
        @("N'CK_feedback_avaliacao_conclusao'", 'restricao de conclusao'),
        @("N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'", 'catalogo de permissoes'),
        @("papel.codigo = N'COLABORADOR'", 'bloqueio do perfil sem acesso')
    )

    foreach ($requirement in $validationRequirements) {
        Assert-Contains -Content $sqlValidation -Expected $requirement[0] -Description $requirement[1]
    }

    $legacyRuleValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\sql\validation\006_validar_regra_operacional_2024_1.sql')).Path)
    $legacyRbacValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\sql\validation\007_validar_catalogo_rbac_2024_1.sql')).Path)
    $legacyProfileValidation = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\sql\validation\009_validar_perfis_administrador_integral_e_usuario_comum.sql')).Path)

    Assert-Contains -Content $legacyRuleValidation -Expected "N'CK_avaliacao_tipo_2026_feedback'" -Description 'compatibilidade da V0005 com a constraint expandida'
    Assert-Contains -Content $legacyRbacValidation -Expected 'IF @v0012_aplicada = 1' -Description 'compatibilidade da V0006 com colaborador sem acesso'
    Assert-Contains -Content $legacyProfileValidation -Expected "N'VINCULOS_DIRETORIA_GERENCIA.GERIR'" -Description 'catalogo tecnico do administrador apos V0012'

    Write-Output 'Regras estaticas da V0012 (feedback integrado e Diretoria-Gerencia) validadas.'
}
catch {
    [Console]::Error.WriteLine("Falha ao testar a V0012: $($_.Exception.Message)")
    exit 1
}

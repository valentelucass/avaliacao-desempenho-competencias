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
        throw "Regra de atribuicao de questionario ausente na migration: $Description"
    }
}

try {
    $resolvedMigrationPath = (Resolve-Path -LiteralPath $MigrationPath).Path
    $resolvedSqlValidationPath = (Resolve-Path -LiteralPath $SqlValidationPath).Path
    $migration = [System.IO.File]::ReadAllText($resolvedMigrationPath)
    $sqlValidation = [System.IO.File]::ReadAllText($resolvedSqlValidationPath)

    $migrationRequirements = @(
        @('CREATE TABLE dbo.atribuicao_questionario_colaborador', 'tabela de atribuicao explicita'),
        @('FK_atribuicao_questionario_colaborador_ciclo_questionario_ciclo', 'FK do questionario para o ciclo'),
        @('FOREIGN KEY (ciclo_questionario_id, ciclo_avaliacao_id)', 'colunas da FK para o ciclo'),
        @('REFERENCES dbo.ciclo_questionario (ciclo_questionario_id, ciclo_avaliacao_id)', 'destino da FK para o ciclo'),
        @('UX_atribuicao_questionario_colaborador_ativa', 'unicidade da atribuicao ativa'),
        @('ON dbo.atribuicao_questionario_colaborador (ciclo_avaliacao_id, colaborador_id)', 'chave unica por colaborador e ciclo'),
        @('atribuido_por_usuario_id uniqueidentifier NOT NULL', 'auditoria do responsavel pela atribuicao'),
        @('revogado_por_usuario_id uniqueidentifier NULL', 'historico de revogacao'),
        @('motivo_revogacao nvarchar(500) NULL', 'motivo de revogacao'),
        @('AND motivo_revogacao IS NOT NULL', 'motivo obrigatorio ao revogar'),
        @('ALTER TABLE dbo.avaliacao', 'vinculo da avaliacao a atribuicao'),
        @('FK_avaliacao_atribuicao_questionario_colaborador', 'FK da avaliacao para atribuicao aplicavel'),
        @("EXEC(N'CREATE TRIGGER", 'criacao de gatilhos em lote dinamico'),
        @('TR_atribuicao_questionario_colaborador_historico', 'historico imutavel'),
        @('TR_atribuicao_questionario_colaborador_ciclo_rascunho', 'bloqueio apos abertura do ciclo'),
        @('TR_avaliacao_questionario_atribuido_ativo', 'uso de atribuicao ativa na avaliacao')
    )

    foreach ($requirement in $migrationRequirements) {
        Assert-Contains -Content $migration -Expected $requirement[0] -Description $requirement[1]
    }

    $validationRequirements = @(
        @("WHERE version = N'V0007'", 'consulta do historico da V0007'),
        @("N'V0007_PENDENTE'", 'estado explicito antes da aplicacao'),
        @("N'FK_atribuicao_questionario_colaborador_ciclo_questionario_ciclo'", 'FK composta na validacao'),
        @("N'FK composta nao prova que ciclo_questionario pertence ao ciclo.'", 'validacao das colunas da FK composta'),
        @("N'UX_atribuicao_questionario_colaborador_ativa'", 'unicidade ativa na validacao'),
        @("N'FK_avaliacao_atribuicao_questionario_colaborador'", 'vinculo da avaliacao na validacao')
    )

    foreach ($requirement in $validationRequirements) {
        Assert-Contains -Content $sqlValidation -Expected $requirement[0] -Description $requirement[1]
    }

    Write-Output 'Regras estaticas da V0007 (atribuicao de questionario) validadas.'
} catch {
    [Console]::Error.WriteLine("Falha ao testar a V0007: $($_.Exception.Message)")
    exit 1
}

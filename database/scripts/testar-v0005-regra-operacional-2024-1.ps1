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
        throw "Regra 2024.1 ausente na migration: $Description"
    }
}

try {
    $resolvedMigrationPath = (Resolve-Path -LiteralPath $MigrationPath).Path
    $resolvedSqlValidationPath = (Resolve-Path -LiteralPath $SqlValidationPath).Path
    $migration = [System.IO.File]::ReadAllText($resolvedMigrationPath)
    $sqlValidation = [System.IO.File]::ReadAllText($resolvedSqlValidationPath)

    $migrationRequirements = @(
        @('CREATE TABLE dbo.vinculo_usuario_colaborador', 'vinculo explicito conta-colaborador'),
        @('UX_vinculo_usuario_colaborador_usuario_ativo', 'uma conta ativa por colaborador'),
        @('UX_vinculo_usuario_colaborador_colaborador_ativo', 'um colaborador por conta ativa'),
        @('UX_vinculo_gestor_colaborador_colaborador_ativo', 'um gestor ativo por colaborador'),
        @('ADD obrigatoria bit NOT NULL', 'obrigatoriedade de pergunta'),
        @('pontos IN (80, 90, 100, 110, 120)', 'escala de cinco pontos'),
        @("algoritmo = 'MEDIA_SIMPLES'", 'media simples'),
        @("modo_arredondamento = 'HALF_UP'", 'arredondamento HALF_UP'),
        @("tipo_avaliacao IN ('GESTOR', 'AUTOAVALIACAO')", 'tipos de avaliação v1'),
        @('UQ_avaliacao_ciclo_colaborador_tipo', 'unicidade por ciclo, colaborador e tipo'),
        @("acao IN ('CRIACAO', 'ENVIO', 'PUBLICACAO', 'REABERTURA')", 'histórico de reabertura'),
        @("acao = 'REABERTURA' AND situacao_origem = 'PUBLICADA' AND situacao_destino = 'RASCUNHO'", 'fluxo de reabertura'),
        @('CREATE TABLE dbo.resultado_avaliacao', 'resultado versionado'),
        @('soma_pontos >= quantidade_respostas * 80', 'limite inferior da soma'),
        @('soma_pontos <= quantidade_respostas * 120', 'limite superior da soma'),
        @('CK_resultado_avaliacao_classificacao', 'classificação persistida'),
        @('TR_ciclo_avaliacao_janela_immutavel_apos_abertura', 'imutabilidade do ciclo'),
        @("EXEC(N'CREATE TRIGGER", 'criacao de gatilhos em lote dinamico'),
        @('TR_versao_questionario_immutavel_apos_aprovacao', 'imutabilidade do questionário'),
        @('TR_resultado_avaliacao_imutavel', 'imutabilidade do resultado')
    )

    foreach ($requirement in $migrationRequirements) {
        Assert-Contains -Content $migration -Expected $requirement[0] -Description $requirement[1]
    }

    $validationRequirements = @(
        @("WHERE version = N'V0005'", 'consulta do histórico da V0005'),
        @("N'V0005_PENDENTE'", 'estado explícito antes da aplicação'),
        @("N'vinculo_usuario_colaborador'", 'tabela de vínculo na validação'),
        @("N'CK_avaliacao_tipo_2024_1'", 'restrição de tipo na validação'),
        @("N'UQ_avaliacao_ciclo_colaborador_tipo'", 'unicidade na validação'),
        @("N'TR_resultado_avaliacao_imutavel'", 'gatilho de resultado na validação')
    )

    foreach ($requirement in $validationRequirements) {
        Assert-Contains -Content $sqlValidation -Expected $requirement[0] -Description $requirement[1]
    }

    Write-Output 'Regras estaticas da V0005 (2024.1) validadas.'
} catch {
    [Console]::Error.WriteLine("Falha ao testar a V0005: $($_.Exception.Message)")
    exit 1
}

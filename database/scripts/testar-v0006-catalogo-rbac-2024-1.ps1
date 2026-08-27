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
        throw "Regra RBAC 2024.1 ausente na migration: $Description"
    }
}

try {
    $resolvedMigrationPath = (Resolve-Path -LiteralPath $MigrationPath).Path
    $resolvedSqlValidationPath = (Resolve-Path -LiteralPath $SqlValidationPath).Path
    $migration = [System.IO.File]::ReadAllText($resolvedMigrationPath)
    $sqlValidation = [System.IO.File]::ReadAllText($resolvedSqlValidationPath)

    $migrationRequirements = @(
        @("N'COLABORADOR'", 'papel COLABORADOR'),
        @("N'AUTOAVALIACOES.PREENCHER_PROPRIA'", 'preenchimento da autoavaliacao'),
        @("N'AUTOAVALIACOES.ENVIAR_PROPRIA'", 'envio da autoavaliacao'),
        @("N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'", 'consulta da propria autoavaliacao'),
        @("N'CADASTROS.GERIR'", 'administracao de cadastros'),
        @("N'ACESSOS.NEGOCIO.GERIR'", 'segregacao de acesso de negocio'),
        @("N'CICLOS.GERIR'", 'administracao de ciclos'),
        @("N'QUESTIONARIOS.GERIR'", 'administracao de questionarios'),
        @("N'VINCULOS_GESTOR_COLABORADOR.GERIR'", 'gestao de vinculos de gestor'),
        @("N'VINCULOS_USUARIO_COLABORADOR.GERIR'", 'gestao de vinculos de conta'),
        @("(N'COLABORADOR', N'AUTOAVALIACOES.PREENCHER_PROPRIA')", 'concessao minima ao colaborador'),
        @("(N'ADMINISTRADOR_PLATAFORMA', N'CADASTROS.GERIR')", 'concessao de cadastros ao administrador'),
        @("(N'GERENCIA_RH', N'QUESTIONARIOS.GERIR')", 'concessao de questionarios a RH'),
        @("(N'GERENCIA_RH', N'ACESSOS.NEGOCIO.GERIR')", 'concessao de acesso de negocio a RH'),
        @("(N'DIRETORIA', N'ACESSOS.NEGOCIO.GERIR')", 'concessao de acesso de negocio a diretoria'),
        @("(N'DIRETORIA', N'CICLOS.GERIR')", 'concessao de ciclos a diretoria')
    )

    foreach ($requirement in $migrationRequirements) {
        Assert-Contains -Content $migration -Expected $requirement[0] -Description $requirement[1]
    }

    if ([regex]::IsMatch($migration, '(?i)\bdbo\.(atribuicao_papel|concessao_permissao_usuario)\b')) {
        throw 'A V0006 nao pode atribuir papeis ou permissoes diretamente a usuarios.'
    }

    $validationRequirements = @(
        @("WHERE version = N'V0006'", 'consulta do historico da V0006'),
        @("N'V0006_PENDENTE'", 'estado explicito antes da aplicacao'),
        @("N'COLABORADOR'", 'papel de colaborador na validacao'),
        @("N'AUTOAVALIACOES.PREENCHER_PROPRIA'", 'permissao de autoavaliacao na validacao'),
        @("N'ACESSOS.NEGOCIO.GERIR'", 'permissao de segregacao na validacao'),
        @("N'VINCULOS_GESTOR_COLABORADOR.GERIR'", 'permissao de vinculo na validacao'),
        @("N'VINCULOS_USUARIO_COLABORADOR.GERIR'", 'permissao de vinculo de conta na validacao'),
        @("N'DIRETORIA', N'CICLOS.GERIR'", 'concessao conservadora na validacao')
    )

    foreach ($requirement in $validationRequirements) {
        Assert-Contains -Content $sqlValidation -Expected $requirement[0] -Description $requirement[1]
    }

    Write-Output 'Regras estaticas da V0006 (RBAC 2024.1) validadas.'
} catch {
    [Console]::Error.WriteLine("Falha ao testar a V0006: $($_.Exception.Message)")
    exit 1
}

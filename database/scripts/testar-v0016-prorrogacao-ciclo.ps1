[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$MigrationPath,
    [Parameter(Mandatory = $true)][string]$SqlValidationPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
try {
    $migration = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $MigrationPath).Path)
    $validation = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $SqlValidationPath).Path)
    foreach ($required in @(
        'CREATE TABLE dbo.prorrogacao_ciclo_avaliacao',
        'encerramento_anterior_em_utc datetime2(7)',
        'novo_encerramento_em_utc datetime2(3)',
        'AFTER INSERT', 'AFTER UPDATE, DELETE',
        'COUNT_BIG(*) FROM inserted', 'UPDLOCK, HOLDLOCK',
        '@anterior <> @atual', '@novo <= SYSUTCDATETIME()',
        'TRIGGER_NESTLEVEL', "''AFTER'', ''DML''",
        'CICLO.PRORROGAR_ENCERRAMENTO',
        'novo.fuso_horario_iana', 'novo.autoavaliacao_habilitada',
        'novo.janela_abertura_em_utc', 'novo.aberto_por_usuario_id',
        'novo.encerrado_por_usuario_id', 'novo.criado_em_utc'
    )) {
        if (-not $migration.Contains($required)) { throw "Protecao V0016 ausente: $required" }
    }
    if ($migration -match '(?i)SESSION_CONTEXT|DISABLE\s+TRIGGER|DROP\s+|UPDATE\s+dbo\.avaliacao\b|ALTER\s+DATABASE') {
        throw 'A V0016 contem operacao fora da excecao autorizada.'
    }
    foreach ($required in @("WHERE version = N'V0016'", 'sys.foreign_keys', 'sys.triggers', 'is_disabled = 0', 'V0016_VALIDADA')) {
        if (-not $validation.Contains($required)) { throw "Validacao V0016 incompleta: $required" }
    }
    $missingVersion = $validation.Substring(0, $validation.IndexOf("IF OBJECT_ID"))
    if ($missingVersion -notmatch 'THROW\s+51213' -or $missingVersion -match '\bRETURN\s*;') {
        throw 'A validacao deve impedir publicacao quando V0016 ainda estiver pendente.'
    }
    Write-Output 'Regras estaticas V0016 de prorrogacao auditada aprovadas.'
} catch {
    [Console]::Error.WriteLine("Falha V0016: $($_.Exception.Message)")
    exit 1
}

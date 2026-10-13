[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$Arguments
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($null -eq $Arguments) { $Arguments = @() }
if ($Arguments.Count -gt 1 -or ($Arguments.Count -eq 1 -and $Arguments[0] -notin @('--publicar', '--check'))) {
    Write-Host '[Avaliacao PROD] Use iniciar-prod.bat [--publicar | --check | --subir | --start-prepared].'
    exit 2
}

# Probe without PM2 CLI, so permission failures never create a second daemon.
if ($Arguments.Count -eq 0 -or $Arguments[0] -ieq '--publicar') {
    . (Join-Path $PSScriptRoot 'production-launcher-access.ps1')
    $caller = Get-ProductionCaller
    & node (Join-Path $PSScriptRoot 'check-pm2-access.cjs') --require-existing --elevation-exit-code
    $decision = Get-ProductionAccessDecision -ProbeExitCode $LASTEXITCODE -Administrator $caller.Administrator
    if ($decision -eq 'ELEVATE') {
        $code = Invoke-ProductionElevation -CallerSid $caller.Sid
        exit $code
    }
    if ($decision -eq 'BLOCKED') {
        Write-Host '[Avaliacao PROD] PM2 existente indisponivel ou sem permissao mesmo apos elevacao. Publicacao interrompida antes do build.'
        exit 1
    }
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$environmentFile = Join-Path $repositoryRoot '.env'
$allowedNames = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::Ordinal
)

@(
    'AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG',
    'AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL',
    'AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY'
) | ForEach-Object { [void]$allowedNames.Add($_) }

function Remove-OptionalQuotes {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Value)

    $trimmedValue = $Value.Trim()
    if ($trimmedValue.Length -lt 2) {
        return $trimmedValue
    }

    $firstCharacter = $trimmedValue[0]
    $lastCharacter = $trimmedValue[$trimmedValue.Length - 1]
    if (
        ($firstCharacter -eq '"' -and $lastCharacter -eq '"') -or
        ($firstCharacter -eq "'" -and $lastCharacter -eq "'")
    ) {
        return $trimmedValue.Substring(1, $trimmedValue.Length - 2)
    }

    return $trimmedValue
}

if (Test-Path -LiteralPath $environmentFile -PathType Leaf) {
    $lineNumber = 0
    foreach ($line in [System.IO.File]::ReadLines($environmentFile)) {
        $lineNumber++
        $trimmedLine = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmedLine) -or $trimmedLine.StartsWith('#')) {
            continue
        }

        $match = [regex]::Match($trimmedLine, '^(?<name>[A-Z][A-Z0-9_]*)=(?<value>.*)$')
        if (-not $match.Success) {
            throw "Formato invalido em .env na linha $lineNumber. Use NOME=valor."
        }

        $name = $match.Groups['name'].Value
        if (-not $allowedNames.Contains($name)) {
            throw "A variavel $name nao e permitida no .env de producao."
        }

        $value = Remove-OptionalQuotes -Value $match.Groups['value'].Value
        if ($value.IndexOf([char]0) -ge 0) {
            throw "Valor invalido em .env na linha $lineNumber."
        }

        if (-not [string]::IsNullOrWhiteSpace($value)) {
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

. (Join-Path $PSScriptRoot 'select-production-java.ps1')
Select-ProductionJava
[Environment]::SetEnvironmentVariable('AVALIACAO_DESEMPENHO_ENV_LOADED', '1', 'Process')
# Emit native output as host records immediately, including inside a transcript.
& $env:ComSpec '/d' '/c' (Join-Path $repositoryRoot 'iniciar-prod.bat') @Arguments | ForEach-Object { Write-Host $_ }
exit $LASTEXITCODE

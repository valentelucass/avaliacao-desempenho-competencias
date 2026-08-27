[CmdletBinding()]
param(
    [string]$Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Path)) {
    $Path = Split-Path -Parent $PSScriptRoot
}

$repositoryRoot = (Resolve-Path -LiteralPath $Path).Path.TrimEnd('\', '/')
$excludedDirectoryNames = @('.git', '.idea', '.vscode', 'coverage', 'dist', 'node_modules', 'target')
$allowedExtensions = @(
    '.bat', '.cmd', '.css', '.editorconfig', '.gitattributes', '.gitignore', '.html', '.java', '.json',
    '.md', '.properties', '.ps1', '.sql', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml'
)
$maximumFileLength = 2MB

$rules = @(
    [pscustomobject]@{
        Name = 'chave privada PEM'
        Pattern = '(?m)-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----'
    },
    [pscustomobject]@{
        Name = 'chave de acesso AWS'
        Pattern = '\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'
    },
    [pscustomobject]@{
        Name = 'token GitHub'
        Pattern = '\bgh[pousr]_[A-Za-z0-9_]{30,255}\b'
    },
    [pscustomobject]@{
        Name = 'token GitLab'
        Pattern = '\bglpat-[A-Za-z0-9_-]{20,255}\b'
    },
    [pscustomobject]@{
        Name = 'token Slack'
        Pattern = '\bxox[baprs]-[A-Za-z0-9-]{10,255}\b'
    },
    [pscustomobject]@{
        Name = 'valor atribuido a campo sensivel'
        Pattern = '(?im)^\s*(?:set\s+)?[A-Za-z_][A-Za-z0-9_.-]*(?:password|senha|secret|token|api[_-]?key|access[_-]?key)[A-Za-z0-9_.-]*\s*(?:=|:)\s*(?!["'']?(?:<[^>]+>|TODO|CHANGE(?:_ME)?|EXAMPLE|YOUR_[A-Z_]*|%[A-Z0-9_]+%|\$env:[A-Za-z0-9_]+|NULL|NONE|UNDEFINED|FALSE|TRUE|(?:vi|jest)\.fn\(\)\.[A-Za-z]+)\b)(?:["''][^"''\r\n]{8,}["'']|[^\s#;]{12,})'
    }
)

function Test-ExcludedPath {
    param([string]$RelativePath)

    $segments = $RelativePath -split '[\\/]'
    if ($segments | Where-Object { $excludedDirectoryNames -contains $_ }) {
        return $true
    }

    $fileName = $segments[-1]
    if ($fileName -like '.env*' -or $fileName -like '*.local.bat') {
        return $true
    }

    return $false
}

$findings = [System.Collections.Generic.List[object]]::new()

foreach ($file in Get-ChildItem -LiteralPath $repositoryRoot -Recurse -Force -File) {
    $relativePath = $file.FullName.Substring($repositoryRoot.Length).TrimStart('\', '/')
    if ((Test-ExcludedPath $relativePath) -or $file.Length -gt $maximumFileLength) {
        continue
    }

    if ($allowedExtensions -notcontains $file.Extension.ToLowerInvariant()) {
        continue
    }

    try {
        $content = [System.IO.File]::ReadAllText($file.FullName)
    }
    catch {
        throw "Nao foi possivel ler o arquivo para verificar segredos: $relativePath"
    }

    foreach ($rule in $rules) {
        foreach ($match in [regex]::Matches($content, $rule.Pattern)) {
            $lineNumber = 1 + ([regex]::Matches($content.Substring(0, $match.Index), "`n")).Count
            $findings.Add([pscustomobject]@{
                    Path = $relativePath
                    Line = $lineNumber
                    Rule = $rule.Name
                })
        }
    }
}

if ($findings.Count -gt 0) {
    foreach ($finding in $findings) {
        Write-Error ("Possivel segredo em {0}:{1} ({2}). O conteudo nao foi exibido." -f $finding.Path, $finding.Line, $finding.Rule)
    }
    exit 1
}

Write-Output "Scanner de segredos concluido: nenhum padrao sensivel encontrado em $repositoryRoot."

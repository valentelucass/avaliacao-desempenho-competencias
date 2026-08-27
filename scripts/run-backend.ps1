[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$ValidateOnly,
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$ApplicationArguments
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-NativeCommandOutput {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,
        [Parameter(Mandatory)]
        [string]$Arguments
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
    $startInfo.Arguments = $Arguments
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo

    if (-not $process.Start()) {
        throw "Não foi possível iniciar o comando: $Executable"
    }

    $standardOutput = $process.StandardOutput.ReadToEnd()
    $standardError = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        $output = ($standardOutput + [Environment]::NewLine + $standardError).Trim()
        throw "O comando falhou com código $($process.ExitCode): $Executable $Arguments`n$output"
    }

    return ($standardOutput + [Environment]::NewLine + $standardError).Trim()
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backendDirectory = Join-Path $repositoryRoot 'backend'
$javaHome = $env:JAVA_HOME

if ([string]::IsNullOrWhiteSpace($javaHome)) {
    throw 'JAVA_HOME não está definido. Configure-o para um JDK 21 ou superior.'
}

$javaExecutable = Join-Path $javaHome 'bin\java.exe'
if (-not (Test-Path -LiteralPath $javaExecutable)) {
    throw "JAVA_HOME não aponta para um JDK com java.exe: $javaHome"
}

$versionOutput = Get-NativeCommandOutput -Executable $javaExecutable -Arguments '-version'
$versionLine = ($versionOutput -split "`r?`n" | Where-Object { $_ -match '"\d+' } | Select-Object -First 1)
$versionMatch = if ([string]::IsNullOrWhiteSpace($versionLine)) {
    $null
}
else {
    [regex]::Match($versionLine, '"(?<major>\d+)')
}
if ($null -eq $versionMatch -or -not $versionMatch.Success) {
    throw "Não foi possível identificar a versão do Java em: $versionLine"
}

$javaMajorVersion = [int]$versionMatch.Groups['major'].Value
if ($javaMajorVersion -lt 21) {
    throw "O JDK em JAVA_HOME deve ser 21 ou superior; versão identificada: $javaMajorVersion"
}

Write-Output "JDK validado: $versionLine"

if ($ValidateOnly) {
    exit 0
}

Push-Location $backendDirectory
try {
    if (-not $SkipBuild) {
        & .\mvnw.cmd package
        if ($LASTEXITCODE -ne 0) {
            throw 'Falha ao empacotar o back-end.'
        }
    }

    $artifacts = @(Get-ChildItem -LiteralPath 'target' -Filter 'avaliacao-desempenho-api-*.jar' -File |
            Where-Object { $_.Name -notlike '*.original' })

    if ($artifacts.Count -ne 1) {
        throw 'Artefato da API não encontrado ou ambíguo. Execute o build sem -SkipBuild.'
    }

    & $javaExecutable -jar $artifacts[0].FullName @ApplicationArguments
}
finally {
    Pop-Location
}

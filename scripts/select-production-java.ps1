Set-StrictMode -Version Latest

function Get-LauncherJavaMajorVersion {
    param([string]$JavaExecutable)
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $JavaExecutable
    $startInfo.Arguments = '-version'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.RedirectStandardOutput = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        [void]$process.Start()
        $version = $process.StandardError.ReadToEnd() + $process.StandardOutput.ReadToEnd()
        $process.WaitForExit()
        $match = [regex]::Match($version, 'version\s+"(?<major>\d+)')
        if ($process.ExitCode -ne 0 -or -not $match.Success) { return 0 }
        return [int]$match.Groups['major'].Value
    } finally { $process.Dispose() }
}

function Select-ProductionJava {
    param([ValidateSet('PROD', 'DEV')][string]$Mode = 'PROD')
    $candidates = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
        $candidates.Add($env:JAVA_HOME)
    }
    foreach ($root in @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium'),
        (Join-Path $env:ProgramFiles 'Eclipse Adoptium'),
        (Join-Path $env:ProgramFiles 'Java')
    )) {
        if (Test-Path -LiteralPath $root -PathType Container) {
            foreach ($directory in Get-ChildItem -LiteralPath $root -Directory | Sort-Object Name -Descending) {
                $candidates.Add($directory.FullName)
            }
        }
    }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        $java = Join-Path $candidate 'bin\java.exe'
        $javac = Join-Path $candidate 'bin\javac.exe'
        if (-not (Test-Path -LiteralPath $java -PathType Leaf) -or
            -not (Test-Path -LiteralPath $javac -PathType Leaf)) { continue }
        $major = Get-LauncherJavaMajorVersion -JavaExecutable $java
        if ($major -lt 21 -or $major -ge 26) { continue }
        $env:JAVA_HOME = $candidate
        $env:PATH = (Join-Path $candidate 'bin') + ';' + $env:PATH
        Write-Host "[Avaliacao $Mode] JDK selecionado para este processo: $candidate"
        return
    }
    throw 'Nenhum JDK de 21 a 25 foi encontrado. Instale um JDK compativel ou defina JAVA_HOME para ele.'
}

Set-StrictMode -Version Latest

function Select-ProductionJava {
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
        $startInfo = [Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $java
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
            if ($process.ExitCode -ne 0 -or -not $match.Success -or
                [int]$match.Groups['major'].Value -lt 21 -or
                [int]$match.Groups['major'].Value -ge 26) { continue }
            $env:JAVA_HOME = $candidate
            $env:PATH = (Join-Path $candidate 'bin') + ';' + $env:PATH
            Write-Output "[Avaliacao PROD] JDK selecionado para este processo: $candidate"
            return
        } finally { $process.Dispose() }
    }
    throw 'Nenhum JDK 21 ou superior foi encontrado. Defina JAVA_HOME para um JDK compativel.'
}

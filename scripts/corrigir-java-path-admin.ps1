[CmdletBinding()]
param(
    [string]$JdkHome = 'C:\Program Files\Eclipse Adoptium\jdk-25.0.2.10-hotspot',
    [string]$RestoreBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)

    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Abra o PowerShell como Administrador e execute este script novamente.'
    }
}

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
        throw "Nao foi possivel iniciar o comando: $Executable"
    }

    $standardOutput = $process.StandardOutput.ReadToEnd()
    $standardError = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        $output = ($standardOutput + [Environment]::NewLine + $standardError).Trim()
        throw "O comando falhou com codigo $($process.ExitCode): $Executable $Arguments`n$output"
    }

    return ($standardOutput + [Environment]::NewLine + $standardError).Trim()
}

function Broadcast-EnvironmentChange {
    if ($null -eq ('EnvironmentChangeNotifier' -as [type])) {
        Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class EnvironmentChangeNotifier
{
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        uint message,
        IntPtr wParam,
        string lParam,
        uint flags,
        uint timeout,
        out IntPtr result);
}
'@
    }

    $result = [IntPtr]::Zero
    [void][EnvironmentChangeNotifier]::SendMessageTimeout(
        [IntPtr]0xffff,
        0x001a,
        [IntPtr]::Zero,
        'Environment',
        0x0002,
        5000,
        [ref]$result
    )
}

function Set-MachineJavaConfiguration {
    param(
        [Parameter(Mandatory)]
        [string]$JavaHome,
        [Parameter(Mandatory)]
        [string]$MachinePath
    )

    [Environment]::SetEnvironmentVariable('JAVA_HOME', $JavaHome, 'Machine')
    [Environment]::SetEnvironmentVariable('Path', $MachinePath, 'Machine')
    Broadcast-EnvironmentChange
}

function Get-NormalizedMachinePath {
    param(
        [AllowEmptyString()]
        [string]$CurrentPath,
        [Parameter(Mandatory)]
        [string]$PreferredJavaBin
    )

    $removedOracleEntries = @(
        'C:\Program Files (x86)\Common Files\Oracle\Java\java8path',
        'C:\Program Files (x86)\Common Files\Oracle\Java\javapath'
    )

    $result = [System.Collections.Generic.List[string]]::new()
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $result.Add($PreferredJavaBin)
    [void]$seen.Add($PreferredJavaBin.TrimEnd('\'))

    foreach ($entry in @($CurrentPath -split ';')) {
        if ([string]::IsNullOrWhiteSpace($entry)) {
            continue
        }

        $normalizedEntry = $entry.TrimEnd('\')
        if ($removedOracleEntries -contains $normalizedEntry) {
            continue
        }

        if ($seen.Add($normalizedEntry)) {
            $result.Add($entry)
        }
    }

    return ($result -join ';')
}

function Restore-MachineJavaConfiguration {
    param(
        [Parameter(Mandatory)]
        [string]$BackupPath
    )

    if (-not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) {
        throw "Backup nao encontrado: $BackupPath"
    }

    $backup = Import-Clixml -LiteralPath $BackupPath
    if ([string]::IsNullOrWhiteSpace($backup.MachinePath)) {
        throw 'O backup nao contem um PATH de maquina valido.'
    }

    Set-MachineJavaConfiguration -JavaHome $backup.MachineJavaHome -MachinePath $backup.MachinePath
    Write-Output 'Configuracao Java da maquina restaurada. Abra um novo terminal antes de validar.'
}

Assert-Administrator

if (-not [string]::IsNullOrWhiteSpace($RestoreBackup)) {
    Restore-MachineJavaConfiguration -BackupPath $RestoreBackup
    exit 0
}

$javaExecutable = Join-Path $JdkHome 'bin\java.exe'
$javacExecutable = Join-Path $JdkHome 'bin\javac.exe'
if (-not (Test-Path -LiteralPath $javaExecutable -PathType Leaf) -or -not (Test-Path -LiteralPath $javacExecutable -PathType Leaf)) {
    throw "O JDK informado nao possui java.exe e javac.exe: $JdkHome"
}

$versionOutput = Get-NativeCommandOutput -Executable $javaExecutable -Arguments '-version'
$versionLine = ($versionOutput -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
if ($versionLine -notmatch '"(?<major>\d+)') {
    throw "Nao foi possivel identificar a versao do JDK: $versionLine"
}

if ([int]$matches.major -lt 21) {
    throw "O JDK informado deve ser 21 ou superior; versao encontrada: $($matches.major)"
}

$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
if ([string]::IsNullOrWhiteSpace($machinePath)) {
    throw 'O PATH da maquina esta vazio; a correcao foi interrompida para nao remover configuracoes existentes.'
}

$backupDirectory = Join-Path $env:LOCALAPPDATA 'AvaliacaoDesempenho\java-path-backups'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$backupPath = Join-Path $backupDirectory ("machine-java-before-{0:yyyyMMdd-HHmmss}.clixml" -f (Get-Date))

[pscustomobject]@{
    CreatedAt       = (Get-Date).ToString('o')
    MachineJavaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine')
    MachinePath     = $machinePath
} | Export-Clixml -LiteralPath $backupPath

$jdkBin = Join-Path $JdkHome 'bin'
$normalizedMachinePath = Get-NormalizedMachinePath -CurrentPath $machinePath -PreferredJavaBin $jdkBin
Set-MachineJavaConfiguration -JavaHome $JdkHome -MachinePath $normalizedMachinePath

$env:JAVA_HOME = $JdkHome
$env:Path = "$jdkBin;$env:Path"

Write-Output "JDK da maquina padronizado: $versionLine"
Write-Output "Backup para restauracao: $backupPath"
Write-Output 'Feche e abra um novo terminal e valide com: java -version; javac -version; mvn -v'

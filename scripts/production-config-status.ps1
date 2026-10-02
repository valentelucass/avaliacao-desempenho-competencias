Set-StrictMode -Version Latest

function Test-ProductionConfigurationIncomplete {
    param([Parameter(Mandatory)][string]$Path)
    $markerBytes = [Text.Encoding]::ASCII.GetBytes('#ADC_CONFIGURATION_INCOMPLETE')
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        # Read only the marker bytes, never the credential properties that follow.
        foreach ($expectedByte in $markerBytes) {
            if ($stream.ReadByte() -ne $expectedByte) { return $false }
        }
        return $stream.ReadByte() -in @(-1, 10, 13)
    } finally { $stream.Dispose() }
}

#requires -Version 7.0
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = 'https://localhost:5181/api/v1'
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$authenticated = $false
$checks = 0

function Assert-Filter {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Invoke-FilterApi {
    param([string]$Path, [string]$Method = 'GET', [object]$Body, [int]$Expected = 200)
    $request = @{
        Uri = "$apiRoot$Path"; Method = $Method; WebSession = $session
        SkipCertificateCheck = $true; SkipHttpErrorCheck = $true
        MaximumRedirection = 0; TimeoutSec = 30
    }
    try {
        if ($Method -ne 'GET') {
            $csrf = Invoke-WebRequest -Uri "$apiRoot/auth/csrf" -WebSession $session `
                -SkipCertificateCheck -MaximumRedirection 0 -TimeoutSec 30
            $request.Headers = @{ 'X-CSRF-TOKEN' = ($csrf.Content | ConvertFrom-Json).token }
        }
        if ($null -ne $Body) {
            $request.ContentType = 'application/json'
            $request.Body = $Body | ConvertTo-Json -Compress
        }
        $response = Invoke-WebRequest @request
    }
    catch { throw 'Falha de transporte no ensaio DEV; detalhes da requisicao omitidos.' }
    Assert-Filter ([int]$response.StatusCode -eq $Expected) `
        "Status HTTP inesperado no ensaio DEV: $([int]$response.StatusCode), esperado $Expected."
    if ($Expected -eq 200) { return ($response.Content | ConvertFrom-Json) }
}

function Read-FilteredPage {
    param([hashtable]$Filters, [string]$Cursor)
    $parameters = @("cycleId=$cycleId", 'limit=2')
    foreach ($key in $Filters.Keys) {
        $parameters += $key + '=' + [uri]::EscapeDataString([string]$Filters[$key])
    }
    if ($Cursor) { $parameters += 'cursor=' + [uri]::EscapeDataString($Cursor) }
    return Invoke-FilterApi -Path ('/assessments?' + ($parameters -join '&'))
}

function Test-FilterResult {
    param([string]$Name, [hashtable]$Filters, [object[]]$ExpectedRows)
    $actualIds = [System.Collections.Generic.List[string]]::new()
    $seenCursors = [System.Collections.Generic.HashSet[string]]::new()
    $cursor = $null
    do {
        $page = Read-FilteredPage -Filters $Filters -Cursor $cursor
        Assert-Filter (@($page.items).Count -le 2) 'A API desrespeitou o limite da pagina.'
        foreach ($item in $page.items) { $actualIds.Add(([guid]$item.id).ToString('D')) }
        $cursor = $page.page.nextCursor
        if ($cursor) {
            Assert-Filter ($seenCursors.Add($cursor)) 'A API repetiu o cursor da pagina.'
            Assert-Filter ($seenCursors.Count -le 100) 'Limite de paginas do ensaio excedido.'
        }
    } while ($cursor)
    $expectedIds = @($ExpectedRows | ForEach-Object { ([guid]$_.id).ToString('D') } | Sort-Object)
    $receivedIds = @($actualIds | Sort-Object)
    Assert-Filter (($expectedIds -join ',') -ceq ($receivedIds -join ',')) `
        "Filtro incorreto: $Name. A API diverge da massa ficticia DEV ($($expectedIds.Count) esperados, $($receivedIds.Count) recebidos); registros omitidos."
    $script:checks++
    Write-Output "OK: $Name (todas as paginas)."
}

# Alvos fixos: processo DEV deste repositorio e somente o ciclo ficticio existente.
$listenerIds = @(Get-NetTCPConnection -State Listen -LocalPort 5181 -ErrorAction Stop |
    Select-Object -ExpandProperty OwningProcess -Unique)
Assert-Filter ($listenerIds.Count -eq 1) 'A API DEV precisa estar em execucao na porta 5181.'
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listenerIds[0])"
$releasePrefix = Join-Path $repositoryRoot 'backend\target\dev-local-releases\'
Assert-Filter ($process.Name -ieq 'java.exe' -and $process.CommandLine -like "*$releasePrefix*.jar*") `
    'O processo da porta 5181 nao e a API DEV esperada; ensaio cancelado.'

$fixtureSql = @'
SET NOCOUNT ON;
IF DB_NAME() <> N'AVALIACAO_DEV' THROW 51360, N'Alvo invalido', 1;
SELECT CONVERT(varchar(36), assessment.avaliacao_id) AS id,
       CONVERT(varchar(36), assessment.ciclo_avaliacao_id) AS cycleId,
       collaborator.nome_exibicao AS evaluatedName,
       evaluator.nome_exibicao AS managerName,
       assessment.tipo_avaliacao AS type,
       assessment.situacao AS status,
       COALESCE(feedback.situacao,
           CASE WHEN assessment.situacao = 'PUBLICADA' AND assessment.tipo_avaliacao <> 'AUTOAVALIACAO'
                THEN 'PENDENTE' ELSE 'NAO_APLICAVEL' END) AS feedbackStatus
FROM dbo.avaliacao AS assessment
JOIN dbo.ciclo_avaliacao AS cycle ON cycle.ciclo_avaliacao_id = assessment.ciclo_avaliacao_id
JOIN dbo.colaborador AS collaborator ON collaborator.colaborador_id = assessment.colaborador_id
JOIN dbo.usuario AS evaluator ON evaluator.usuario_id = assessment.avaliador_usuario_id
JOIN dbo.versao_avaliacao AS version
  ON version.avaliacao_id = assessment.avaliacao_id AND version.numero = assessment.versao_atual_numero
LEFT JOIN dbo.feedback_avaliacao AS feedback ON feedback.versao_avaliacao_id = version.versao_avaliacao_id
WHERE cycle.codigo = N'DEV-COMPLETO-FLUXOS'
FOR JSON PATH;
'@
$queryOutput = & sqlcmd -S 'localhost,1433' -E -N -C -d AVALIACAO_DEV -b -r 1 -f 65001 -y 0 -Q $fixtureSql 2>&1
Assert-Filter ($LASTEXITCODE -eq 0) 'Falha ao ler a massa ficticia DEV; saida SQL omitida.'
# FOR JSON pode dividir o documento entre linhas do sqlcmd, inclusive dentro de uma chave.
$rows = @(($queryOutput -join '') | ConvertFrom-Json)
Assert-Filter ($rows.Count -gt 2) 'O ensaio exige a massa ficticia DEV-COMPLETO-FLUXOS existente.'
$cycleIds = @($rows.cycleId | Select-Object -Unique)
Assert-Filter ($cycleIds.Count -eq 1) 'Ciclo ficticio ambiguo.'
$cycleId = $cycleIds[0]
$credential = @(Import-Csv -LiteralPath (Join-Path $repositoryRoot 'secrets\contas-teste-dev.csv') |
    Where-Object Login -CEQ 'teste.rh@avaliacao.test')
Assert-Filter ($credential.Count -eq 1) 'A conta ficticia RH existente e necessaria para o ensaio.'

try {
    $null = Invoke-FilterApi -Path '/auth/sessions' -Method POST -Expected 204 `
        -Body @{ login = $credential[0].Login; password = $credential[0].Senha }
    $authenticated = $true
    Test-FilterResult 'sem filtros / limpar' @{} $rows
    $name = $rows[0].evaluatedName
    Test-FilterResult 'nome do colaborador isolado' @{ evaluatedName = "  $name  " } `
        @($rows | Where-Object evaluatedName -EQ $name)
    $namePart = $name.Substring(0, [Math]::Max(1, $name.Length - 2))
    $comparison = [Globalization.CompareOptions]::IgnoreCase -bor [Globalization.CompareOptions]::IgnoreNonSpace
    $comparer = [Globalization.CultureInfo]::InvariantCulture.CompareInfo
    Test-FilterResult 'trecho do nome do colaborador' @{ evaluatedName = $namePart.ToLowerInvariant() } `
        @($rows | Where-Object { $comparer.IndexOf($_.evaluatedName, $namePart, $comparison) -ge 0 })
    $managers = @($rows | Where-Object type -NE 'AUTOAVALIACAO' |
        Select-Object -ExpandProperty managerName -Unique)
    Assert-Filter ($managers.Count -ge 2) 'O ensaio exige ao menos dois avaliadores ficticios.'
    foreach ($manager in $managers) {
        Test-FilterResult 'nome do gestor isolado' @{ managerName = $manager } `
            @($rows | Where-Object { $_.type -ne 'AUTOAVALIACAO' -and $_.managerName -eq $manager })
    }
    $managerPart = $managers[0].Substring(0, [Math]::Max(1, $managers[0].Length - 2))
    Test-FilterResult 'trecho do nome do gestor' @{ managerName = $managerPart.ToLowerInvariant() } `
        @($rows | Where-Object {
            $_.type -ne 'AUTOAVALIACAO' -and $comparer.IndexOf($_.managerName, $managerPart, $comparison) -ge 0
        })
    foreach ($field in @('evaluatedName', 'managerName')) {
        Test-FilterResult "$field inexistente" @{ $field = 'ADC-AUSENTE-' + [guid]::NewGuid().ToString('N') } @()
    }
    foreach ($status in @('RASCUNHO', 'ENVIADA', 'PUBLICADA')) {
        Test-FilterResult "avaliacao $status" @{ status = $status } @($rows | Where-Object status -EQ $status)
    }
    foreach ($status in @('PENDENTE', 'CONCLUIDO', 'NAO_APLICAVEL')) {
        Test-FilterResult "feedback $status" @{ feedbackStatus = $status } @($rows | Where-Object feedbackStatus -EQ $status)
    }
    $combined = @($rows | Where-Object { $_.type -ne 'AUTOAVALIACAO' -and $_.status -eq 'PUBLICADA' })[0]
    Test-FilterResult 'quatro campos combinados por E' @{
        evaluatedName = $combined.evaluatedName; managerName = $combined.managerName
        status = $combined.status; feedbackStatus = $combined.feedbackStatus
    } @($rows | Where-Object {
        $_.type -ne 'AUTOAVALIACAO' -and $_.evaluatedName -eq $combined.evaluatedName -and
        $_.managerName -eq $combined.managerName -and $_.status -eq $combined.status -and
        $_.feedbackStatus -eq $combined.feedbackStatus
    })
    Test-FilterResult 'combinacao sem correspondencia' @{ status = 'RASCUNHO'; feedbackStatus = 'CONCLUIDO' } @()
    foreach ($field in @('status', 'feedbackStatus')) {
        $null = Invoke-FilterApi -Path "/assessments?$field=INVALIDO" -Expected 422
        $checks++
    }
    Write-Output "Filtros DEV aprovados: $checks cenarios; consultas sem editar avaliacoes ou cadastros."
}
finally {
    if ($authenticated) {
        $null = Invoke-FilterApi -Path '/auth/sessions/current' -Method DELETE -Expected 204
    }
    $credential = $null
    $session = $null
}

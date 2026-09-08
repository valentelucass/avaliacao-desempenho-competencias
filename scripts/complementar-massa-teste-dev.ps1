[CmdletBinding()]
param([switch]$Populate, [switch]$Validate)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sqlServer = 'localhost,1433'
$database = 'AVALIACAO_DEV'
$apiTarget = 'https://localhost:5181/api/v1'
$credentialsFile = Join-Path $repositoryRoot 'secrets\contas-teste-dev.csv'
$adminFile = Join-Path $repositoryRoot 'secrets\conta-admin-teste-dev.csv'
$seedFile = Join-Path $repositoryRoot 'database\sql\manual\013_complementar_massa_teste_dev.sql'
$sessions = @{}
if ($Populate -and $Validate) { throw 'Use Populate ou Validate, nao ambos.' }

function Assert-Dev {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Invoke-DevQuery {
    param([string]$Query)
    $queryText = "SET NOCOUNT ON; IF DB_NAME() <> N'AVALIACAO_DEV' THROW 51360, N'Alvo invalido', 1; " + $Query
    $lines = & sqlcmd -S $sqlServer -E -N -C -d $database -b -r 1 -f 65001 -y 0 -Q $queryText 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Falha na consulta controlada de DEV; saida SQL nao exposta.' }
    return (($lines | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
}

function Invoke-DevApi {
    param([string]$Profile,[string]$Method,[string]$Path,[object]$Body,[int[]]$Expected=@(200),[string]$Key,[string]$Revision)
    $session = $sessions[$Profile]
    $headers = @{}
    if ($Method -ne 'GET') {
        $csrf = Invoke-WebRequest -Uri "$apiTarget/auth/csrf" -WebSession $session -SkipCertificateCheck
        $headers['X-CSRF-TOKEN'] = ($csrf.Content | ConvertFrom-Json).token
    }
    if ($Key) { $headers['Idempotency-Key'] = "ADC-DEV-002-$Key" }
    if ($Revision) { $headers['If-Match'] = '"' + $Revision.Trim('"') + '"' }
    $request = @{Uri="$apiTarget$Path";Method=$Method;WebSession=$session;Headers=$headers;SkipCertificateCheck=$true;SkipHttpErrorCheck=$true}
    if ($null -ne $Body) { $request.ContentType='application/json'; $request.Body=$Body | ConvertTo-Json -Depth 14 -Compress }
    $response = Invoke-WebRequest @request
    if ([int]$response.StatusCode -notin $Expected) { throw "Status inesperado $([int]$response.StatusCode) em $Method $Path." }
    if ($response.Content) {
        $content = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
        if ([string]$response.Headers['Content-Type'] -match 'json') { return ($content | ConvertFrom-Json) }
        return $content
    }
}

function New-RandomPassword {
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return 'A!' + [Convert]::ToBase64String($bytes).Replace('+', 'x').Replace('/', 'y').Replace('=', 'z')
    }
    finally {
        $rng.Dispose()
    }
}

function New-BcryptHash {
    param([Parameter(Mandatory)][string]$PlainText)

    $jshell = Get-Command jshell.exe -ErrorAction SilentlyContinue
    if ($null -eq $jshell) {
        throw 'jshell não está disponível para criar as credenciais fictícias.'
    }

    $cryptoJar = Get-ChildItem -Path (Join-Path $env:USERPROFILE '.m2\repository\org\springframework\security\spring-security-crypto') `
        -Recurse -Filter 'spring-security-crypto-*.jar' -File -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($null -eq $cryptoJar) {
        throw 'A biblioteca BCrypt do projeto não está disponível no repositório Maven local.'
    }

    $previousPassword = [Environment]::GetEnvironmentVariable('ADC_DEV_TEST_PASSWORD', 'Process')
    try {
        [Environment]::SetEnvironmentVariable('ADC_DEV_TEST_PASSWORD', $PlainText, 'Process')
        $input = @(
            'import org.springframework.security.crypto.bcrypt.BCrypt;',
            'System.out.println(BCrypt.hashpw(System.getenv("ADC_DEV_TEST_PASSWORD"), BCrypt.gensalt(12)));',
            '/exit'
        ) -join [Environment]::NewLine
        $output = $input | & $jshell.Source --class-path $cryptoJar.FullName -q 2>$null
        $match = [regex]::Match(($output -join [Environment]::NewLine), '\$2[aby]\$12\$[./A-Za-z0-9]{53}')
        if (-not $match.Success) {
            throw 'Não foi possível gerar um hash BCrypt para as contas fictícias.'
        }
        return $match.Value
    }
    finally {
        [Environment]::SetEnvironmentVariable('ADC_DEV_TEST_PASSWORD', $previousPassword, 'Process')
    }
}



function Ensure-AdminCredential {
    if (Test-Path -LiteralPath $adminFile) {
        $rows = @(Import-Csv -LiteralPath $adminFile)
        Assert-Dev ($rows.Count -eq 1 -and $rows[0].Login -ceq 'teste.admin@avaliacao.test') 'Credencial ficticia inesperada.'
        return $rows[0]
    }
    $password = New-RandomPassword
    New-Item -ItemType File -Path $adminFile -ErrorAction Stop | Out-Null
    $acl = [Security.AccessControl.FileSecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().Name,'FullControl','Allow'))
    Set-Acl -LiteralPath $adminFile -AclObject $acl
    $credential = [PSCustomObject]@{Perfil='Administrador tecnico';Login='teste.admin@avaliacao.test';Senha=$password}
    $credential | Export-Csv -LiteralPath $adminFile -NoTypeInformation -Encoding utf8
    return $credential
}

function Prepare-Assessment {
    param([string]$Profile,[string]$CycleId,[string]$Type,[string]$PersonId,[int]$Ordinal,[string]$Target,[string]$Prefix)
    $body = @{type=$Type;cycleId=$CycleId}
    if ($Type -ne 'AUTOAVALIACAO') { $body.collaboratorId=$PersonId }
    $detail = Invoke-DevApi -Profile $Profile -Method POST -Path '/assessments' -Body $body -Expected @(201) -Key "$Prefix-create"
    if ($detail.status -eq 'RASCUNHO' -and -not ($Target -eq 'REABERTA' -and $detail.comment -eq 'Massa ficticia DEV COMPLETO - reaberta')) {
        Assert-Dev ($detail.allowedActions.edit -and $detail.allowedActions.submit) 'Autor sem acoes de edicao/envio.'
        Assert-Dev ([string]::IsNullOrEmpty($detail.comment) -or $detail.comment.StartsWith('Massa ficticia DEV COMPLETO')) 'Rascunho alterado manualmente; nao sera sobrescrito.'
        $answers = @()
        $index = 0
        foreach ($competency in $detail.questionnaire.competencies) {
            foreach ($question in $competency.questions) {
                $points = if ($Ordinal -le 5) {70+10*$Ordinal} else {80+10*($index%5)}
                $option = @($question.options | Where-Object points -eq $points)[0]
                $answers += @{questionId=$question.id;optionId=$option.id}
                $index++
            }
        }
        if ($Target -eq 'RASCUNHO') { $answers=@($answers | Select-Object -First 3) }
        $detail = Invoke-DevApi -Profile $Profile -Method PATCH -Path "/assessments/$($detail.id)" -Revision $detail.revision -Body @{answers=$answers;comment='Massa ficticia DEV COMPLETO - preenchimento para testes'}
        if ($Target -eq 'RASCUNHO') { return $detail }
        $detail = Invoke-DevApi -Profile $Profile -Method POST -Path "/assessments/$($detail.id)/submit" -Revision $detail.revision -Key "$Prefix-submit"
    }
    if ($Target -eq 'ENVIADA') { return $detail }
    if ($detail.status -eq 'ENVIADA') { $detail=Invoke-DevApi -Profile RH -Method POST -Path "/assessments/$($detail.id)/publish" -Key "$Prefix-publish" }
    if ($Target -eq 'FEEDBACK' -and $detail.feedbackStatus -eq 'PENDENTE') {
        $own=Invoke-DevApi -Profile $Profile -Method GET -Path "/assessments/$($detail.id)"
        Assert-Dev ([bool]$own.allowedActions.completeFeedback) 'Autor sem acao de feedback.'
        $detail=Invoke-DevApi -Profile $Profile -Method POST -Path "/assessments/$($detail.id)/feedback" -Key "$Prefix-feedback" -Body @{feedbackDate=(Get-Date -Format 'yyyy-MM-dd');comment='Feedback ficticio DEV COMPLETO: conversa registrada para teste.'}
    }
    if ($Target -eq 'REABERTA' -and $detail.status -eq 'PUBLICADA') {
        $detail=Invoke-DevApi -Profile RH -Method POST -Path "/assessments/$($detail.id)/reopen" -Key "$Prefix-reopen" -Body @{reason='Reabertura ficticia DEV COMPLETO para testar preservacao do historico.'}
        $detail=Invoke-DevApi -Profile $Profile -Method PATCH -Path "/assessments/$($detail.id)" -Revision $detail.revision -Body @{answers=@($detail.answers);comment='Massa ficticia DEV COMPLETO - reaberta'}
    }
    return $detail
}

function Assert-SeedReadiness {
    $cycleRows = Invoke-DevQuery "SELECT codigo,CONVERT(varchar(36),ciclo_avaliacao_id) AS id FROM dbo.ciclo_avaliacao WHERE codigo LIKE 'DEV-COMPLETO-%' FOR JSON PATH;" | ConvertFrom-Json
    $freeId = @($cycleRows | Where-Object codigo -eq 'DEV-COMPLETO-LIVRE')[0].id
    $flowId = @($cycleRows | Where-Object codigo -eq 'DEV-COMPLETO-FLUXOS')[0].id
    foreach ($profile in @('RH', 'Gestor')) {
        $options = Invoke-DevApi -Profile $profile -Method GET -Path "/assessments/creation-options?cycleId=$freeId"
        Assert-Dev (@($options.collaborators).Count -eq 8) 'Ciclo LIVRE deve oferecer oito pessoas por equipe na massa inicial.'
    }
    $directorOptions = Invoke-DevApi -Profile Diretoria -Method GET -Path "/assessments/director-creation-options?cycleId=$freeId"
    Assert-Dev (@($directorOptions.collaborators).Count -eq 2) 'Ciclo LIVRE deve oferecer duas gerencias na massa inicial.'
    $indicator = Invoke-DevApi -Profile RH -Method GET -Path "/indicators?cycleId=$flowId&metric=FINAL_SCORE_AVERAGE"
    Assert-Dev ($indicator.availability -eq 'AVAILABLE' -and $indicator.averageScore -eq 100) 'Media agregada ficticia deveria ser 100.'
    $smallBranch = Invoke-DevQuery "SELECT CONVERT(varchar(36),filial_id) FROM dbo.filial WHERE nome=N'DEV COMPLETO - Filial grupo pequeno';"
    $suppressed = Invoke-DevApi -Profile RH -Method GET -Path "/indicators?cycleId=$flowId&metric=FINAL_SCORE_AVERAGE&branchId=$smallBranch"
    Assert-Dev ($suppressed.availability -eq 'INSUFFICIENT_DATA') 'Grupo pequeno deveria ser suprimido.'
    Assert-Dev (($suppressed | ConvertTo-Json -Compress) -notmatch '(?i)averageScore|classificationDistribution|count') 'Supressao nao pode revelar numeros.'
    $options = Invoke-DevApi -Profile RH -Method GET -Path "/indicators/options?cycleId=$flowId"
    Assert-Dev (@($options.branches | Where-Object id -eq $smallBranch).Count -eq 0) 'Grupo pequeno nao pode constar nas opcoes.'
    $csv = Invoke-DevApi -Profile RH -Method POST -Path '/indicators/exports' -Body @{cycleId=$flowId;metric='FINAL_SCORE_AVERAGE'}
    Assert-Dev ($csv -match '^metric,value' -and $csv -notmatch '(?i)collaborator|colaborador|cycleId') 'Exportacao deve conter somente o agregado autorizado.'
    Write-Host 'Massa inicial validada: equipes RH/Gestor/Diretoria disponiveis, indicador 100, grupo pequeno suprimido e CSV agregado.'
}

try {
    $baseExists=(Invoke-DevQuery "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE acao='DADOS_TESTE.PREPARAR_MASSA_COMPLETA' AND request_id='ADC-DEV-002';") -eq '1'
    $completed=(Invoke-DevQuery "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE acao='DADOS_TESTE.COMPLETAR_JORNADAS' AND request_id='ADC-DEV-002';") -eq '1'
    if ((-not $Populate -and -not $Validate) -or ($completed -and -not $Validate)) {
        Write-Host "Alvo AVALIACAO_DEV. Massa base: $baseExists. Jornadas preenchidas: $completed. Nenhum dado alterado."
        exit 0
    }
    Assert-Dev (Test-Path -LiteralPath $credentialsFile) 'Credenciais ficticias existentes necessarias.'
    foreach ($file in @('secrets/contas-teste-dev.csv','secrets/conta-admin-teste-dev.csv')) {
        & git -C $repositoryRoot check-ignore --quiet $file
        Assert-Dev ($LASTEXITCODE -eq 0) 'Credenciais precisam estar ignoradas pelo Git.'
    }
    $listener=@(Get-NetTCPConnection -State Listen -LocalPort 5181 -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
    Assert-Dev ($listener.Count -eq 1) 'API DEV nao identificada.'
    $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener[0])"
    $artifactPrefix=Join-Path $repositoryRoot 'backend\target\dev-local-releases\'
    Assert-Dev ($process.Name -ieq 'java.exe' -and $process.CommandLine.Contains($artifactPrefix)) 'A carga exige o launcher DEV deste repositorio.'
    if ($Validate) {
        Assert-Dev $completed 'A carga deve estar concluida antes de validar a massa inicial.'
        Assert-Dev (Test-Path -LiteralPath $adminFile) 'Credencial tecnica ficticia ausente.'
        $adminCredential=@(Import-Csv -LiteralPath $adminFile)[0]
    } else { $adminCredential=Ensure-AdminCredential }
    # O SQL idempotente tambem completa o cenario historico em uma retomada.
    if (-not $completed) {
        $previousHash=[Environment]::GetEnvironmentVariable('ADC_DEV_ADMIN_BCRYPT_HASH','Process')
        try {
            [Environment]::SetEnvironmentVariable('ADC_DEV_ADMIN_BCRYPT_HASH',(New-BcryptHash $adminCredential.Senha),'Process')
            $output=& sqlcmd -S $sqlServer -E -N -C -d $database -b -r 1 -f 65001 -i $seedFile 2>&1
            if ($LASTEXITCODE -ne 0) { throw 'A carga base falhou e foi revertida; credencial local preservada para retomada.' }
        } finally { [Environment]::SetEnvironmentVariable('ADC_DEV_ADMIN_BCRYPT_HASH',$previousHash,'Process') }
    }
    $credentials=@(Import-Csv -LiteralPath $credentialsFile)+@($adminCredential)
    foreach ($entry in @(@{Profile='RH';Login='teste.rh@avaliacao.test'},@{Profile='Gestor';Login='teste.gestor@avaliacao.test'},@{Profile='Diretoria';Login='teste.diretoria@avaliacao.test'},@{Profile='Admin';Login='teste.admin@avaliacao.test'})) {
        $credential=@($credentials | Where-Object Login -CEQ $entry.Login)[0]
        $sessions[$entry.Profile]=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
        $null=Invoke-DevApi -Profile $entry.Profile -Method POST -Path '/auth/sessions' -Expected @(204) -Body @{login=$credential.Login;password=$credential.Senha}
        $identity=Invoke-DevApi -Profile $entry.Profile -Method GET -Path '/auth/me'
        $expectedId=Invoke-DevQuery "SELECT CONVERT(varchar(36),usuario_id) FROM dbo.usuario WHERE login_normalizado=N'$($entry.Login)';"
        Assert-Dev ($identity.id -ieq $expectedId) 'Identidade autenticada nao corresponde a conta ficticia do DEV.'
    }
    Write-Host 'Massa base pronta; quatro perfis ficticios autenticados exclusivamente em DEV.'
    if ($Validate) { Assert-SeedReadiness; return }
    $cycles=Invoke-DevQuery "SELECT codigo,CONVERT(varchar(36),ciclo_avaliacao_id) AS id,situacao FROM dbo.ciclo_avaliacao WHERE codigo LIKE 'DEV-COMPLETO-%' FOR JSON PATH;" | ConvertFrom-Json
    $flowId=@($cycles | Where-Object codigo -eq 'DEV-COMPLETO-FLUXOS')[0].id
    $closed=@($cycles | Where-Object codigo -eq 'DEV-COMPLETO-ENCERRADO')[0]
    $foreignDraft=$null
    $foreignPublished=$null
    foreach ($profile in @('RH','Gestor')) {
        $options=@(Invoke-DevQuery "SELECT CONVERT(varchar(36),colaborador_id) AS id FROM dbo.colaborador WHERE nome_exibicao LIKE N'DEV COMPLETO - $($profile.ToUpperInvariant())-%' ORDER BY nome_exibicao FOR JSON PATH;" | ConvertFrom-Json)
        Assert-Dev ($options.Count -eq 8) 'Equipe ficticia incompleta.'
        for ($i=1;$i -le 8;$i++) {
            $target=if($i -le 4){'FEEDBACK'}elseif($i -eq 5){'PUBLICADA'}elseif($i -eq 6){'ENVIADA'}elseif($i -eq 7){'RASCUNHO'}else{'REABERTA'}
            $detail=Prepare-Assessment -Profile $profile -CycleId $flowId -Type GESTOR -PersonId $options[$i-1].id -Ordinal $i -Target $target -Prefix "$profile-$i"
            if($profile -eq 'Gestor' -and $i -eq 7){$foreignDraft=$detail}
            if($profile -eq 'Gestor' -and $i -eq 5){$foreignPublished=$detail}
        }
        Write-Host "Equipe $profile - cinco publicadas nas cinco faixas, uma enviada, um rascunho e uma reaberta."
    }
    foreach ($profile in @('RH','Gestor','Diretoria')) {
        $null=Prepare-Assessment -Profile $profile -CycleId $flowId -Type AUTOAVALIACAO -Ordinal 6 -Target PUBLICADA -Prefix "auto-$profile"
    }
    $directorOptions=@(Invoke-DevQuery "SELECT CONVERT(varchar(36),colaborador_id) AS id FROM dbo.colaborador WHERE nome_exibicao LIKE N'DEV COMPLETO - GERENCIA-%' ORDER BY nome_exibicao FOR JSON PATH;" | ConvertFrom-Json)
    for($i=1;$i -le 2;$i++){
        $target=if($i -eq 1){'FEEDBACK'}else{'PUBLICADA'}
        $null=Prepare-Assessment -Profile Diretoria -CycleId $flowId -Type DIRETORIA_GERENCIA -PersonId $directorOptions[$i-1].id -Ordinal 6 -Target $target -Prefix "diretoria-$i"
    }
    $rhView=Invoke-DevApi -Profile RH -Method GET -Path "/assessments/$($foreignDraft.id)"
    Assert-Dev (-not $rhView.allowedActions.edit -and -not $rhView.allowedActions.submit) 'RH nao pode editar/enviar rascunho alheio.'
    $null=Invoke-DevApi -Profile RH -Method PATCH -Path "/assessments/$($foreignDraft.id)" -Revision $foreignDraft.revision -Body @{answers=@()} -Expected @(403)
    $otherFeedback=Invoke-DevApi -Profile RH -Method GET -Path "/assessments/$($foreignPublished.id)"
    Assert-Dev (-not $otherFeedback.allowedActions.completeFeedback -and $otherFeedback.allowedActions.reopen) 'RH nao pode substituir feedback alheio.'
    $null=Invoke-DevApi -Profile RH -Method POST -Path "/assessments/$($foreignPublished.id)/feedback" -Key 'feedback-negado' -Expected @(403) -Body @{feedbackDate=(Get-Date -Format 'yyyy-MM-dd');comment='Tentativa de regressao que deve ser negada.'}
    $null=Invoke-DevApi -Profile Admin -Method GET -Path "/assessments/$($foreignPublished.id)" -Expected @(403)
    $null=Invoke-DevApi -Profile RH -Method POST -Path "/assessments/$($foreignPublished.id)/print-events" -Expected @(204)
    if($closed.situacao -eq 'ABERTO'){
        $null=Invoke-DevApi -Profile RH -Method POST -Path "/evaluation-cycles/$($closed.id)/close" -Expected @(204)
    }
    $future=@($cycles | Where-Object codigo -eq 'DEV-COMPLETO-FUTURO')[0]
    $null=Invoke-DevApi -Profile RH -Method POST -Path "/evaluation-cycles/$($future.id)/close" -Expected @(409)
    $adminId=Invoke-DevQuery "SELECT CONVERT(varchar(36),usuario_id) FROM dbo.usuario WHERE login_normalizado=N'teste.admin@avaliacao.test';"
    $null=Invoke-DevQuery "INSERT INTO dbo.evento_auditoria (ator_usuario_id,acao,tipo_recurso,recurso_id,resultado,request_id,detalhe_reduzido) SELECT '$([guid]$adminId)','DADOS_TESTE.COMPLETAR_JORNADAS','CICLO_AVALIACAO','$([guid]$flowId)','SUCESSO','ADC-DEV-002',N'Jornadas ficticias preenchidas pela API e negativas de autoria validadas.' WHERE NOT EXISTS (SELECT 1 FROM dbo.evento_auditoria WHERE acao='DADOS_TESTE.COMPLETAR_JORNADAS' AND request_id='ADC-DEV-002');"
    Write-Host 'Massa DEV completa. LIVRE sem avaliacoes; CONFIG em rascunho; FLUXOS preenchido; ENCERRADO para consulta.'
    Write-Host 'Credencial tecnica ficticia em secrets\conta-admin-teste-dev.csv (protegida e ignorada). Senhas existentes preservadas.'
}
finally {
    foreach($profile in @($sessions.Keys)){
        try{$null=Invoke-DevApi -Profile $profile -Method DELETE -Path '/auth/sessions/current' -Expected @(204)}
        catch{Write-Warning "Nao foi possivel encerrar a sessao ficticia de $profile."}
    }
}

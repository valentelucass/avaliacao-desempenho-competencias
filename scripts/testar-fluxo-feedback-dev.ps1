[CmdletBinding()]
param(
    [string]$ApiBaseUrl = 'https://localhost:5181/api/v1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$seedScript = Join-Path $repositoryRoot 'database\sql\manual\011_preparar_cenario_feedback_automatizado_dev.sql'
$sqlServer = 'localhost,1433'
$database = 'AVALIACAO_DEV'
$runId = [guid]::NewGuid().ToString('N').Substring(0, 16).ToUpperInvariant()
$password = $null
$ordinaryPassword = $null

function Assert-LocalApiTarget {
    param([Parameter(Mandatory)][string]$Value)

    $uri = $null
    if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) {
        throw 'A API de teste deve ser uma URL HTTPS absoluta do ambiente local.'
    }

    $allowedHosts = @('localhost', '127.0.0.1', '::1')
    if (
        $uri.Scheme -ne 'https' -or
        $uri.UserInfo.Length -ne 0 -or
        $uri.Query.Length -ne 0 -or
        $uri.Fragment.Length -ne 0 -or
        $uri.AbsolutePath.TrimEnd('/') -cne '/api/v1' -or
        $uri.DnsSafeHost.ToLowerInvariant() -notin $allowedHosts
    ) {
        throw 'O teste automatizado aceita somente a API HTTPS local em /api/v1, sem credenciais, parâmetros ou fragmentos.'
    }

    return $uri.GetLeftPart([UriPartial]::Authority) + '/api/v1'
}

function Assert-LocalSpaAvailable {
    param([Parameter(Mandatory)][string]$ApiTarget)

    $apiUri = [Uri]$ApiTarget
    if ($apiUri.Port -ne 5181) {
        throw 'O teste autenticado exige a API local na porta 5181 para conferir também a SPA local na porta 5180.'
    }
    $spaUri = [UriBuilder]::new('https', $apiUri.Host, 5180, '/').Uri
    $response = Invoke-WebRequest -Uri $spaUri -SkipCertificateCheck
    if ([int]$response.StatusCode -ne 200 -or $response.Content -notmatch '<div id="root"></div>') {
        throw 'A SPA local não respondeu com o documento da aplicação durante o teste autenticado.'
    }
}

function Assert-Equal {
    param(
        [Parameter(Mandatory)][string]$Name,
        [AllowNull()]$Actual,
        [AllowNull()]$Expected
    )

    if ($Actual -cne $Expected) {
        throw "$Name inválido."
    }
}

function Assert-True {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][bool]$Condition
    )

    if (-not $Condition) {
        throw "$Name não foi atendido."
    }
}

function Assert-SafeProblem {
    param(
        [Parameter(Mandatory)]$Response,
        [Parameter(Mandatory)][string]$ExpectedCode,
        [Parameter(Mandatory)][string]$Name
    )

    Assert-Equal -Name "$Name - código estável" -Actual $Response.Body.code -Expected $ExpectedCode
    Assert-True -Name "$Name - resposta sem detalhe interno" -Condition (
        $Response.RawContent -notmatch '(?i)(stack\s*trace|sqlserver|sqlexception|dbo\.|row_version|senha_hash)'
    )
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
        throw 'jshell não está disponível para criar a credencial efêmera de teste.'
    }

    $cryptoJar = Get-ChildItem -Path (Join-Path $env:USERPROFILE '.m2\repository\org\springframework\security\spring-security-crypto') `
        -Recurse -Filter 'spring-security-crypto-*.jar' -File -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($null -eq $cryptoJar) {
        throw 'A biblioteca BCrypt do projeto não está disponível no repositório Maven local.'
    }

    $previousPassword = [Environment]::GetEnvironmentVariable('ADC_E2E_EPHEMERAL_PASSWORD', 'Process')
    try {
        [Environment]::SetEnvironmentVariable('ADC_E2E_EPHEMERAL_PASSWORD', $PlainText, 'Process')
        $input = @(
            'import org.springframework.security.crypto.bcrypt.BCrypt;',
            'System.out.println(BCrypt.hashpw(System.getenv("ADC_E2E_EPHEMERAL_PASSWORD"), BCrypt.gensalt(12)));',
            '/exit'
        ) -join [Environment]::NewLine
        $output = $input | & $jshell.Source --class-path $cryptoJar.FullName -q 2>$null
        $match = [regex]::Match(($output -join [Environment]::NewLine), '\$2[aby]\$12\$[./A-Za-z0-9]{53}')
        if (-not $match.Success) {
            throw 'Não foi possível gerar o hash BCrypt efêmero para o teste.'
        }
        return $match.Value
    }
    finally {
        [Environment]::SetEnvironmentVariable('ADC_E2E_EPHEMERAL_PASSWORD', $previousPassword, 'Process')
    }
}

function Invoke-SqlSeed {
    param(
        [Parameter(Mandatory)][string]$PasswordHash
    )

    if (-not (Test-Path -LiteralPath $seedScript)) {
        throw 'O script de cenário autenticado não foi encontrado.'
    }

    $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
    if ($null -eq $sqlcmd) {
        throw 'sqlcmd não está disponível para preparar o cenário isolado em DEV.'
    }

    $output = & $sqlcmd.Source -S $sqlServer -E -N -C -d $database -b -r 1 -f 65001 `
        -v "ADC_E2E_RUN_ID=$runId" "ADC_E2E_BCRYPT_HASH=$PasswordHash" -i $seedScript 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'A preparação do cenário fictício em DEV falhou.'
    }
}

function Invoke-Api {
    param(
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [Parameter(Mandatory)][ValidateSet('GET', 'POST', 'PUT', 'PATCH', 'DELETE')][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [object]$Body,
        [int[]]$ExpectedStatus = @(200),
        [string]$IdempotencyKey,
        [string]$IfMatch,
        [switch]$NoCsrf
    )

    $headers = @{}
    if (-not $NoCsrf -and $Method -ne 'GET') {
        $csrfResponse = Invoke-WebRequest -Uri "$apiTarget/auth/csrf" -WebSession $Session -SkipCertificateCheck
        if ([int]$csrfResponse.StatusCode -ne 200) {
            throw 'Não foi possível obter a proteção CSRF para o teste autenticado.'
        }
        $headers['X-CSRF-TOKEN'] = (($csrfResponse.Content | ConvertFrom-Json).token)
    }
    if (-not [string]::IsNullOrWhiteSpace($IdempotencyKey)) {
        $headers['Idempotency-Key'] = $IdempotencyKey
    }
    if (-not [string]::IsNullOrWhiteSpace($IfMatch)) {
        $headers['If-Match'] = $IfMatch
    }
    $request = @{
        Uri = "$apiTarget$Path"
        Method = $Method
        WebSession = $Session
        Headers = $headers
        SkipCertificateCheck = $true
        SkipHttpErrorCheck = $true
    }
    if ($null -ne $Body) {
        $request.ContentType = 'application/json'
        $request.Body = $Body | ConvertTo-Json -Depth 10 -Compress
    }

    $response = Invoke-WebRequest @request
    if ([int]$response.StatusCode -notin $ExpectedStatus) {
        throw "A API retornou o status $($response.StatusCode) em $Method $Path."
    }

    $rawContent = if ($response.Content -is [byte[]]) {
        [System.Text.Encoding]::UTF8.GetString($response.Content)
    }
    else {
        [string]$response.Content
    }
    $contentType = [string]$response.Headers['Content-Type']
    $content = if ([string]::IsNullOrWhiteSpace($rawContent)) {
        $null
    }
    elseif ($contentType -match '(?i)(application/json|\+json)') {
        ConvertFrom-Json -InputObject $rawContent
    }
    else {
        $rawContent
    }
    return [PSCustomObject]@{
        StatusCode = [int]$response.StatusCode
        Headers = $response.Headers
        Body = $content
        RawContent = $rawContent
    }
}

function Invoke-RefreshSession {
    param([Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session)

    $csrf = Invoke-Api -Session $Session -Method GET -Path '/auth/csrf' -NoCsrf
    $csrfToken = [string]$csrf.Body.token
    if ([string]::IsNullOrWhiteSpace($csrfToken)) {
        throw 'A API não forneceu o token CSRF para renovar a sessão fictícia.'
    }

    $refreshUri = [Uri]"$apiTarget/auth/sessions/refresh"
    $refreshCookie = @($Session.Cookies.GetCookies($refreshUri) | Where-Object { $_.Name -ceq 'ADC-REFRESH' }) |
        Select-Object -First 1
    $csrfCookie = @($Session.Cookies.GetCookies($refreshUri) | Where-Object { $_.Name -ceq 'ADC-XSRF-TOKEN' }) |
        Select-Object -First 1
    $accessCookie = @($Session.Cookies.GetCookies($refreshUri) | Where-Object { $_.Name -ceq 'ADC-ACCESS' }) |
        Select-Object -First 1
    if ($null -eq $refreshCookie -or $null -eq $csrfCookie -or $null -eq $accessCookie) {
        throw 'A sessão de teste não possui o cookie de renovação para a rota autenticada.'
    }
    $cookieHeader = "ADC-ACCESS=$($accessCookie.Value); ADC-REFRESH=$($refreshCookie.Value); ADC-XSRF-TOKEN=$($csrfCookie.Value)"

    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.UseCookies = $false
    $handler.ServerCertificateCustomValidationCallback = [System.Net.Http.HttpClientHandler]::DangerousAcceptAnyServerCertificateValidator
    $client = [System.Net.Http.HttpClient]::new($handler)
    $request = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::Post,
        "$apiTarget/auth/sessions/refresh"
    )
    try {
        [void]$request.Headers.TryAddWithoutValidation('X-CSRF-TOKEN', $csrfToken)
        # O cliente do teste reconstitui o cabeçalho Cookie da sessão local, sem expor o valor.
        [void]$request.Headers.TryAddWithoutValidation('Cookie', $cookieHeader)
        $response = $client.Send($request)
        try {
            if ([int]$response.StatusCode -ne 204) {
                throw "A API retornou o status $([int]$response.StatusCode) na renovação de sessão."
            }
            foreach ($setCookie in $response.Headers.GetValues('Set-Cookie')) {
                $Session.Cookies.SetCookies($refreshUri, $setCookie)
            }
            return [int]$response.StatusCode
        }
        finally {
            $response.Dispose()
        }
    }
    finally {
        $request.Dispose()
        $client.Dispose()
        $handler.Dispose()
    }
}

function New-Session {
    param([Parameter(Mandatory)][string]$Login)

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginResponse = Invoke-Api -Session $session -Method POST -Path '/auth/sessions' `
        -ExpectedStatus @(204) -Body @{ login = $Login; password = $password }
    Assert-Equal -Name 'Login autenticado' -Actual $loginResponse.StatusCode -Expected 204
    $refreshCookie = @(
        $session.Cookies.GetCookies([Uri]"$apiTarget/auth/sessions/refresh") |
            Where-Object { $_.Name -ceq 'ADC-REFRESH' }
    ) | Select-Object -First 1
    Assert-True -Name 'Cookie de renovação disponível no escopo da rota de refresh' -Condition (
        $null -ne $refreshCookie -and
        $session.Cookies.GetCookieHeader([Uri]"$apiTarget/auth/sessions/refresh") -match '(^|;\s*)ADC-REFRESH='
    )
    return $session
}

function Get-CycleId {
    param([Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session)

    $cycles = Invoke-Api -Session $Session -Method GET -Path '/evaluation-cycles?limit=100'
    $cycle = @($cycles.Body.items | Where-Object { $_.name -ceq "Ciclo QA feedback $runId" }) | Select-Object -First 1
    if ($null -eq $cycle) {
        throw 'O ciclo fictício preparado para o teste não ficou visível ao avaliador.'
    }
    return [guid]$cycle.id
}

function Get-RequiredAnswers {
    param([Parameter(Mandatory)]$Assessment)

    $answers = @()
    foreach ($competency in @($Assessment.questionnaire.competencies)) {
        foreach ($question in @($competency.questions)) {
            if (-not [bool]$question.required) {
                continue
            }
            $option = @($question.options | Where-Object { [int]$_.points -eq 100 }) | Select-Object -First 1
            if ($null -eq $option) {
                throw 'O questionário aprovado de teste não possui a opção neutra esperada.'
            }
            $answers += @{ questionId = [string]$question.id; optionId = [string]$option.id }
        }
    }
    Assert-True -Name 'Questionário com questões obrigatórias' -Condition ($answers.Count -gt 0)
    return $answers
}

function Complete-Draft {
    param(
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [Parameter(Mandatory)]$Draft,
        [Parameter(Mandatory)][string]$Prefix,
        [switch]$AssertIdempotencyAndRevision
    )

    $draftBody = @{
        answers = @(Get-RequiredAnswers -Assessment $Draft)
        comment = 'Preenchimento automatizado.'
        actionPlan = 'Plano automatizado.'
    }
    if ($AssertIdempotencyAndRevision) {
        $weakRevision = Invoke-Api -Session $Session -Method PATCH -Path "/assessments/$($Draft.id)" `
            -ExpectedStatus @(422) -IfMatch ('W/"' + $Draft.revision + '"') -Body $draftBody
        Assert-SafeProblem -Response $weakRevision -ExpectedCode 'VALIDATION_FAILED' `
            -Name 'If-Match fraco rejeitado'
    }

    $saved = Invoke-Api -Session $Session -Method PATCH -Path "/assessments/$($Draft.id)" `
        -IfMatch ('"' + $Draft.revision + '"') -Body $draftBody
    Assert-Equal -Name 'Rascunho salvo' -Actual $saved.Body.status -Expected 'RASCUNHO'

    if ($AssertIdempotencyAndRevision) {
        $staleRevision = Invoke-Api -Session $Session -Method PATCH -Path "/assessments/$($Draft.id)" `
            -ExpectedStatus @(409) -IfMatch ('"' + $Draft.revision + '"') -Body $draftBody
        Assert-SafeProblem -Response $staleRevision -ExpectedCode 'REVISION_MISMATCH' `
            -Name 'Revisão obsoleta rejeitada'
    }

    $submitKey = "$Prefix-submit-$runId"
    $submitted = Invoke-Api -Session $Session -Method POST -Path "/assessments/$($Draft.id)/submit" `
        -IfMatch ('"' + $saved.Body.revision + '"') -IdempotencyKey $submitKey
    Assert-Equal -Name 'Avaliação enviada' -Actual $submitted.Body.status -Expected 'ENVIADA'
    if ($AssertIdempotencyAndRevision) {
        $replayed = Invoke-Api -Session $Session -Method POST -Path "/assessments/$($Draft.id)/submit" `
            -IfMatch ('"' + $saved.Body.revision + '"') -IdempotencyKey $submitKey
        Assert-Equal -Name 'Repetição idempotente do envio mantém a avaliação' `
            -Actual $replayed.Body.id -Expected $submitted.Body.id
        Assert-Equal -Name 'Repetição idempotente do envio mantém a revisão' `
            -Actual $replayed.Body.revision -Expected $submitted.Body.revision
    }
    return $submitted.Body
}

function Create-Assessment {
    param(
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [Parameter(Mandatory)][string]$Type,
        [Parameter(Mandatory)][guid]$CycleId,
        [guid]$CollaboratorId,
        [Parameter(Mandatory)][string]$Prefix,
        [switch]$AssertIdempotentReplay
    )

    $body = @{ type = $Type; cycleId = [string]$CycleId }
    if ($PSBoundParameters.ContainsKey('CollaboratorId')) {
        $body.collaboratorId = [string]$CollaboratorId
    }
    $createKey = "$Prefix-create-$runId"
    $created = Invoke-Api -Session $Session -Method POST -Path '/assessments' -ExpectedStatus @(201) `
        -IdempotencyKey $createKey -Body $body
    Assert-Equal -Name 'Avaliação criada em rascunho' -Actual $created.Body.status -Expected 'RASCUNHO'
    Assert-Equal -Name 'Feedback de rascunho não aplicável' -Actual $created.Body.feedbackStatus -Expected 'NAO_APLICAVEL'
    if ($AssertIdempotentReplay) {
        $replayed = Invoke-Api -Session $Session -Method POST -Path '/assessments' -ExpectedStatus @(201) `
            -IdempotencyKey $createKey -Body $body
        Assert-Equal -Name 'Repetição idempotente da criação mantém a avaliação' `
            -Actual $replayed.Body.id -Expected $created.Body.id
        Assert-Equal -Name 'Repetição idempotente da criação mantém a revisão' `
            -Actual $replayed.Body.revision -Expected $created.Body.revision
    }
    return $created.Body
}

function Publish-Assessment {
    param(
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [Parameter(Mandatory)]$Submitted,
        [Parameter(Mandatory)][string]$Prefix,
        [Parameter(Mandatory)][string]$ExpectedFeedbackStatus,
        [switch]$AssertIdempotentReplay
    )

    $publishKey = "$Prefix-publish-$runId"
    $published = Invoke-Api -Session $Session -Method POST -Path "/assessments/$($Submitted.id)/publish" `
        -IdempotencyKey $publishKey
    Assert-Equal -Name 'Avaliação publicada' -Actual $published.Body.status -Expected 'PUBLICADA'
    Assert-Equal -Name 'Situação de feedback após publicação' -Actual $published.Body.feedbackStatus -Expected $ExpectedFeedbackStatus
    if ($AssertIdempotentReplay) {
        $replayed = Invoke-Api -Session $Session -Method POST -Path "/assessments/$($Submitted.id)/publish" `
            -IdempotencyKey $publishKey
        Assert-Equal -Name 'Repetição idempotente da publicação mantém a avaliação' `
            -Actual $replayed.Body.id -Expected $published.Body.id
        Assert-Equal -Name 'Repetição idempotente da publicação mantém a revisão' `
            -Actual $replayed.Body.revision -Expected $published.Body.revision
    }
    return $published.Body
}

function Complete-Feedback {
    param(
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [Parameter(Mandatory)]$Published,
        [Parameter(Mandatory)][string]$Prefix,
        [switch]$AssertIdempotentReplay
    )

    $feedbackBody = @{
        feedbackDate = '2026-08-29'
        comment = 'Registro fictício do feedback automatizado.'
    }
    $feedbackKey = "$Prefix-feedback-$runId"
    $completed = Invoke-Api -Session $Session -Method POST -Path "/assessments/$($Published.id)/feedback" `
        -IdempotencyKey $feedbackKey -Body $feedbackBody
    Assert-Equal -Name 'Feedback concluído' -Actual $completed.Body.feedbackStatus -Expected 'CONCLUIDO'
    Assert-True -Name 'Registro de feedback retornado' -Condition ($null -ne $completed.Body.feedback)
    if ($AssertIdempotentReplay) {
        $replayed = Invoke-Api -Session $Session -Method POST -Path "/assessments/$($Published.id)/feedback" `
            -IdempotencyKey $feedbackKey -Body $feedbackBody
        Assert-Equal -Name 'Repetição idempotente do feedback mantém a avaliação' `
            -Actual $replayed.Body.id -Expected $completed.Body.id
        Assert-Equal -Name 'Repetição idempotente do feedback mantém a revisão' `
            -Actual $replayed.Body.revision -Expected $completed.Body.revision
        Assert-Equal -Name 'Repetição idempotente do feedback mantém a conclusão' `
            -Actual $replayed.Body.feedbackStatus -Expected 'CONCLUIDO'
    }
    return $completed.Body
}

function New-CycleConfiguration {
    param(
        [Parameter(Mandatory)][object[]]$QuestionnaireVersions,
        [Parameter(Mandatory)][string]$Name
    )

    $questionnaires = @(
        foreach ($version in $QuestionnaireVersions) {
            $option = @($version.configurationOptions) | Select-Object -First 1
            if ($null -eq $option) {
                throw 'A versão aprovada selecionada não possui configuração de cálculo e matriz aprovadas.'
            }
            @{
                questionnaireVersionId = [string]$version.questionnaireVersionId
                calculationConfigurationVersionId = [string]$option.calculationConfigurationVersionId
                classificationMatrixVersionId = [string]$option.classificationMatrixVersionId
            }
        }
    )

    return @{
        name = $Name
        openingAtLocal = '2026-09-01T00:00:00'
        closingAtLocal = '2026-09-16T00:00:00'
        timeZone = 'America/Sao_Paulo'
        selfAssessmentEnabled = $false
        questionnaires = $questionnaires
    }
}

function New-FictitiousQuestionnaireVersion {
    param([Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session)

    $questionnaireCode = "QA_REPO_Q_$runId"
    $body = @{
        questionnaire = @{
            code = $questionnaireCode
            name = "Questionário fictício de persistência $runId"
        }
        versionNumber = 1
        title = "Versão fictícia de persistência $runId"
        description = 'Conteúdo estritamente fictício para validar a escrita transacional em DEV.'
        calculation = @{
            code = 'MEDIA_SIMPLES_2024_1'
            versionNumber = 1
        }
        classificationMatrixVersionNumber = 1
        competencies = @(
            @{
                code = "QA_REPO_C_$runId"
                name = "Competência fictícia $runId"
                versionNumber = 1
                description = 'Competência sem vínculo com pessoa ou avaliação real.'
                order = 1
                questions = @(
                    @{
                        code = "QA_REPO_P_$runId"
                        text = 'Pergunta fictícia para confirmar a persistência completa?'
                        description = 'Sem conteúdo pessoal ou de avaliação real.'
                        order = 1
                    }
                )
            }
        )
    }

    $created = Invoke-Api -Session $Session -Method POST -Path '/questionnaire-versions' `
        -ExpectedStatus @(201) -Body $body
    Assert-True -Name 'Versão fictícia de questionário criada' -Condition (
        $null -ne $created.Body.questionnaireVersionId -and
        $null -ne $created.Body.calculationConfigurationVersionId -and
        $null -ne $created.Body.classificationMatrixVersionId
    )

    $duplicate = Invoke-Api -Session $Session -Method POST -Path '/questionnaire-versions' `
        -ExpectedStatus @(409) -Body $body
    Assert-SafeProblem -Response $duplicate -ExpectedCode 'CONFLICT' `
        -Name 'Versão duplicada de questionário rejeitada'

    $approved = @((Invoke-Api -Session $Session -Method GET -Path '/questionnaire-versions/approved').Body)
    $visible = @($approved | Where-Object {
        $_.questionnaireVersionId -ceq $created.Body.questionnaireVersionId
    }) | Select-Object -First 1
    Assert-True -Name 'Versão fictícia aprovada disponível para configuração de ciclo' -Condition (
        $null -ne $visible -and @($visible.configurationOptions).Count -gt 0
    )
    return $created.Body
}

function Invoke-FictitiousUserAdministrationScenario {
    param(
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [Parameter(Mandatory)][string]$InitialPassword
    )

    $userLogin = "qa.repo.usuario.$($runId.ToLowerInvariant())"
    $createBody = @{
        login = $userLogin
        displayName = "Usuário fictício de persistência $runId"
        initialRoles = @('COLABORADOR')
    }
    $createBody.Add('initialPassword', $InitialPassword)
    $created = Invoke-Api -Session $Session -Method POST -Path '/administration/users' `
        -ExpectedStatus @(201) -Body $createBody
    $userId = [guid]$created.Body.id
    Assert-Equal -Name 'Usuário fictício criado ativo' -Actual $created.Body.status -Expected 'ACTIVE'
    Assert-Equal -Name 'Usuário fictício exige troca inicial de senha' `
        -Actual $created.Body.passwordChangeRequired -Expected $true
    Assert-True -Name 'Usuário fictício recebeu somente o perfil comum' -Condition (
        @($created.Body.roles).Count -eq 1 -and @($created.Body.roles) -contains 'COLABORADOR'
    )
    Assert-True -Name 'Resposta de criação de usuário não expõe credencial' -Condition (
        $created.RawContent -notmatch '(?i)(initialPassword|temporaryPassword|passwordHash|senha_hash)'
    )

    $duplicate = Invoke-Api -Session $Session -Method POST -Path '/administration/users' `
        -ExpectedStatus @(409) -Body $createBody
    Assert-SafeProblem -Response $duplicate -ExpectedCode 'CONFLICT' `
        -Name 'Login fictício duplicado rejeitado'

    $detail = Invoke-Api -Session $Session -Method GET -Path "/administration/users/$userId"
    Assert-Equal -Name 'Consulta individual do usuário fictício' -Actual $detail.Body.login -Expected $userLogin
    $users = Invoke-Api -Session $Session -Method GET -Path '/administration/users'
    Assert-Equal -Name 'Usuário fictício presente na consulta administrativa' `
        -Actual @($users.Body | Where-Object { $_.id -ceq [string]$userId }).Count -Expected 1

    $updated = Invoke-Api -Session $Session -Method PATCH -Path "/administration/users/$userId" `
        -Body @{ displayName = "Usuário fictício atualizado $runId"; status = 'ACTIVE' }
    Assert-Equal -Name 'Nome fictício atualizado' -Actual $updated.Body.displayName `
        -Expected "Usuário fictício atualizado $runId"

    $deleted = Invoke-Api -Session $Session -Method PATCH `
        -Path "/administration/users/$userId/logical-deletion" -Body @{ deleted = $true }
    Assert-Equal -Name 'Usuário fictício desativado pela exclusão lógica' `
        -Actual $deleted.Body.status -Expected 'DISABLED'
    Assert-Equal -Name 'Usuário fictício marcado como excluído logicamente' `
        -Actual $deleted.Body.logicallyDeleted -Expected $true
    Assert-True -Name 'Resposta de exclusão lógica não expõe credencial' -Condition (
        $deleted.RawContent -notmatch '(?i)(initialPassword|temporaryPassword|passwordHash|senha_hash)'
    )

    return [PSCustomObject]@{ Id = $userId; Login = $userLogin }
}

function Assert-RestrictedPhysicalDeletions {
    param(
        [Parameter(Mandatory)][guid]$BranchId,
        [Parameter(Mandatory)][guid]$CycleId,
        [Parameter(Mandatory)][guid]$RemovedCycleQuestionnaireId,
        [Parameter(Mandatory)][guid]$KeptCycleQuestionnaireId
    )

    $query = @"
SET NOCOUNT ON;
DECLARE @branch_id uniqueidentifier = CONVERT(uniqueidentifier, '$BranchId');
DECLARE @cycle_id uniqueidentifier = CONVERT(uniqueidentifier, '$CycleId');
DECLARE @removed_cycle_questionnaire_id uniqueidentifier = CONVERT(uniqueidentifier, '$RemovedCycleQuestionnaireId');
DECLARE @kept_cycle_questionnaire_id uniqueidentifier = CONVERT(uniqueidentifier, '$KeptCycleQuestionnaireId');

IF EXISTS (SELECT 1 FROM dbo.filial WHERE filial_id = @branch_id)
    THROW 51300, N'A filial fictícia inativa sem lotação não foi excluída fisicamente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria
    WHERE acao = N'CADASTRO.FILIAL.EXCLUIR'
      AND tipo_recurso = N'FILIAL'
      AND recurso_id = @branch_id
      AND resultado = N'SUCESSO'
)
    THROW 51301, N'A exclusão física da filial não foi auditada.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.ciclo_questionario
    WHERE ciclo_questionario_id = @removed_cycle_questionnaire_id
      AND ciclo_avaliacao_id = @cycle_id
)
    THROW 51302, N'O questionário removido da configuração de rascunho não foi excluído fisicamente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.ciclo_questionario
    WHERE ciclo_questionario_id = @kept_cycle_questionnaire_id
      AND ciclo_avaliacao_id = @cycle_id
)
    THROW 51303, N'O questionário mantido na configuração de rascunho foi removido indevidamente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria
    WHERE acao = N'CICLO.ALTERAR'
      AND tipo_recurso = N'CICLO_AVALIACAO'
      AND recurso_id = @cycle_id
      AND resultado = N'SUCESSO'
)
    THROW 51304, N'A alteração de configuração do ciclo não foi auditada.', 1;
"@
    $output = & sqlcmd.exe -S $sqlServer -E -N -C -d $database -b -h -1 -W -Q $query 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'A verificação das exclusões físicas restritas em DEV falhou.'
    }
}

function Assert-FeedbackDatabaseState {
    $query = @"
SET NOCOUNT ON;
SELECT
    SUM(CASE WHEN a.tipo_avaliacao = 'GESTOR' AND f.situacao = 'CONCLUIDO' THEN 1 ELSE 0 END),
    SUM(CASE WHEN a.tipo_avaliacao = 'GESTOR' AND f.situacao = 'PENDENTE' THEN 1 ELSE 0 END),
    SUM(CASE WHEN a.tipo_avaliacao = 'DIRETORIA_GERENCIA' AND f.situacao = 'CONCLUIDO' THEN 1 ELSE 0 END),
    SUM(CASE WHEN a.tipo_avaliacao = 'AUTOAVALIACAO' AND f.situacao = 'NAO_APLICAVEL' THEN 1 ELSE 0 END)
FROM dbo.avaliacao AS a
JOIN dbo.ciclo_avaliacao AS c ON c.ciclo_avaliacao_id = a.ciclo_avaliacao_id
JOIN dbo.versao_avaliacao AS v ON v.avaliacao_id = a.avaliacao_id
JOIN dbo.feedback_avaliacao AS f ON f.versao_avaliacao_id = v.versao_avaliacao_id
WHERE c.codigo = N'QA-FEEDBACK-$runId';

IF EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria AS audit
    JOIN dbo.avaliacao AS assessment ON assessment.avaliacao_id = audit.recurso_id
    JOIN dbo.ciclo_avaliacao AS cycle ON cycle.ciclo_avaliacao_id = assessment.ciclo_avaliacao_id
    WHERE cycle.codigo = N'QA-FEEDBACK-$runId'
      AND audit.acao = 'AVALIACOES.FEEDBACK.CONCLUIR'
      AND audit.detalhe_reduzido LIKE N'%Registro fictício do feedback automatizado%'
)
    THROW 51299, N'O comentário do feedback não pode ser registrado na auditoria.', 1;
"@
    $output = & sqlcmd.exe -S $sqlServer -E -N -C -d $database -b -h -1 -W -s '|' -Q $query 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'A verificação de persistência do cenário de feedback falhou.'
    }
    $line = @($output | Where-Object { $_ -match '^\d+\|\d+\|\d+\|\d+$' }) | Select-Object -First 1
    Assert-Equal -Name 'Persistência de feedback' -Actual $line -Expected '5|1|1|1'
}

function Assert-ExpandedRepositoryDatabaseState {
    param(
        [Parameter(Mandatory)][guid]$UserId,
        [Parameter(Mandatory)][string]$UserLogin,
        [Parameter(Mandatory)][guid]$QuestionnaireVersionId,
        [Parameter(Mandatory)][guid]$CalculationConfigurationVersionId,
        [Parameter(Mandatory)][guid]$ClassificationMatrixVersionId,
        [Parameter(Mandatory)][guid]$PrimaryAssessmentId
    )

    $query = @"
SET NOCOUNT ON;
DECLARE @user_id uniqueidentifier = CONVERT(uniqueidentifier, '$UserId');
DECLARE @user_login nvarchar(128) = N'$UserLogin';
DECLARE @questionnaire_version_id uniqueidentifier = CONVERT(uniqueidentifier, '$QuestionnaireVersionId');
DECLARE @calculation_configuration_id uniqueidentifier = CONVERT(uniqueidentifier, '$CalculationConfigurationVersionId');
DECLARE @classification_matrix_id uniqueidentifier = CONVERT(uniqueidentifier, '$ClassificationMatrixVersionId');
DECLARE @assessment_id uniqueidentifier = CONVERT(uniqueidentifier, '$PrimaryAssessmentId');

IF NOT EXISTS (
    SELECT 1
    FROM dbo.usuario
    WHERE usuario_id = @user_id
      AND login_normalizado = @user_login
      AND nome_exibicao = N'Usuário fictício atualizado $runId'
      AND situacao = 'DESATIVADO'
      AND administrador_supremo = 0
      AND protegido_fluxo_normal = 0
      AND excluido_logicamente = 1
      AND excluido_por_usuario_id IS NOT NULL
      AND excluido_em_utc IS NOT NULL
)
    THROW 51320, N'A conta fictícia não preservou o estado final de exclusão lógica.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.credencial_local
    WHERE usuario_id = @user_id
      AND algoritmo = 'BCRYPT'
      AND parametros = 'strength=12'
      AND senha_deve_ser_trocada = 1
      AND LEN(senha_hash) = 60
      AND LEFT(senha_hash, 2) = CHAR(36) + '2'
)
    THROW 51321, N'A conta fictícia não manteve somente uma credencial BCrypt forte.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.atribuicao_papel AS assignment
    JOIN dbo.papel AS role ON role.papel_id = assignment.papel_id
    WHERE assignment.usuario_id = @user_id
      AND assignment.revogado_em_utc IS NULL
      AND role.codigo = N'COLABORADOR'
) <> 1
    THROW 51322, N'O perfil comum inicial não foi persistido de forma única.', 1;

IF EXISTS (
    SELECT expected.action
    FROM (VALUES
        ('USUARIO.CRIAR'),
        ('ACESSO.INICIAL_ATRIBUIDO'),
        ('USUARIO.ALTERAR'),
        ('USUARIO.EXCLUIR_LOGICAMENTE')
    ) AS expected(action)
    WHERE (
        SELECT COUNT(*)
        FROM dbo.evento_auditoria AS audit
        WHERE audit.acao = expected.action
          AND audit.tipo_recurso = 'USUARIO'
          AND audit.recurso_id = @user_id
          AND audit.resultado = 'SUCESSO'
    ) <> 1
)
    THROW 51323, N'A jornada administrativa da conta fictícia não foi auditada uma única vez por ação.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria
    WHERE tipo_recurso = 'USUARIO'
      AND recurso_id = @user_id
      AND detalhe_reduzido IS NOT NULL
)
    THROW 51324, N'A auditoria da conta fictícia armazenou detalhe desnecessário.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.versao_questionario AS version
    JOIN dbo.questionario AS questionnaire ON questionnaire.questionario_id = version.questionario_id
    WHERE version.versao_questionario_id = @questionnaire_version_id
      AND questionnaire.codigo = N'QA_REPO_Q_$runId'
      AND questionnaire.ativo = 1
      AND version.numero_versao = 1
      AND version.aprovado_por_usuario_id IS NOT NULL
      AND version.aprovado_em_utc IS NOT NULL
)
    THROW 51325, N'A versão fictícia de questionário não foi persistida e aprovada.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.versao_questionario AS version
    JOIN dbo.questionario AS questionnaire ON questionnaire.questionario_id = version.questionario_id
    WHERE questionnaire.codigo = N'QA_REPO_Q_$runId'
) <> 1
    THROW 51326, N'O conflito de versão fictícia deixou conteúdo duplicado.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.questionario_competencia
    WHERE versao_questionario_id = @questionnaire_version_id
) <> 1
    THROW 51327, N'A versão fictícia não possui exatamente uma competência.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.pergunta_questionario AS question
    JOIN dbo.questionario_competencia AS link
      ON link.questionario_competencia_id = question.questionario_competencia_id
    WHERE link.versao_questionario_id = @questionnaire_version_id
) <> 1
    THROW 51328, N'A versão fictícia não possui exatamente uma pergunta.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.opcao_resposta
    WHERE versao_questionario_id = @questionnaire_version_id
) <> 5 OR (
    SELECT COUNT(DISTINCT pontos)
    FROM dbo.opcao_resposta
    WHERE versao_questionario_id = @questionnaire_version_id
) <> 5 OR (
    SELECT MIN(pontos)
    FROM dbo.opcao_resposta
    WHERE versao_questionario_id = @questionnaire_version_id
) <> 80 OR (
    SELECT MAX(pontos)
    FROM dbo.opcao_resposta
    WHERE versao_questionario_id = @questionnaire_version_id
) <> 120
    THROW 51329, N'A escala congelada da versão fictícia não corresponde a 80/90/100/110/120.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.configuracao_calculo_versao
    WHERE configuracao_calculo_versao_id = @calculation_configuration_id
      AND codigo = N'MEDIA_SIMPLES_2024_1'
      AND numero_versao = 1
      AND aprovado_em_utc IS NOT NULL
) OR NOT EXISTS (
    SELECT 1
    FROM dbo.matriz_classificacao_versao
    WHERE matriz_classificacao_versao_id = @classification_matrix_id
      AND configuracao_calculo_versao_id = @calculation_configuration_id
      AND codigo = N'GERAL'
      AND numero_versao = 1
      AND aprovado_em_utc IS NOT NULL
)
    THROW 51330, N'A versão fictícia não reutilizou a configuração e a matriz aprovadas.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.evento_auditoria
    WHERE acao = 'QUESTIONARIO.VERSAO.CRIAR_APROVAR'
      AND tipo_recurso = 'VERSAO_QUESTIONARIO'
      AND recurso_id = @questionnaire_version_id
      AND resultado = 'SUCESSO'
) <> 1
    THROW 51331, N'A versão fictícia de questionário não foi auditada uma única vez.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria
    WHERE tipo_recurso = 'VERSAO_QUESTIONARIO'
      AND recurso_id = @questionnaire_version_id
      AND detalhe_reduzido IS NOT NULL
)
    THROW 51332, N'A auditoria do questionário fictício armazenou detalhe desnecessário.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.avaliacao
    WHERE avaliacao_id = @assessment_id
      AND situacao = 'PUBLICADA'
      AND versao_atual_numero = 8
)
    THROW 51333, N'A avaliação principal não preservou a versão atual esperada após reabertura.', 1;

IF (SELECT COUNT(*) FROM dbo.versao_avaliacao WHERE avaliacao_id = @assessment_id) <> 8
    THROW 51334, N'Uma repetição ou conflito criou versão adicional da avaliação.', 1;

IF (SELECT COUNT(*) FROM dbo.resultado_avaliacao WHERE avaliacao_id = @assessment_id) <> 4
    THROW 51335, N'Uma repetição ou conflito criou resultado adicional da avaliação.', 1;

IF (SELECT COUNT(*) FROM dbo.transicao_avaliacao WHERE avaliacao_id = @assessment_id AND acao = 'CRIACAO') <> 1
   OR (SELECT COUNT(*) FROM dbo.transicao_avaliacao WHERE avaliacao_id = @assessment_id AND acao = 'ENVIO') <> 2
   OR (SELECT COUNT(*) FROM dbo.transicao_avaliacao WHERE avaliacao_id = @assessment_id AND acao = 'PUBLICACAO') <> 2
   OR (SELECT COUNT(*) FROM dbo.transicao_avaliacao WHERE avaliacao_id = @assessment_id AND acao = 'REABERTURA') <> 1
    THROW 51336, N'Uma repetição idempotente criou transição adicional da avaliação.', 1;

IF (SELECT COUNT(*) FROM dbo.feedback_avaliacao WHERE avaliacao_id = @assessment_id) <> 2
   OR (SELECT COUNT(*) FROM dbo.feedback_avaliacao WHERE avaliacao_id = @assessment_id AND situacao = 'CONCLUIDO') <> 1
   OR (SELECT COUNT(*) FROM dbo.feedback_avaliacao WHERE avaliacao_id = @assessment_id AND situacao = 'PENDENTE') <> 1
    THROW 51337, N'Uma repetição idempotente alterou os registros de feedback.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.chave_idempotencia
    WHERE recurso_resposta_id = @assessment_id
      AND status_resposta IS NOT NULL
) <> 7
    THROW 51338, N'As operações idempotentes da avaliação não foram concluídas de forma única.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.evento_auditoria
    WHERE recurso_id = @assessment_id
      AND resultado = 'SUCESSO'
      AND detalhe_reduzido = N'REPETICAO_IDEMPOTENTE'
) <> 5
    THROW 51339, N'As repetições idempotentes não foram auditadas de forma explícita.', 1;

IF (SELECT COUNT(*) FROM dbo.evento_auditoria WHERE recurso_id = @assessment_id AND acao = 'AVALIACOES.CRIAR_GESTOR' AND resultado = 'SUCESSO') <> 2
   OR (SELECT COUNT(*) FROM dbo.evento_auditoria WHERE recurso_id = @assessment_id AND acao = 'AVALIACOES.EDITAR' AND resultado = 'SUCESSO') <> 2
   OR (SELECT COUNT(*) FROM dbo.evento_auditoria WHERE recurso_id = @assessment_id AND acao = 'AVALIACOES.ENVIAR' AND resultado = 'SUCESSO') <> 3
   OR (SELECT COUNT(*) FROM dbo.evento_auditoria WHERE recurso_id = @assessment_id AND acao = 'AVALIACOES.PUBLICAR' AND resultado = 'SUCESSO') <> 3
   OR (SELECT COUNT(*) FROM dbo.evento_auditoria WHERE recurso_id = @assessment_id AND acao = 'AVALIACOES.FEEDBACK.CONCLUIR' AND resultado = 'SUCESSO') <> 2
   OR (SELECT COUNT(*) FROM dbo.evento_auditoria WHERE recurso_id = @assessment_id AND acao = 'AVALIACOES.REABRIR' AND resultado = 'SUCESSO') <> 2
    THROW 51340, N'A trilha de auditoria não distingue execução, repetição e edições válidas.', 1;

IF (
    SELECT COUNT(*)
    FROM dbo.evento_auditoria
    WHERE recurso_id = @assessment_id
      AND acao = 'AVALIACOES.FEEDBACK.CONCLUIR'
      AND resultado = 'NEGADO'
) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria AS audit
    JOIN dbo.usuario AS actor ON actor.usuario_id = audit.ator_usuario_id
    WHERE actor.login_normalizado = N'qa.feedback.rh.$runId'
      AND audit.acao = 'AUTORIZACAO.NEGAR'
      AND audit.tipo_recurso = 'HTTP'
      AND audit.resultado = 'NEGADO'
)
    THROW 51341, N'As negações de feedback nas camadas HTTP e de recurso não foram auditadas.', 1;
"@
    $output = & sqlcmd.exe -S $sqlServer -E -N -C -d $database -b -h -1 -W -Q $query 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'A verificação dos repositórios e das bordas de concorrência em DEV falhou.'
    }
}

function Assert-IndicatorDatabaseState {
    param([Parameter(Mandatory)][guid]$CycleId)

    $query = @"
SET NOCOUNT ON;
DECLARE @cycle_id uniqueidentifier = CONVERT(uniqueidentifier, '$CycleId');

IF NOT EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria
    WHERE acao = N'INDICADORES.CONSULTAR'
      AND tipo_recurso = N'INDICADOR'
      AND recurso_id = @cycle_id
      AND resultado = N'SUCESSO'
)
    THROW 51310, N'A consulta agregada disponível não foi auditada.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria
    WHERE acao = N'INDICADORES.EXPORTAR'
      AND tipo_recurso = N'INDICADOR'
      AND recurso_id = @cycle_id
      AND resultado = N'SUCESSO'
)
    THROW 51311, N'A exportação agregada disponível não foi auditada.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria
    WHERE acao = N'INDICADORES.OPCOES'
      AND tipo_recurso = N'INDICADOR'
      AND recurso_id = @cycle_id
      AND resultado = N'SUCESSO'
)
    THROW 51312, N'As opções privadas de filtro não foram auditadas.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.evento_auditoria
    WHERE acao = N'INDICADORES.CONSULTAR'
      AND tipo_recurso = N'INDICADOR'
      AND recurso_id = @cycle_id
      AND resultado = N'NEGADO'
)
    THROW 51313, N'As consultas suprimidas ou limitadas não foram auditadas.', 1;
"@
    $output = & sqlcmd.exe -S $sqlServer -E -N -C -d $database -b -h -1 -W -Q $query 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'A verificação de auditoria dos indicadores em DEV falhou.'
    }
}

function Assert-RefreshTokenPersisted {
    param([Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$Session)

    $refreshCookie = @(
        $Session.Cookies.GetCookies([Uri]"$apiTarget/auth/sessions/refresh") |
            Where-Object { $_.Name -ceq 'ADC-REFRESH' }
    ) | Select-Object -First 1
    if ($null -eq $refreshCookie) {
        throw 'O cookie de renovação não está disponível para validar a sessão fictícia.'
    }

    $token = $refreshCookie.Value
    $hashBytes = [System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($token))
    $tokenHash = [Convert]::ToHexString($hashBytes).ToLowerInvariant()
    $connection = [System.Data.SqlClient.SqlConnection]::new(
        "Server=$sqlServer;Database=$database;Integrated Security=True;Encrypt=True;TrustServerCertificate=True"
    )
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        $command.CommandText = @'
SELECT COUNT(*)
FROM dbo.token_renovacao
WHERE token_hash = @token_hash
  AND revogado_em_utc IS NULL
  AND expira_em_utc > SYSUTCDATETIME();
'@
        $parameter = $command.Parameters.Add('@token_hash', [System.Data.SqlDbType]::VarChar, 128)
        $parameter.Value = $tokenHash
        $matches = [int]$command.ExecuteScalar()
        Assert-Equal -Name 'Token de renovação fictício persistido somente como hash ativo' -Actual $matches -Expected 1
    }
    finally {
        if ($null -ne $connection) {
            $connection.Dispose()
        }
        Remove-Variable tokenHash -ErrorAction SilentlyContinue
        Remove-Variable token -ErrorAction SilentlyContinue
    }
}

try {
    $apiTarget = Assert-LocalApiTarget -Value $ApiBaseUrl
    Assert-LocalSpaAvailable -ApiTarget $apiTarget
    $password = New-RandomPassword
    $passwordHash = New-BcryptHash -PlainText $password
    Invoke-SqlSeed -PasswordHash $passwordHash

    $rhSession = New-Session -Login "qa.feedback.rh.$runId"
    $managerSession = New-Session -Login "qa.feedback.gestor.$runId"
    $directorSession = New-Session -Login "qa.feedback.diretoria.$runId"
    $technicalSession = New-Session -Login "qa.feedback.tecnico.$runId"

    $questionnaireVersion = New-FictitiousQuestionnaireVersion -Session $technicalSession
    $ordinaryPassword = New-RandomPassword
    $ordinaryUser = Invoke-FictitiousUserAdministrationScenario -Session $technicalSession `
        -InitialPassword $ordinaryPassword

    $branch = Invoke-Api -Session $technicalSession -Method POST -Path '/master-data/branches' `
        -ExpectedStatus @(201) -Body @{ name = "Filial QA exclusão $runId" }
    $branchId = [guid]$branch.Body.id
    $activeBranchDeletion = Invoke-Api -Session $technicalSession -Method DELETE -Path "/master-data/branches/$branchId" `
        -ExpectedStatus @(409)
    Assert-Equal -Name 'Filial ativa não aceita exclusão física' -Actual $activeBranchDeletion.StatusCode -Expected 409
    $branchDeactivation = Invoke-Api -Session $technicalSession -Method PATCH `
        -Path "/master-data/branches/$branchId/deactivate" -ExpectedStatus @(204)
    Assert-Equal -Name 'Filial fictícia inativada' -Actual $branchDeactivation.StatusCode -Expected 204
    $branchDeletion = Invoke-Api -Session $technicalSession -Method DELETE -Path "/master-data/branches/$branchId" `
        -ExpectedStatus @(204)
    Assert-Equal -Name 'Filial fictícia excluída fisicamente' -Actual $branchDeletion.StatusCode -Expected 204

    $approvedVersions = @(
        (Invoke-Api -Session $technicalSession -Method GET -Path '/questionnaire-versions/approved').Body |
            Where-Object { @($_.configurationOptions).Count -gt 0 } |
            Select-Object -First 2
    )
    Assert-True -Name 'Duas versões aprovadas disponíveis para configurar ciclo fictício' -Condition ($approvedVersions.Count -eq 2)
    $draftConfiguration = New-CycleConfiguration -QuestionnaireVersions $approvedVersions -Name "Ciclo QA exclusão $runId"
    $draftCycle = Invoke-Api -Session $technicalSession -Method POST -Path '/evaluation-cycles' -ExpectedStatus @(201) `
        -Body @{ code = "QA-EXCLUSAO-$runId"; configuration = $draftConfiguration }
    $draftCycleId = [guid]$draftCycle.Body.cycleId
    $appliedQuestionnaires = @($draftCycle.Body.questionnaires)
    Assert-True -Name 'Ciclo fictício criado com dois questionários' -Condition ($appliedQuestionnaires.Count -eq 2)
    $keptQuestionnaire = @($appliedQuestionnaires | Where-Object {
        $_.questionnaireVersionId -ceq $approvedVersions[0].questionnaireVersionId
    }) | Select-Object -First 1
    $removedQuestionnaire = @($appliedQuestionnaires | Where-Object {
        $_.questionnaireVersionId -ceq $approvedVersions[1].questionnaireVersionId
    }) | Select-Object -First 1
    Assert-True -Name 'Questionários criados correspondem às versões aprovadas' -Condition (
        $null -ne $keptQuestionnaire -and $null -ne $removedQuestionnaire
    )
    $replacementConfiguration = New-CycleConfiguration -QuestionnaireVersions @($approvedVersions[0]) -Name "Ciclo QA exclusão $runId"
    $cycleReplacement = Invoke-Api -Session $technicalSession -Method PUT -Path "/evaluation-cycles/$draftCycleId" `
        -ExpectedStatus @(204) -Body @{ configuration = $replacementConfiguration }
    Assert-Equal -Name 'Configuração do ciclo fictício substituída' -Actual $cycleReplacement.StatusCode -Expected 204
    Assert-RestrictedPhysicalDeletions -BranchId $branchId -CycleId $draftCycleId `
        -RemovedCycleQuestionnaireId ([guid]$removedQuestionnaire.cycleQuestionnaireId) `
        -KeptCycleQuestionnaireId ([guid]$keptQuestionnaire.cycleQuestionnaireId)

    $legacyAssessments = Invoke-Api -Session $rhSession -Method GET -Path '/assessments?limit=100'
    Assert-True -Name 'Publicações históricas identificadas como feedback pendente' -Condition (
        @($legacyAssessments.Body.items | Where-Object { $_.status -ceq 'PUBLICADA' -and $_.feedbackStatus -ceq 'PENDENTE' }).Count -gt 0
    )

    $cycleId = Get-CycleId -Session $managerSession
    $managerOptions = Invoke-Api -Session $managerSession -Method GET -Path "/assessments/creation-options?cycleId=$cycleId"
    $managerTarget = @($managerOptions.Body.collaborators) | Select-Object -First 1
    $additionalManagerTargets = @($managerOptions.Body.collaborators | Select-Object -Skip 1 -First 4)
    Assert-True -Name 'Cinco colaboradores vinculados ao gestor para privacidade de indicadores' -Condition (
        $null -ne $managerTarget -and $additionalManagerTargets.Count -eq 4
    )

    $managerDraft = Create-Assessment -Session $managerSession -Type 'GESTOR' -CycleId $cycleId `
        -CollaboratorId ([guid]$managerTarget.id) -Prefix 'manager' -AssertIdempotentReplay
    $creationCollision = Invoke-Api -Session $managerSession -Method POST -Path '/assessments' `
        -ExpectedStatus @(409) -IdempotencyKey "manager-create-$runId" `
        -Body @{
            type = 'GESTOR'
            cycleId = [string]$cycleId
            collaboratorId = [string]$additionalManagerTargets[0].id
        }
    Assert-SafeProblem -Response $creationCollision -ExpectedCode 'IDEMPOTENCY_KEY_REUSED' `
        -Name 'Reuso da chave idempotente com outra solicitação rejeitado'
    $managerPublished = Publish-Assessment -Session $rhSession `
        -Submitted (Complete-Draft -Session $managerSession -Draft $managerDraft -Prefix 'manager' `
            -AssertIdempotencyAndRevision) `
        -Prefix 'manager' -ExpectedFeedbackStatus 'PENDENTE' -AssertIdempotentReplay
    $rhFeedback = Invoke-Api -Session $rhSession -Method POST -Path "/assessments/$($managerPublished.id)/feedback" `
        -ExpectedStatus @(403) -IdempotencyKey "rh-feedback-$runId" `
        -Body @{ feedbackDate = '2026-08-29'; comment = 'Tentativa não autorizada.' }
    Assert-Equal -Name 'RH não registra feedback de outro avaliador' -Actual $rhFeedback.StatusCode -Expected 403
    $directorFeedback = Invoke-Api -Session $directorSession -Method POST -Path "/assessments/$($managerPublished.id)/feedback" `
        -ExpectedStatus @(403) -IdempotencyKey "director-feedback-$runId" `
        -Body @{ feedbackDate = '2026-08-29'; comment = 'Tentativa não autorizada.' }
    Assert-Equal -Name 'Diretoria não registra feedback de outro avaliador' -Actual $directorFeedback.StatusCode -Expected 403
    $managerCompleted = Complete-Feedback -Session $managerSession -Published $managerPublished `
        -Prefix 'manager' -AssertIdempotentReplay

    $reopenBody = @{ reason = 'Reabertura automatizada para validar histórico.' }
    $reopenKey = "manager-reopen-$runId"
    $reopened = Invoke-Api -Session $rhSession -Method POST -Path "/assessments/$($managerCompleted.id)/reopen" `
        -IdempotencyKey $reopenKey -Body $reopenBody
    Assert-Equal -Name 'Avaliação reaberta' -Actual $reopened.Body.status -Expected 'RASCUNHO'
    $reopenedReplay = Invoke-Api -Session $rhSession -Method POST `
        -Path "/assessments/$($managerCompleted.id)/reopen" -IdempotencyKey $reopenKey -Body $reopenBody
    Assert-Equal -Name 'Repetição idempotente da reabertura mantém a avaliação' `
        -Actual $reopenedReplay.Body.id -Expected $reopened.Body.id
    Assert-Equal -Name 'Repetição idempotente da reabertura mantém a revisão' `
        -Actual $reopenedReplay.Body.revision -Expected $reopened.Body.revision
    $managerRepublished = Publish-Assessment -Session $rhSession `
        -Submitted (Complete-Draft -Session $managerSession -Draft $reopened.Body -Prefix 'manager-reopened') `
        -Prefix 'manager-reopened' -ExpectedFeedbackStatus 'PENDENTE'

    $additionalIndex = 0
    foreach ($additionalTarget in $additionalManagerTargets) {
        $additionalIndex++
        $prefix = "manager-indicator-$additionalIndex"
        $additionalDraft = Create-Assessment -Session $managerSession -Type 'GESTOR' -CycleId $cycleId `
            -CollaboratorId ([guid]$additionalTarget.id) -Prefix $prefix
        $additionalPublished = Publish-Assessment -Session $rhSession `
            -Submitted (Complete-Draft -Session $managerSession -Draft $additionalDraft -Prefix $prefix) `
            -Prefix $prefix -ExpectedFeedbackStatus 'PENDENTE'
        $null = Complete-Feedback -Session $managerSession -Published $additionalPublished -Prefix $prefix
    }

    $managerIndicators = Invoke-Api -Session $managerSession -Method GET `
        -Path "/indicators?cycleId=$cycleId&metric=FINAL_SCORE_AVERAGE" -ExpectedStatus @(403)
    Assert-Equal -Name 'Gestor não consulta indicadores agregados' -Actual $managerIndicators.StatusCode -Expected 403
    $overallIndicator = Invoke-Api -Session $rhSession -Method GET `
        -Path "/indicators?cycleId=$cycleId&metric=FINAL_SCORE_AVERAGE"
    if ($overallIndicator.Body -isnot [pscustomobject] -or $overallIndicator.Body.PSObject.Properties.Name -notcontains 'availability') {
        $bodyType = if ($null -eq $overallIndicator.Body) { 'null' } else { $overallIndicator.Body.GetType().FullName }
        $properties = if ($null -eq $overallIndicator.Body) { '' } else { @($overallIndicator.Body.PSObject.Properties.Name) -join ',' }
        throw "A resposta de indicadores não possui o contrato JSON esperado (tipo=$bodyType; propriedades=$properties)."
    }
    Assert-Equal -Name 'Indicador agregado disponível para RH' -Actual $overallIndicator.Body.availability -Expected 'AVAILABLE'
    Assert-True -Name 'Indicador agregado não expõe contagem' -Condition (
        $overallIndicator.RawContent -notmatch '(?i)count|collaborator|colaborador'
    )
    $indicatorOptions = Invoke-Api -Session $rhSession -Method GET -Path "/indicators/options?cycleId=$cycleId"
    Assert-Equal -Name 'Filial com menos de cinco colaboradores é suprimida nas opções' `
        -Actual @($indicatorOptions.Body.branches).Count -Expected 0
    $individualIndicator = Invoke-Api -Session $rhSession -Method GET `
        -Path "/indicators?cycleId=$cycleId&metric=FINAL_SCORE_AVERAGE&collaboratorId=$($managerTarget.id)"
    Assert-Equal -Name 'Filtro individual recebe somente dados insuficientes' `
        -Actual $individualIndicator.Body.availability -Expected 'INSUFFICIENT_DATA'
    Assert-True -Name 'Resposta suprimida não contém resultado agregado' -Condition (
        $individualIndicator.RawContent -notmatch '(?i)averageScore|classificationDistribution|count|colaborador'
    )
    $indicatorExport = Invoke-Api -Session $rhSession -Method POST -Path '/indicators/exports' -ExpectedStatus @(200) `
        -Body @{ cycleId = [string]$cycleId; metric = 'FINAL_SCORE_AVERAGE' }
    Assert-True -Name 'Exportação CSV agregada disponível para RH' -Condition (
        ([string]$indicatorExport.Headers['Content-Type']) -match '(?i)^text/csv' -and
        $indicatorExport.RawContent -match '^metric,value' -and
        $indicatorExport.RawContent -notmatch '(?i)count|collaborator|colaborador|cycleId'
    )
    $rateLimited = $false
    for ($attempt = 1; $attempt -le 101; $attempt++) {
        $attemptResponse = Invoke-Api -Session $rhSession -Method GET `
            -Path "/indicators?cycleId=$cycleId&metric=FINAL_SCORE_AVERAGE" -ExpectedStatus @(200, 429)
        if ($attemptResponse.StatusCode -eq 429) {
            $rateLimited = $true
            break
        }
    }
    Assert-True -Name 'Limite de consultas de indicadores é aplicado ao ator autenticado' -Condition $rateLimited
    Assert-IndicatorDatabaseState -CycleId $cycleId

    $directorOptions = Invoke-Api -Session $directorSession -Method GET -Path "/assessments/director-creation-options?cycleId=$cycleId"
    $directorTarget = @($directorOptions.Body.collaborators) | Select-Object -First 1
    Assert-True -Name 'Gerência vinculada à Diretoria' -Condition ($null -ne $directorTarget)
    $directorDraft = Create-Assessment -Session $directorSession -Type 'DIRETORIA_GERENCIA' -CycleId $cycleId `
        -CollaboratorId ([guid]$directorTarget.id) -Prefix 'director'
    $directorPublished = Publish-Assessment -Session $rhSession `
        -Submitted (Complete-Draft -Session $directorSession -Draft $directorDraft -Prefix 'director') `
        -Prefix 'director' -ExpectedFeedbackStatus 'PENDENTE'
    $null = Complete-Feedback -Session $directorSession -Published $directorPublished -Prefix 'director'

    $selfDraft = Create-Assessment -Session $managerSession -Type 'AUTOAVALIACAO' -CycleId $cycleId -Prefix 'self'
    $selfPublished = Publish-Assessment -Session $rhSession `
        -Submitted (Complete-Draft -Session $managerSession -Draft $selfDraft -Prefix 'self') `
        -Prefix 'self' -ExpectedFeedbackStatus 'NAO_APLICAVEL'
    $selfFeedback = Invoke-Api -Session $managerSession -Method POST -Path "/assessments/$($selfPublished.id)/feedback" `
        -ExpectedStatus @(403, 422) -IdempotencyKey "self-feedback-$runId" `
        -Body @{ feedbackDate = '2026-08-29'; comment = 'Feedback não aplicável.' }
    Assert-True -Name 'Autoavaliação não aceita feedback' -Condition ($selfFeedback.StatusCode -in @(403, 422))

    $technicalAccess = Invoke-Api -Session $technicalSession -Method GET -Path '/assessments?limit=1' -ExpectedStatus @(403)
    Assert-Equal -Name 'Administrador técnico sem acesso a avaliações' -Actual $technicalAccess.StatusCode -Expected 403
    Assert-RefreshTokenPersisted -Session $technicalSession
    $technicalRefresh = Invoke-RefreshSession -Session $technicalSession
    Assert-Equal -Name 'Renovação de sessão rotativa aceita' -Actual $technicalRefresh -Expected 204
    $technicalCurrentUser = Invoke-Api -Session $technicalSession -Method GET -Path '/auth/me'
    Assert-True -Name 'Sessão renovada permanece autenticada' -Condition ($null -ne $technicalCurrentUser.Body.id)
    $technicalLogout = Invoke-Api -Session $technicalSession -Method DELETE -Path '/auth/sessions/current' -ExpectedStatus @(204)
    Assert-Equal -Name 'Logout revoga a sessão atual' -Actual $technicalLogout.StatusCode -Expected 204
    $technicalAfterLogout = Invoke-Api -Session $technicalSession -Method GET -Path '/auth/me' -ExpectedStatus @(401)
    Assert-Equal -Name 'Sessão encerrada não autentica novamente' -Actual $technicalAfterLogout.StatusCode -Expected 401
    Assert-FeedbackDatabaseState
    Assert-ExpandedRepositoryDatabaseState -UserId ([guid]$ordinaryUser.Id) `
        -UserLogin $ordinaryUser.Login `
        -QuestionnaireVersionId ([guid]$questionnaireVersion.questionnaireVersionId) `
        -CalculationConfigurationVersionId ([guid]$questionnaireVersion.calculationConfigurationVersionId) `
        -ClassificationMatrixVersionId ([guid]$questionnaireVersion.classificationMatrixVersionId) `
        -PrimaryAssessmentId ([guid]$managerRepublished.id)

    Write-Host "Teste autenticado dos repositórios, concorrência, feedback, indicadores, sessão e exclusões restritas em DEV concluído com sucesso (execução $runId)."
}
finally {
    Remove-Variable ordinaryPassword -ErrorAction SilentlyContinue
    Remove-Variable passwordHash -ErrorAction SilentlyContinue
    Remove-Variable password -ErrorAction SilentlyContinue
    [Environment]::SetEnvironmentVariable('ADC_E2E_EPHEMERAL_PASSWORD', $null, 'Process')
}

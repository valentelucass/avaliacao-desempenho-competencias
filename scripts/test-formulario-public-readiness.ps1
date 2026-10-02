Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PublicHeader {
    param([Collections.IDictionary]$Headers, [string]$Name)
    if ($Headers.Contains($Name)) { return [string]::Join(', ', [string[]]@($Headers[$Name])) }
    return ''
}

function Get-PublicSecurityFlags {
    param([Collections.IDictionary]$Headers)
    $csp = Get-PublicHeader $Headers 'Content-Security-Policy'
    $hsts = Get-PublicHeader $Headers 'Strict-Transport-Security'
    return [pscustomobject]@{
        NoSniff = ((Get-PublicHeader $Headers 'X-Content-Type-Options') -ieq 'nosniff')
        FrameDenied = ((Get-PublicHeader $Headers 'X-Frame-Options') -ieq 'DENY')
        ReferrerNoReferrer = ((Get-PublicHeader $Headers 'Referrer-Policy') -ieq 'no-referrer')
        CspPresent = (-not [string]::IsNullOrWhiteSpace($csp))
        CspFrameAncestorsNone = ($csp -match "(?:^|;)\s*frame-ancestors\s+'none'(?:\s*;|$)")
        CspConnectAllowsExactApi = ($csp -match '(?:^|;)\s*connect-src\s+[^;]*https://api-formulario\.rodogarcia\.com\.br(?:\s|;|$)')
        HstsOneYear = ($hsts -match '(?:^|;)\s*max-age=31536000(?:\s*;|$)')
        NoStore = ((Get-PublicHeader $Headers 'Cache-Control') -match '(?:^|,)\s*no-store(?:\s*,|$)')
        CorsExactFrontend = ((Get-PublicHeader $Headers 'Access-Control-Allow-Origin') -ceq 'https://formulario.rodogarcia.com.br')
        CorsAllowsCredentials = ((Get-PublicHeader $Headers 'Access-Control-Allow-Credentials') -ieq 'true')
    }
}

function Get-PublicCsrfCookieFlags {
    param([string[]]$SetCookie)
    $csrf = @()
    $authIssued = $false
    foreach ($line in $SetCookie) {
        $parts = @($line.Split(';'))
        $separator = $parts[0].IndexOf('=')
        if ($separator -lt 1) { continue }
        $name = $parts[0].Substring(0, $separator).Trim()
        $attributes = @($parts | Select-Object -Skip 1 | ForEach-Object { $_.Trim().ToLowerInvariant() })
        if ($name -cin @('ADC-ACCESS', 'ADC-REFRESH')) { $authIssued = $true }
        if ($name -ceq 'ADC-XSRF-TOKEN') {
            $csrf += [pscustomobject]@{
                Secure = ($attributes -contains 'secure')
                HttpOnly = ($attributes -contains 'httponly')
                SameSiteStrict = ($attributes -contains 'samesite=strict')
                HostOnly = (@($attributes | Where-Object { $_.StartsWith('domain=') }).Count -eq 0)
                PathRoot = ($attributes -contains 'path=/')
            }
        }
    }
    return [pscustomobject]@{
        CsrfCookiePresent = ($csrf.Count -gt 0)
        CsrfCookieSecure = ($csrf.Count -gt 0 -and @($csrf | Where-Object { -not $_.Secure }).Count -eq 0)
        CsrfCookieSameSiteStrict = ($csrf.Count -gt 0 -and @($csrf | Where-Object { -not $_.SameSiteStrict }).Count -eq 0)
        CsrfCookieHostOnly = ($csrf.Count -gt 0 -and @($csrf | Where-Object { -not $_.HostOnly }).Count -eq 0)
        CsrfCookiePathRoot = ($csrf.Count -gt 0 -and @($csrf | Where-Object { -not $_.PathRoot }).Count -eq 0)
        CsrfCookieJsReadable = ($csrf.Count -gt 0 -and @($csrf | Where-Object { $_.HttpOnly }).Count -eq 0)
        AuthenticationCookieIssuedWithoutLogin = $authIssued
    }
}

function Get-PublicCsrfBodyFlag {
    param([string]$Body)
    try {
        $document = $Body | ConvertFrom-Json -ErrorAction Stop
        $property = $document.PSObject.Properties['token']
        return ($null -ne $property -and $property.Value -is [string] -and $property.Value.Length -gt 0)
    } catch { return $false }
}

function Get-PublicHttpResponseInMemory {
    param([object]$Client, [string]$Url, [ValidateSet('GET', 'OPTIONS')][string]$Method = 'GET',
        [string]$Origin = '', [switch]$ReadBody)
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), $Url)
    $response = $null
    try {
        if ($Origin) { [void]$request.Headers.TryAddWithoutValidation('Origin', $Origin) }
        if ($Method -ceq 'OPTIONS') {
            [void]$request.Headers.TryAddWithoutValidation('Access-Control-Request-Method', 'POST')
            [void]$request.Headers.TryAddWithoutValidation('Access-Control-Request-Headers', 'Content-Type,X-CSRF-TOKEN')
        }
        $response = $Client.SendAsync($request, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        $headers = @{}
        foreach ($header in $response.Headers) { $headers[$header.Key] = @($header.Value) }
        foreach ($header in $response.Content.Headers) { $headers[$header.Key] = @($header.Value) }
        $body = ''
        if ($ReadBody) {
            $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            $reader = [IO.StreamReader]::new($stream, [Text.UTF8Encoding]::new($false, $true))
            try {
                $builder = [Text.StringBuilder]::new()
                $buffer = [char[]]::new(8192)
                $bodyWatch = [Diagnostics.Stopwatch]::StartNew()
                while ($true) {
                    $remaining = 8000 - [int]$bodyWatch.ElapsedMilliseconds
                    if ($remaining -lt 1) { throw 'Tempo de resposta excede limite.' }
                    $readTask = $reader.ReadAsync($buffer, 0, $buffer.Length)
                    if (-not $readTask.Wait($remaining)) { throw 'Tempo de resposta excede limite.' }
                    $count = $readTask.GetAwaiter().GetResult()
                    if ($count -eq 0) { break }
                    if ($builder.Length + $count -gt 2097152) { throw 'Resposta excede limite.' }
                    [void]$builder.Append($buffer, 0, $count)
                }
                $body = $builder.ToString()
            } finally { $reader.Dispose() }
        }
        return [pscustomobject]@{ Status = [int]$response.StatusCode; TransportSucceeded = $true; Headers = $headers; Body = $body }
    } catch {
        return [pscustomobject]@{ Status = 0; TransportSucceeded = $false; Headers = @{}; Body = '' }
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
    }
}

function Test-FormularioPublicReadiness {
    Add-Type -AssemblyName System.Net.Http
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.UseProxy = $false
    $handler.UseCookies = $false
    $handler.AllowAutoRedirect = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(8)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('Rodogarcia-Readiness/1.0')
    $html = $null
    $bundle = $null
    $csrf = $null
    try {
        $html = Get-PublicHttpResponseInMemory -Client $client -Url 'https://formulario.rodogarcia.com.br/' -ReadBody
        $htmlFlags = Get-PublicSecurityFlags $html.Headers
        $asset = [regex]::Match($html.Body, '<script\b[^>]*\bsrc=["''](?<asset>/assets/[A-Za-z0-9._-]+\.js)["'']')
        $bundleStatus = 0
        $apiBaseCorrect = $false
        $loopbackApiPresent = $false
        if ($html.Status -eq 200 -and $asset.Success) {
            $bundle = Get-PublicHttpResponseInMemory -Client $client `
                -Url ('https://formulario.rodogarcia.com.br' + $asset.Groups['asset'].Value) -ReadBody
            $bundleStatus = $bundle.Status
            $apiBaseCorrect = $bundle.Body.Contains('https://api-formulario.rodogarcia.com.br/api/v1')
            $loopbackApiPresent = ($bundle.Body -match 'https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/api/v1')
        }
        $csrf = Get-PublicHttpResponseInMemory -Client $client -Url 'https://api-formulario.rodogarcia.com.br/api/v1/auth/csrf' `
            -Origin 'https://formulario.rodogarcia.com.br' -ReadBody
        $csrfFlags = Get-PublicSecurityFlags $csrf.Headers
        $cookies = if ($csrf.Headers.Contains('Set-Cookie')) { [string[]]@($csrf.Headers['Set-Cookie']) } else { [string[]]@() }
        $cookieFlags = Get-PublicCsrfCookieFlags -SetCookie $cookies
        $preflight = Get-PublicHttpResponseInMemory -Client $client -Method OPTIONS `
            -Url 'https://api-formulario.rodogarcia.com.br/api/v1/auth/sessions' -Origin 'https://formulario.rodogarcia.com.br'
        $preflightFlags = Get-PublicSecurityFlags $preflight.Headers
        $deniedOrigin = Get-PublicHttpResponseInMemory -Client $client -Method OPTIONS `
            -Url 'https://api-formulario.rodogarcia.com.br/api/v1/auth/sessions' -Origin 'https://readiness-invalid.example.invalid'
        $anonymous = Get-PublicHttpResponseInMemory -Client $client `
            -Url 'https://api-formulario.rodogarcia.com.br/api/v1/auth/me' -Origin 'https://formulario.rodogarcia.com.br'
        return [pscustomobject]@{
            FrontendHttp = $html.Status
            FrontendTlsValidatedByDefault = $html.TransportSucceeded
            FrontendHtmlShellPresent = ($html.Status -eq 200 -and $html.Body -match '<div\s+id=["'']root["'']')
            FrontendBundleHttp = $bundleStatus
            PublicApiBaseInBundleExact = $apiBaseCorrect
            LoopbackApiUrlInPublicBundle = $loopbackApiPresent
            FrontendHeaders = $htmlFlags
            CsrfHttp = $csrf.Status
            CsrfTlsValidatedByDefault = $csrf.TransportSucceeded
            CsrfJsonValuePresent = (Get-PublicCsrfBodyFlag -Body $csrf.Body)
            CsrfHeaders = $csrfFlags
            CsrfCookies = $cookieFlags
            PreflightHttp = $preflight.Status
            PreflightAllowsExactOriginAndCredentials = ($preflight.Status -in @(200, 204) -and
                $preflightFlags.CorsExactFrontend -and $preflightFlags.CorsAllowsCredentials)
            UnlistedOriginDenied = ($deniedOrigin.Status -eq 403 -and
                [string]::IsNullOrEmpty((Get-PublicHeader $deniedOrigin.Headers 'Access-Control-Allow-Origin')))
            AnonymousMeHttp = $anonymous.Status
            AnonymousMeDenied = ($anonymous.Status -eq 401)
            OperationalPostSent = $false
            AuthenticationAttempted = $false
            BodiesAndCookieValuesReturned = $false
        }
    } finally {
        $html = $null; $bundle = $null; $csrf = $null; $cookies = $null
        $preflight = $null; $deniedOrigin = $null; $anonymous = $null
        $client.Dispose(); $handler.Dispose()
    }
}

if ($MyInvocation.InvocationName -eq '.') { return }
Test-FormularioPublicReadiness | ConvertTo-Json -Depth 5

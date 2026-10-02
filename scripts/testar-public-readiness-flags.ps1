Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'test-formulario-public-readiness.ps1')
$passed = 0
$headers = @{
    'Content-Security-Policy' = "default-src 'self'; connect-src 'self' https://api-formulario.rodogarcia.com.br; frame-ancestors 'none'"
    'Strict-Transport-Security' = 'max-age=31536000'
    'X-Content-Type-Options' = 'nosniff'
    'X-Frame-Options' = 'DENY'
    'Referrer-Policy' = 'no-referrer'
    'Cache-Control' = 'no-cache, no-store, max-age=0, must-revalidate'
    'Access-Control-Allow-Origin' = 'https://formulario.rodogarcia.com.br'
    'Access-Control-Allow-Credentials' = 'true'
}
$result = Get-PublicSecurityFlags $headers
if (-not $result.NoSniff -or -not $result.FrameDenied -or -not $result.HstsOneYear -or
    -not $result.CspConnectAllowsExactApi -or -not $result.CspFrameAncestorsNone -or
    -not $result.CorsExactFrontend -or -not $result.CorsAllowsCredentials -or -not $result.NoStore) {
    throw 'Flags ficticios de seguranca divergentes.'
}
$passed++
$headers['Access-Control-Allow-Origin'] = '*'
$headers['Content-Security-Policy'] = "connect-src https://api-formulario.rodogarcia.com.br.unexpected.invalid; frame-ancestors 'self'"
$result = Get-PublicSecurityFlags $headers
if ($result.CorsExactFrontend -or $result.CspConnectAllowsExactApi -or $result.CspFrameAncestorsNone) {
    throw 'Coringa, dominio parecido ou framing indevido passou.'
}
$passed++
$cookies = Get-PublicCsrfCookieFlags @('ADC-XSRF-TOKEN=FIXTURE-PRIVATE-NONSECRET; Path=/; Secure; SameSite=Strict')
if (-not $cookies.CsrfCookiePresent -or -not $cookies.CsrfCookieSecure -or -not $cookies.CsrfCookieHostOnly -or
    -not $cookies.CsrfCookieSameSiteStrict -or -not $cookies.CsrfCookieJsReadable -or
    $cookies.AuthenticationCookieIssuedWithoutLogin) { throw 'Cookie CSRF ficticio seguro nao reconhecido.' }
if (($cookies | ConvertTo-Json) -match 'FIXTURE-PRIVATE') { throw 'Projecao revelou valor ficticio.' }
$passed++
$cookies = Get-PublicCsrfCookieFlags @('ADC-XSRF-TOKEN=FIXTURE-PRIVATE-NONSECRET; Domain=rodogarcia.com.br; Path=/; HttpOnly',
    'ADC-ACCESS=FIXTURE-PRIVATE-NONSECRET; Path=/; Secure; HttpOnly; SameSite=Strict')
if ($cookies.CsrfCookieSecure -or $cookies.CsrfCookieHostOnly -or $cookies.CsrfCookieSameSiteStrict -or
    $cookies.CsrfCookieJsReadable -or -not $cookies.AuthenticationCookieIssuedWithoutLogin) { throw 'Cookie divergente passou.' }
$passed++
if (-not (Get-PublicCsrfBodyFlag '{"token":"FIXTURE-PRIVATE-NONSECRET"}') -or
    (Get-PublicCsrfBodyFlag '{"token":null}') -or (Get-PublicCsrfBodyFlag '{"FIXTURE-PRIVATE": INVALID }')) {
    throw 'Flag JSON CSRF divergente ou erro nao saneado.'
}
$passed++
Write-Host "Readiness publico: $passed cenarios ficticios aprovados; nenhuma requisicao externa, credencial ou dado pessoal."

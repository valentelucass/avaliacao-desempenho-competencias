Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'read-cloudflare-connector-routes.ps1')

$passed = 0
function New-FakeConfig {
    param([object[]]$Rules, [int]$Version = 0)
    return (@{ version = $Version; config = @{ ingress = $Rules;
                originRequest = @{ fixturePrivateValue = 'FIXTURE-PRIVATE-NOT-FOR-PROJECTION' } } } | ConvertTo-Json -Depth 8)
}
function Assert-FakeConfigRejected {
    param([string]$Json)
    try { [void](Get-CloudflareIngressProjection -ConfigJson $Json) }
    catch {
        if ($_.Exception.Message -match 'FIXTURE-PRIVATE|fixture-user|fixture-password|unexpected-host') {
            throw 'Erro revelou conteudo ficticio privado.'
        }
        $script:passed++
        return
    }
    throw 'Configuracao ficticia divergente nao foi recusada.'
}
$catchAll = @{ service = 'http_status:404'; hostname = ''; path = $null }
$form = @{ hostname = 'formulario.rodogarcia.com.br'; service = 'http://127.0.0.1:18080'; path = $null }
$selia = @{ hostname = 'satelite-api.rodogarcia.com.br'; service = 'http://127.0.0.1:19090';
    path = '^/api/selia/intelipost/pre-shipment-list$' }
$fullRules = @(
    @{ hostname = 'analytics.rodogarcia.com.br'; service = 'http://localhost:5173' },
    @{ hostname = 'api-analytics.rodogarcia.com.br'; service = 'http://127.0.0.1:5010' },
    @{ hostname = 'site.rodogarcia.com.br'; service = 'http://[::1]:6060' },
    @{ hostname = 'sitebackend.rodogarcia.com.br'; service = 'http://127.0.0.1:6050' },
    $form,
    @{ hostname = 'api-formulario.rodogarcia.com.br'; service = 'http://127.0.0.1:18081' },
    $selia,
    $catchAll
)
$result = Get-CloudflareIngressProjection -ConfigJson (New-FakeConfig -Rules $fullRules)
$encoded = $result | ConvertTo-Json -Depth 6
if (-not $result.AllDocumentedHostnamesPresent -or $result.Routes.Count -ne 8 -or
    $encoded -match 'FIXTURE-PRIVATE|originRequest' -or $result.Routes[6].Path -cne $selia.path) {
    throw 'Projecao ficticia completa invalida.'
}
$passed++
$result = Get-CloudflareIngressProjection -ConfigJson (New-FakeConfig -Rules @($form, $catchAll))
if ($result.AllDocumentedHostnamesPresent -or $result.DocumentedHostnamesMissing.Count -ne 6 -or
    $result.Routes[0].Order -ne 0 -or $result.Routes[1].Order -ne 1) {
    throw 'Projecao parcial ou ordem invalida.'
}
$passed++
foreach ($entry in @(@{ host = 'formulario.rodogarcia.com.br'; port = 38080 },
        @{ host = 'api-formulario.rodogarcia.com.br'; port = 28081 })) {
    [void](Get-CloudflareIngressProjection -ConfigJson (New-FakeConfig -Rules @(
                @{ hostname = $entry.host; service = ('http://localhost:{0}' -f $entry.port) }, $catchAll)))
    $passed++
}
foreach ($badRule in @(
        @{ hostname = 'unexpected-host'; service = 'http://127.0.0.1:18080' },
        @{ hostname = '*'; service = 'http://127.0.0.1:18080' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = 'http://192.0.2.1:18080' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = 'http://127.0.0.2:18080' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = 'http://127.0.0.1:5173' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = 'https://127.0.0.1:18080' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = 'http://fixture-user:fixture-password@127.0.0.1:18080' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = 'http://127.0.0.1:18080/?fixture=FIXTURE-PRIVATE' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = 'http://127.0.0.1:18080/#FIXTURE-PRIVATE' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = 'http://127.0.0.1:18080/other' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = 'http://127.0.0.1:18080'; path = '^/other$' },
        @{ hostname = 'satelite-api.rodogarcia.com.br'; service = 'http://127.0.0.1:19090'; path = '' },
        @{ hostname = 'satelite-api.rodogarcia.com.br'; service = 'http://127.0.0.1:19090'; path = '/api/selia/intelipost/pre-shipment-list' },
        @{ hostname = 'formulario.rodogarcia.com.br'; service = @{ bad = 'FIXTURE-PRIVATE' } }
    )) {
    Assert-FakeConfigRejected -Json (New-FakeConfig -Rules @($badRule, $catchAll))
}
Assert-FakeConfigRejected -Json (New-FakeConfig -Rules @($form, $form, $catchAll))
Assert-FakeConfigRejected -Json (New-FakeConfig -Rules @($form, @{ service = 'http_status:503' }))
Assert-FakeConfigRejected -Json (New-FakeConfig -Rules @($form, @{ service = 'http_status:404'; hostname = '*' }))
Assert-FakeConfigRejected -Json (New-FakeConfig -Rules @($catchAll, $form))
Assert-FakeConfigRejected -Json (New-FakeConfig -Rules @($form, $catchAll) -Version -1)
Assert-FakeConfigRejected -Json '{"version":0,"config":{"ingress":"FIXTURE-PRIVATE"}}'
Assert-FakeConfigRejected -Json '{"FIXTURE-PRIVATE": INVALID }'
Assert-FakeConfigRejected -Json '{"version":"0","config":{"ingress":[]}}'
Write-Host "Rotas Cloudflare: $passed cenarios ficticios aprovados; nenhuma chamada externa, processo ou credencial."

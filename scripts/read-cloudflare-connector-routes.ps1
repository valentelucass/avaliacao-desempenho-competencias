Set-StrictMode -Version Latest

# Biblioteca pura: o root le /config no listener loopback do proprio PID.
# Nao passar a resposta JSON pela linha de comando nem imprimir o corpo recebido.
function Get-CloudflareIngressProjection {
    param([Parameter(Mandatory)][string]$ConfigJson)

    if ([string]::IsNullOrWhiteSpace($ConfigJson) -or $ConfigJson.Length -gt 1048576) {
        throw 'Configuracao remota recusada por tamanho.'
    }
    try { $document = $ConfigJson | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Configuracao remota invalida; conteudo omitido.' }
    if ($document -isnot [pscustomobject]) { throw 'Objeto de configuracao remota ausente.' }
    $versionProperty = $document.PSObject.Properties['version']
    $configProperty = $document.PSObject.Properties['config']
    if ($null -eq $versionProperty -or
        ($versionProperty.Value -isnot [int] -and $versionProperty.Value -isnot [long]) -or
        $versionProperty.Value -lt 0 -or $versionProperty.Value -gt [int]::MaxValue) {
        throw 'Versao remota ainda nao recebida ou invalida.'
    }
    if ($null -eq $configProperty -or $configProperty.Value -isnot [pscustomobject]) {
        throw 'Objeto de ingress remoto ausente.'
    }
    $ingressProperty = $configProperty.Value.PSObject.Properties['ingress']
    if ($null -eq $ingressProperty -or $ingressProperty.Value -isnot [Array]) {
        throw 'Lista de ingress remoto ausente.'
    }
    $rules = @($ingressProperty.Value)
    if ($rules.Count -lt 2 -or $rules.Count -gt 32) { throw 'Quantidade de rotas recusada.' }
    $portsByHostname = [ordered]@{
        'analytics.rodogarcia.com.br' = @(5173)
        'api-analytics.rodogarcia.com.br' = @(5010)
        'site.rodogarcia.com.br' = @(6060)
        'sitebackend.rodogarcia.com.br' = @(6050)
        'formulario.rodogarcia.com.br' = @(18080, 38080)
        'api-formulario.rodogarcia.com.br' = @(18081, 28081)
        'satelite-api.rodogarcia.com.br' = @(19090)
    }
    $seliaPath = '^/api/selia/intelipost/pre-shipment-list$'
    $projection = @()
    $seen = @()
    for ($index = 0; $index -lt $rules.Count; $index++) {
        $rule = $rules[$index]
        if ($rule -isnot [pscustomobject]) { throw 'Objeto de rota recusado.' }
        $hostnameProperty = $rule.PSObject.Properties['hostname']
        $pathProperty = $rule.PSObject.Properties['path']
        $serviceProperty = $rule.PSObject.Properties['service']
        if ($null -eq $serviceProperty -or $serviceProperty.Value -isnot [string]) {
            throw 'Servico de origem invalido; conteudo omitido.'
        }
        if (($null -ne $hostnameProperty -and $null -ne $hostnameProperty.Value -and
                $hostnameProperty.Value -isnot [string]) -or
            ($null -ne $pathProperty -and $null -ne $pathProperty.Value -and $pathProperty.Value -isnot [string])) {
            throw 'Hostname ou path de rota invalido; conteudo omitido.'
        }
        $hostname = if ($null -eq $hostnameProperty) { '' } else { [string]$hostnameProperty.Value }
        $path = if ($null -eq $pathProperty) { '' } else { [string]$pathProperty.Value }
        $service = [string]$serviceProperty.Value
        if ($index -eq $rules.Count - 1) {
            if ($hostname -cne '' -or $path -cne '' -or $service -cne 'http_status:404') {
                throw 'Catch-all final global 404 ausente ou divergente.'
            }
            $projection += [pscustomobject]@{ Order = $index; Hostname = ''; Path = ''; Service = 'http_status:404' }
            continue
        }
        $hostname = $hostname.ToLowerInvariant()
        if (-not $portsByHostname.Contains($hostname) -or $hostname -in $seen) {
            throw 'Hostname nao documentado ou duplicado; conteudo omitido.'
        }
        if (($hostname -ceq 'satelite-api.rodogarcia.com.br' -and $path -cne $seliaPath) -or
            ($hostname -cne 'satelite-api.rodogarcia.com.br' -and $path -cne '')) {
            throw 'Restricao de path remoto divergente; conteudo omitido.'
        }
        $uri = $null
        if (-not [Uri]::TryCreate($service, [UriKind]::Absolute, [ref]$uri)) {
            throw 'Origem fora do loopback ou do inventario permitido; conteudo omitido.'
        }
        $originDns = $uri.DnsSafeHost.ToLowerInvariant()
        $originAddress = $null
        if ([Net.IPAddress]::TryParse($originDns, [ref]$originAddress) -and
            $originAddress.Equals([Net.IPAddress]::IPv6Loopback)) { $originDns = '::1' }
        if (
            $uri.Scheme -cne 'http' -or $uri.UserInfo -cne '' -or $uri.Query -cne '' -or
            $uri.Fragment -cne '' -or $uri.AbsolutePath -cne '/' -or
            $originDns -notin @('localhost', '127.0.0.1', '::1') -or
            $uri.Port -notin $portsByHostname[$hostname]) {
            throw 'Origem fora do loopback ou do inventario permitido; conteudo omitido.'
        }
        # Reconstrucao a partir de valores validados: nunca propaga UserInfo/originRequest.
        $originHost = if ($originDns -ceq '::1') { '[::1]' } else { $originDns }
        $projection += [pscustomobject]@{
            Order = $index
            Hostname = $hostname
            Path = $path
            Service = 'http://{0}:{1}' -f $originHost, $uri.Port
        }
        $seen += $hostname
    }
    $missing = @($portsByHostname.Keys | Where-Object { $_ -notin $seen })
    return [pscustomobject]@{
        Version = [int]$versionProperty.Value
        RemoteConfigurationReceived = $true
        IngressAllowlistValidated = $true
        AllDocumentedHostnamesPresent = ($missing.Count -eq 0)
        DocumentedHostnamesMissing = $missing
        Routes = $projection
    }
}

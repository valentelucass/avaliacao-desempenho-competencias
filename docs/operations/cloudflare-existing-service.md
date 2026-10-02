# Persistencia do conector existente na nova VM

Alvo exclusivo: `WIN-00NEDIJ1R5P`, tunel `da4be1b8-b8dd-425b-b059-4702bf603471`. O preparo recusa a origem `RTR-SVW-002` por nome **ou** MachineGuid, usando o manifesto privado em `C:\CloudflareMigracao`. Os identificadores de maquina nao sao impressos. Execute o registro em Windows PowerShell 5.1 administrativo com a mesma conta que preparou os arquivos privados.

O conector standalone confirmado nesta recuperacao recebeu a versao remota 27, as sete rotas documentadas, a restricao SELIA exata e o catch-all final 404. `/ready` confirmou conexao com a Cloudflare. Isso nao comprova a saude das aplicacoes locais nem acesso ao SQL Server.

O preparador padrao e somente leitura. Confere alvo, token-file privado e UUID, hash/assinatura do EXE 2026.9.3, caminhos sem reparse, logs privados e ausencia de servico/fonte de eventos/recibo preexistentes. Nao muda SQL, PM2, DNS, firewall, portproxy, ambiente global ou processos.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-cloudflare-windows-service.ps1 -ExpectedTunnelId da4be1b8-b8dd-425b-b059-4702bf603471
```

Para registrar, use o console administrativo. A opcao abaixo cria somente o servico `Cloudflared` **Manual e parado** e a fonte de eventos correspondente. O token permanece no arquivo externo privado; argumentos e eventos contem somente seu caminho. O recibo privado e publicado apenas depois de confirmar SCM parado, Manual, conta LocalSystem e binPath exato.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-cloudflare-windows-service.ps1 -ExpectedTunnelId da4be1b8-b8dd-425b-b059-4702bf603471 -InstallStopped
```

Nao usar o instalador do pacote nem `cloudflared service install`: esse fluxo inicia o servico automaticamente. A [implementacao oficial 2026.9.3](https://github.com/cloudflare/cloudflared/blob/2026.9.3/cmd/cloudflared/windows_service.go) aceita os argumentos do ImagePath para `tunnel ... run --token-file` e registra esses argumentos no EventLog.

Inicie somente o servico recem-registrado e valide-o em seguida. O standalone atual permanece conectado durante essa verificacao.

```powershell
. ./scripts/prepare-cloudflare-windows-service.ps1 -ExpectedTunnelId da4be1b8-b8dd-425b-b059-4702bf603471
$plan = Get-CloudflareServicePlan
Assert-CloudflareServiceVmTarget -TunnelId ([Guid]'da4be1b8-b8dd-425b-b059-4702bf603471')
Assert-CloudflarePrivateAcl -Path $plan.Receipt
Assert-CloudflareRegisteredServiceStopped -Plan $plan
Start-Service -Name Cloudflared -ErrorAction Stop
```

Execute a verificacao abaixo depois da inicializacao. Se metricas ou conexao ainda nao estiverem prontas, repita somente esta verificacao, sem reiniciar processos.

```powershell
. ./scripts/read-cloudflare-connector-routes.ps1
$projection = $null
$allServiceChecksPassed = $false
$service = @(Get-CimInstance Win32_Service -Filter "Name='Cloudflared'")
if ($service.Count -ne 1 -or $service[0].State -cne 'Running' -or
    $service[0].StartName -cne 'LocalSystem' -or $service[0].PathName -cne $plan.BinPath) {
    throw 'Servico iniciado nao corresponde ao registro esperado; valores omitidos.'
}
$servicePid = [int]$service[0].ProcessId
$serviceProcess = Get-Process -Id $servicePid -ErrorAction Stop
if ($serviceProcess.Path -ine $plan.Executable) { throw 'Executavel do servico divergente.' }
$serviceStartTicks = $serviceProcess.StartTime.ToUniversalTime().Ticks
$listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $servicePid -ErrorAction Stop)
if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -cne '127.0.0.1') {
    throw 'Listener de metricas proprio em loopback nao confirmado.'
}
$metrics = 'http://127.0.0.1:' + $listeners[0].LocalPort
Add-Type -AssemblyName System.Net.Http
$handler = [Net.Http.HttpClientHandler]::new()
$handler.UseProxy = $false
$handler.AllowAutoRedirect = $false
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(5)
$body = $null
try {
    $ready = $client.GetAsync($metrics + '/ready').GetAwaiter().GetResult()
    if ([int]$ready.StatusCode -ne 200) { throw 'Servico sem conexao pronta com a Cloudflare.' }
    $config = $client.GetAsync($metrics + '/config').GetAwaiter().GetResult()
    if ([int]$config.StatusCode -ne 200) { throw 'Configuracao remota indisponivel.' }
    $body = $config.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $projection = Get-CloudflareIngressProjection -ConfigJson $body
    if (-not $projection.AllDocumentedHostnamesPresent) { throw 'Associacao das sete rotas ainda incompleta.' }
    $currentService = Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
    $currentProcess = Get-Process -Id $servicePid -ErrorAction Stop
    if ($currentService.ProcessId -ne $servicePid -or $currentService.State -cne 'Running' -or
        $currentProcess.Path -ine $plan.Executable -or
        $currentProcess.StartTime.ToUniversalTime().Ticks -ne $serviceStartTicks) {
        throw 'Identidade do servico mudou durante a verificacao.'
    }
    $allServiceChecksPassed = $true
    $projection | ConvertTo-Json -Depth 6
} finally {
    $body = $null
    $client.Dispose()
    $handler.Dispose()
}
```

A resposta bruta de `/config` e os logs podem conter configuracao privada; mantenha-os fora do chat e da documentacao. A projecao acima mostra somente versao, ordem, hosts, path e servicos permitidos. A [fonte oficial do endpoint](https://github.com/cloudflare/cloudflared/blob/2026.9.3/orchestration/orchestrator.go) diferencia a versao inicial local -1 da configuracao recebida remotamente; a [prontidao](https://github.com/cloudflare/cloudflared/blob/2026.9.3/metrics/readiness.go) indica conexoes ativas, sem testar a aplicacao de origem.

Somente depois de todos os passos anteriores passarem nesta mesma sessao, promova o servico e encerre o standalone especifico registrado nesta recuperacao. O guard de PID/executavel/inicio recusa um processo reutilizado ou diferente. Se o processo original ja tiver terminado, preserve qualquer novo processo e reveja o estado.

```powershell
if (-not $allServiceChecksPassed -or $null -eq $projection -or -not $projection.AllDocumentedHostnamesPresent) {
    throw 'Validacao atual das sete rotas obrigatoria.'
}
$currentService = Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
$currentProcess = Get-Process -Id $servicePid -ErrorAction Stop
if ($currentService.ProcessId -ne $servicePid -or $currentService.State -cne 'Running' -or
    $currentService.PathName -cne $plan.BinPath -or $currentProcess.Path -ine $plan.Executable -or
    $currentProcess.StartTime.ToUniversalTime().Ticks -ne $serviceStartTicks) {
    throw 'Identidade do servico validado divergente.'
}
Set-Service -Name Cloudflared -StartupType Automatic -ErrorAction Stop
$standalone = Get-Process -Id 10568 -ErrorAction Stop
$recordedStart = [DateTimeOffset]::Parse('2026-10-01T20:39:42.1069669-03:00').UtcDateTime.Ticks
if ($standalone.Path -ine $plan.Executable -or
    $standalone.StartTime.ToUniversalTime().Ticks -ne $recordedStart) {
    throw 'Standalone original nao confirmado; nenhum processo sera parado.'
}
Stop-Process -InputObject $standalone -ErrorAction Stop
```

Se o registro falhar depois da fonte de eventos ou SCM, eles podem permanecer sem recibo final; a reexecucao sera recusada. Preserve o standalone e revise somente os artefatos novos `Cloudflared`, comparando estado, binPath e conta ao plano antes de qualquer recuperacao administrativa. Nao executar uma desinstalacao generica do pacote. Uma reversao do registro concluido deve ficar limitada ao servico/fonte identificados pelo recibo privado e preservar executavel, credencial, aplicacoes e banco; nao foi ensaiada em SCM real nesta etapa.

As rotas recebidas usam `18080/18081`. Pontes para `38080/28081` dependem de origens locais saudaveis e de verificacao do mapeamento exclusivo. Conexao Cloudflare pronta com origem ausente produz falha da origem; criar portproxy sem a aplicacao pronta nao restaura o site. A persistencia descrita acima ainda depende de execucao e validacao administrativa; nenhum reboot foi executado.

# Pontes locais do Formulario no tunel existente

O ingress remoto confirmado do tunel `da4be1b8-b8dd-425b-b059-4702bf603471` usa `18080` para Formulario e `18081` para sua API. A aplicacao desta VM usa `38080` e `28081`. O processo Node proprio cria somente estas duas pontes TCP:

| Entrada           | Origem            |
| ----------------- | ----------------- |
| `127.0.0.1:18080` | `127.0.0.1:38080` |
| `127.0.0.1:18081` | `127.0.0.1:28081` |

Os bytes passam sem interpretacao de HTTP: Host, cookies, CSRF, headers encaminhados e respostas permanecem iguais. A autenticacao e as regras de seguranca continuam na API e no proxy existente. O relay usa [streams e pipe do Node](https://nodejs.org/api/stream.html) com backpressure; fechamento normal drena a resposta antes do fim da conexao. Os listeners ficam restritos ao loopback, sem portproxy, firewall, servico Windows, DNS, alteracao SQL ou PM2 compartilhado.

O acionador `scripts/manage-formulario-loopback-bridges.ps1` atende exclusivamente `WIN-00NEDIJ1R5P`, bloqueia a origem por nome ou MachineGuid e conserva os arquivos anteriores. O padrao e somente leitura:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/manage-formulario-loopback-bridges.ps1
```

Antes de iniciar, a API e o front-end precisam ter listeners exclusivos `127.0.0.1` e responder HTTP 200 em `/api/v1/auth/csrf` e `/`. Use os PIDs confirmados pelo acionador da aplicacao, preservando seu recibo de identidade. Os numeros abaixo sao apenas marcadores a substituir pelos PIDs atuais:

```powershell
$frontPidConfirmado = 12345
$apiPidConfirmado = 12346
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/manage-formulario-loopback-bridges.ps1 -Mode Start -ExpectedFrontPid $frontPidConfirmado -ExpectedApiPid $apiPidConfirmado
```

O Start recusa qualquer ocupante desconhecido de `18080/18081`, verifica novamente as origens e cria apenas seu processo Node oculto. Copia do modulo, logs e recibo ficam em `C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\formulario-loopback-bridges`, com ACL privada aplicada antes dos bytes. O recibo so e publicado depois de confirmar os dois listeners pertencentes ao novo PID e HTTP 200 atraves das pontes. Uma reexecucao com a mesma ponte propria ativa retorna AlreadyRunning sem criar outro processo. Recibos proprios antigos sem processo correspondente sao arquivados no mesmo diretorio privado, sem sobrescrita.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/manage-formulario-loopback-bridges.ps1 -Mode Status
```

A reversao abaixo compara recibo privado, hash do modulo, PID, executavel Node, horario de inicio e argumentos exatos do modulo antes de parar somente a ponte propria. Nenhuma linha de comando completa e impressa. O conector Cloudflare, as origens, outros projetos e o banco sao preservados.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/manage-formulario-loopback-bridges.ps1 -Mode StopOwned
```

Se o processo criado nao tiver o horario de inicio confirmado, o acionador informa apenas seu PID e preserva-o para revisao; nao faz parada sem identidade. Logs privados e preparacoes que falharem ficam preservados. As pontes sao processos da sessao atual e sua persistencia apos reboot nao esta implicita. A disponibilidade publica exige o conector e as duas origens ativas; o resultado HTTP publico deve ser conferido separadamente apos o Start.

Depois das origens e pontes prontas, a verificacao abaixo faz somente GET e OPTIONS nos dois hostnames existentes. Usa a validacao TLS normal, sem enviar credenciais, armazenar cookies ou seguir redirecionamentos. Corpos e Set-Cookie ficam somente em memoria; a saida contem status HTTP e flags, nunca valores de cookies ou token CSRF.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-formulario-public-readiness.ps1
```

Esperado: pagina e bundle HTTP 200, base publica `https://api-formulario.rodogarcia.com.br/api/v1` no bundle, CSRF HTTP 200 com JSON/cookie seguro, CORS para a origem exata com credenciais, origem fora da allowlist recusada e `/api/v1/auth/me` anonimo HTTP 401. O CSRF nao e uma credencial de autenticacao: seu cookie legivel pelo JavaScript e distinto dos cookies de acesso/refresh HttpOnly. Os dois hostnames HTTPS pertencem ao mesmo site; o cookie API sem Domain e host-only e SameSite=Strict permanece adequado, enquanto a chamada entre origens exige [CORS com origem explicita e credenciais](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS). Os atributos de cookies sao descritos em [Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

Esses GET/OPTIONS verificam transporte, shell/bundle e fronteiras anonimas. Nao comprovam renderizacao do formulario no navegador, login autenticado, permissoes SQL ou gravacao de avaliacao. O comando nao envia POST operacional; OPTIONS apenas declara POST como metodo da eventual preflight.

Evidencia focada: `testar-loopback-bridges.cjs` verifica bytes HTTP, headers/cookies, request de 1 MB, resposta de 2 MB com leitura pausada, half-close, conflito de portas e HTTP 200/503 usando portas efemeras. `testar-gerenciador-pontes.ps1` usa TEMP e processos simulados para ACL, no overwrite, guards, idempotencia, recibo, rollback limitado e recusa de identidade/modulo divergentes. Os ensaios nao iniciam pontes em portas produtivas nem alteram processos externos.

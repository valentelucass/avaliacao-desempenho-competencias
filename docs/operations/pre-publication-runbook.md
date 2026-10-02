# Runbook de pré-publicação

> Hostname atualizado em 02/10/2026. Os caminhos privados com `preparado-WIN-00NEDIJ1R5P` continuam existentes e devem ser preservados. Diagnosticos e recibos anteriores registram a situacao da epoca; nao comprovam a disponibilidade atual.

> Status: checklist para uma nova publicação ou mudança operacional. O release técnico atual possui evidências próprias; este documento não autoriza alteração de Cloudflare, firewall, PM2 ou banco.

## Objetivo

Verificar de forma repetível o que precisa estar pronto antes de expor o sistema pelos hosts definidos. A nova topologia usa Cloudflare Tunnel para serviços privados em `127.0.0.1:38080` (front-end) e `127.0.0.1:28081` (API). A troca de portas exige atualização coordenada das duas rotas externas antes da ativação.

## Diagnóstico nesta VM — 2026-10-01

A VM atual é `ROD-SRVW-001`. Em leitura anônima, os dois hosts públicos responderam HTTP 530 com erro Cloudflare 1033, tanto em HTTP quanto em HTTPS. Esse erro indica ausência de conector `cloudflared` saudável; HTTP 502 indica outro estágio, em que o conector alcança a Cloudflare, mas falha ao acessar a origem local. Não é evidência de falha no SQL Server. [Diagnóstico oficial do túnel](https://developers.cloudflare.com/tunnel/troubleshooting/).

O inventário inicial não encontrou serviço, processo ou executável `cloudflared` nos locais verificados, nem listeners em `18080`, `18081`, `28081` ou `38080`, nem regras portproxy. O MSI `Cloudflare_WARP_2026.7.1376.0.msi` existe, mas o inventário e a consulta somente leitura ao Windows Installer não confirmaram instalação concluída. O WARP/Cloudflare One Client encaminha tráfego do dispositivo; a publicação destes hosts requer o conector `cloudflared` previsto na ADR-0005. [Arquitetura do cliente WARP](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/route-traffic/client-architecture/).

Para recuperar o túnel existente:

1. No painel Cloudflare, abrir **Networking > Tunnels**, selecionar o túnel que já atende os dois hosts e conferir sua identidade, estado **Active/Healthy** e conectores. Em **Add a replica**, recuperar a credencial desse túnel por canal protegido. Ela é indispensável para reconectar esta VM e não está disponível no inventário local; não colar token no chat, argumentos de processo, scripts, logs ou documentação. Armazená-lo somente fora do Git em arquivo com acesso restrito. [Credencial do túnel existente](https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/).
2. Preparar a reconexão apenas desse conector, registrando alvo, impacto e recuperação antes da operação. `cloudflared` a partir de `2025.4.0` permite ler o token por `--token-file`, sem incluir seu valor na linha de comando. Não criar outro túnel, DNS, conta ou ponte portproxy para resolver 1033. [Parâmetros oficiais](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/).
3. Confirmar primeiro as origens exclusivas: `formulario.rodogarcia.com.br` → `http://127.0.0.1:38080` e `api-formulario.rodogarcia.com.br` → `http://127.0.0.1:28081`. Depois da reconexão, conferir as rotas efetivas do túnel e HTTPS nos dois hosts. Se surgir 502, investigar a origem/porta configurada antes de qualquer mudança. Uma ponte não restaura um conector ausente nem uma aplicação parada.

Os procedimentos de setembro e a tabela de prontidão abaixo são registros da VM anterior; não comprovam o estado desta VM e não devem ser executados automaticamente nela. Este diagnóstico não instalou software nem alterou SQL Server, serviços, rede, certificados, túnel ou DNS.

## Preparação posterior nesta VM — 2026-10-01

Por solicitação do usuário, o arquivo `C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\avaliacao-prod.properties` e a pasta `C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\logs` foram criados com acesso restrito à conta atual, SYSTEM e Administrators. O preparador `scripts/prepare-production-config.ps1` recusa sobrescrita e grava o arquivo completo de forma atômica. Uma chave HMAC aleatória de 32 bytes foi gerada sem exposição; ela será usada pela API quando a configuração for concluída. Nenhuma senha de usuário da aplicação ou dado no SQL Server foi alterado.

O arquivo contém o marcador `#ADC_CONFIGURATION_INCOMPLETE` e mantém a senha SQL vazia. Tanto `--check` quanto o launcher normal bloqueiam esse estado antes do gate SQL ou PM2. Não remover o marcador para tentar forçar a subida: ainda faltam a credencial válida da identidade dedicada da API e a validação operacional de identidade/TLS, que não foram autorizadas nesta demanda sem SQL. O preparador pode ser inspecionado com `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-production-config.ps1 -CheckOnly`; após a criação real, ele recusa os destinos existentes e os preserva.

O conector standalone `cloudflared` 2026.9.3 está disponível no diretório externo `C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\cloudflared`, com SHA-256 conferido no release oficial e assinatura válida da Cloudflare. Somente versão e ajuda offline foram executadas; nenhum túnel, serviço ou agendamento foi iniciado.

Para fornecer a credencial do túnel existente sem expô-la:

1. No painel Cloudflare, abrir **Networking > Tunnels**, selecionar o túnel dos dois hosts e conferir seu ID e as rotas existentes. Em **Add a replica**, copiar apenas o token do comando mostrado; não executar o comando de instalação e não enviar seu conteúdo ao chat. [Procedimento oficial](https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/).
2. No console seguro da VM, na pasta deste projeto, executar `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/save-cloudflare-tunnel-token.ps1 -ExpectedTunnelId "ID-DO-TUNEL"`, substituindo o ID pelo UUID exibido no painel. Colar somente o token na entrada oculta. O script verifica se ele pertence ao ID informado e grava exclusivamente `production\cloudflare-tunnel.token` com ACL privada, sem sobrescrever credenciais existentes.
3. Informar somente que o arquivo foi salvo e o nome/ID do túnel. A reconexão ainda exige conferir as rotas/impacto do túnel existente; a credencial pode alcançar outros hosts caso ele seja compartilhado. O script de captura não inicia o conector nem muda SQL, serviços ou DNS. Depois da reconexão, conferir o estado saudável e as duas URLs; preparar o executável não elimina sozinho o erro 1033.

## Reconexão pelo pacote completo nesta VM — 2026-10-01

O pacote `migracao-cloudflare-pm2-completo-2026-10-01.zip` foi extraído sem sobrescrita em `C:\CloudflareMigracao`, com acesso restrito antes dos bytes. O token exportado foi validado contra o túnel `da4be1b8-b8dd-425b-b059-4702bf603471` e importado atomicamente para o arquivo privado `production\cloudflare-tunnel.token`. A configuração antiga da Avaliação foi recuperada como candidata separada; o properties novo incompleto permanece preservado. Nenhuma autenticação, consulta ou alteração SQL foi executada.

O processo standalone `cloudflared` PID `10568`, iniciado às `20:39:42` com logs privados e `--token-file`, respondeu `/ready` HTTP 200. A configuração remota de versão 27 confirmou os sete hosts documentados, origens em loopback, a restrição SELIA e o catch-all HTTP 404. GETs públicos retornaram HTTP 502 nas sete entradas dos projetos porque as origens estão paradas; outro caminho do Satélite retornou 404. Isso comprova conexão e configuração recebida, sem afirmar consulta ao estado Healthy no painel administrativo ou funcionamento das APIs.

O formulário continua apontando para `18080`/`18081`. O roteiro privado `C:\CloudflareMigracao\preparado-WIN-00NEDIJ1R5P\cloudflare\FORMULARIO-BRIDGES.MANUAL-PENDENTE.txt` exige origens locais válidas e ausência de conflitos antes de criar somente as duas pontes IPv4 loopback. Nenhuma ponte foi aplicada. Não executar o script histórico abaixo, que se refere a outra VM.

O snapshot de 14 nomes, os ajustes pontuais de caminhos, o boot funcional e o XML desativado com SID atual estão preparados fora do runtime. O candidato `dump.candidate.BLOCKED.pm2` não deve ser restaurado: faltam artefatos/caminhos e há dois daemons PM2 com canal inacessível. O dump atual de oito nomes foi preservado. O plano `pm2\PLANO-MANUAL-BLOQUEADO.txt` documenta a coexistência, os workers e as etapas humanas. Frontends do Dashboard e da Avaliação foram preparados como candidatos isolados, sem publicação ou início de aplicações.

O conector atual não tem persistência após reboot. O preparador abaixo executa somente preflight por padrão e já foi conferido nesta VM sem alterar SCM:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-cloudflare-windows-service.ps1 -ExpectedTunnelId da4be1b8-b8dd-425b-b059-4702bf603471
```

Em console administrativo da mesma conta, `-InstallStopped` registra exclusivamente `Cloudflared` como serviço **Manual e parado**, com credencial lida por arquivo, sem iniciar nem parar o conector existente. O operador deve conferir o registro, iniciar o serviço, verificar `/ready` e as rotas do próprio PID e só depois decidir pela inicialização automática e encerrar exclusivamente o standalone identificado pelo recibo. O preparo recusa serviço/fonte de eventos/log/recibo preexistentes e a VM de origem. Falha parcial exige inspeção manual; não repetir a instalação nem remover recursos sem conferir sua identidade. Nenhum serviço ou tarefa foi registrado nesta sessão.

## Recuperação histórica da rota pública em 2026-09-23

Após a recuperação do PM2, os 14 nomes foram salvos e os serviços da Avaliação responderam HTTP 200 nas novas portas privadas. Os dois hostnames públicos inicialmente responderam HTTP 502. O serviço `cloudflared` usa token de conexão de túnel gerenciado remotamente; a VM não dispõe de credencial para editar as rotas na Cloudflare. A ponte local abaixo faz a configuração remota antiga alcançar as novas portas, sem reiniciar o PM2 ou alterar o código da aplicação. Após sua aplicação em 2026-09-23, os dois hosts públicos responderam HTTP 200.

Executar em PowerShell elevado da **mesma conta `RTR-SVW-002\suporte`**:

```powershell
.\scripts\repair-public-route.ps1
.\scripts\register-pm2-boot.ps1
```

O primeiro script verifica HTTP 200 nas novas portas, cadastra somente no loopback as pontes TCP `18080→38080` e `18081→28081`, testa as duas URLs públicas e, se necessário, também atende `::1`. Em 2026-09-23, bastaram as duas pontes IPv4. O segundo valida os 14 nomes em `dump.pm2` sem `ConvertFrom-Json`, solicita a senha da conta Windows, registra a tarefa `PM2-Projetos` para executar `pm2 resurrect` após o boot sem login e remove a entrada antiga de logon apenas depois do registro. A tarefa foi registrada com estado `Ready`; a entrada antiga foi removida. Ambos aceitam `-CheckOnly` para diagnóstico sem alteração. A tarefa ainda precisa de validação em um reinício real.

Quando as duas rotas remotas forem editadas diretamente para `38080`/`28081`, remover apenas as pontes criadas por este procedimento com `repair-public-route.ps1 -Remove`, depois de confirmar HTTP 200 nos hosts públicos. A ponte é uma etapa de recuperação e não substitui a atualização da configuração remota do túnel.

## Verificações sem alteração

Execute na raiz antes de solicitar ou realizar uma publicação:

```powershell
.\scripts\verify-quality.ps1
.\scripts\check-operation.ps1
```

Também confirme o preflight do script de produção:

```bat
iniciar-prod.bat --check
```

Esse diagnóstico lê os três ponteiros de ambiente diretamente ou do `.env` local ignorado pelo Git: `AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG` aponta para um arquivo `.properties` externo ao repositório, `AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL=https://api-formulario.rodogarcia.com.br/api/v1` e `AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY` aponta para um diretório externo existente. O `.env` contém apenas caminhos e a URL pública; os segredos ficam exclusivamente no `.properties` externo ou no mecanismo de segredos aprovado.

O `--check` reúne os bloqueios locais sem executar a CLI PM2, iniciar daemon, consultar SQL Server, ler valores de credenciais do `.properties`, fazer build ou criar diretórios. Ele confere somente o marcador inicial de configuração incompleta. Exige acesso ao canal de um daemon PM2 existente e bloqueia qualquer listener em `28081`/`38080`, inclusive de uma instância saudável, porque não comprova sua propriedade. Não encerre processos por esse diagnóstico; confira a identidade do listener antes de publicar. O DEV atual usa `5180`/`5181`. Código zero comprova somente os pré-requisitos locais verificados, sem validar credenciais, TLS SQL, saúde HTTP, Cloudflare ou prontidão de produção. O gate completo acima inclui validação SQL; nesta demanda sem acesso ao banco, usar `verify-quality.ps1 -SkipDatabase` em cópia isolada, preservando o `frontend/dist` servido.

O preflight de Java também pode ser chamado diretamente sem iniciar processo:

```powershell
.\scripts\run-backend.ps1 -ValidateOnly
```

`iniciar-dev.bat` não tem modo `--check`: ele é exclusivamente o launcher de desenvolvimento local com HTTPS. Nenhum dos comandos acima inicia ou reinicia processos. Se um deles falhar, interrompa a preparação e corrija a causa antes de qualquer publicação.

## Itens obrigatórios antes de uma nova publicação ou alteração operacional

| Item                   | Evidência necessária                                                                                       | Situação atual                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Configuração externa   | Arquivo `.properties`, URL pública da API e diretório de logs fora do repositório validados pelo preflight | Configurada externamente; revalidar antes de qualquer alteração                                                           |
| Migrations             | Histórico completo e validações do runner nos alvos canônicos                                              | `V0001`–`V0013` reconciliadas em DEV e PROD em 2026-08-29                                                                 |
| Identidade SQL e TLS   | Login dedicado, mínimo privilégio, ausência de acesso cruzado e certificado validado                       | Validador mínimo e conexão TLS aprovados; repetir após qualquer troca                                                     |
| Cloudflare Tunnel      | HTTPS dos dois hosts, headers finais, HTTP→HTTPS, WAF/bot e limite de borda                                | Dois hosts HTTP 200 após a ponte local; rotas remotas ainda exigem atualização direta quando houver acesso administrativo |
| Porta SQL e firewall   | Acesso à 1433 restrito ao escopo aprovado sem afetar os demais bancos da instância compartilhada           | Pendente de inventário, regra e recuperação de infraestrutura                                                             |
| Processos              | Processos PM2 exclusivos, portas privadas, ambiente mínimo e teste após reinício da VM                     | 14 nomes salvos no PM2, novas portas locais ativas e tarefa `PM2-Projetos` registrada; falta ensaio após reboot           |
| Logs                   | Local definido, acesso restrito, retenção, rotação e consulta de erro/correlação                           | Diretório externo restrito existe; retenção, rotação e alertas pendentes                                                  |
| Dependências           | Scanner de segredos, auditorias npm/Java e SBOM no gate                                                    | Gate consolidado e gate do release aprovados em 2026-08-29                                                                |
| Backup                 | Política, responsável, retenção, criptografia/RPO-RTO e restauração comprovada em ambiente seguro          | Restauração técnica comprovada; política, agenda, retenção, criptografia e RPO/RTO pendentes                              |
| Atualização e rollback | Artefato identificado, responsável, janela, comunicação e retorno sem afetar outros processos PM2          | Evidência específica exigida em cada mudança                                                                              |
| Segurança e negócio    | Checklist de aceite, RH/LGPD, segundo administrador/custodiantes e validação assistiva manual              | Condições externas pendentes                                                                                              |

## Publicação controlada

### Recuperação desta VM com usuário SQL distinto

O login da instância e o usuário de `AVALIACAO_PROD` são identidades distintas. Os scripts operacionais `database/production/002`, `003` e `004` agora possuem `ApplicationUser` separado de `ApplicationLogin`. O default preserva `rodogarcia_adc_app`. Quando o diagnóstico atual comprovar que esse usuário é `WITHOUT LOGIN`, preserve-o e selecione `rodogarcia_adc_runtime`; `ApplicationLogin` permanece `rodogarcia_adc_app`. Os dois nomes são os únicos aceitos, e o usuário validado deve ser `SQL_USER` com autenticação `INSTANCE` e SID igual ao login.

Para selecionar o usuário sem editar cada arquivo, `scripts/prepare-production-principal-sql.ps1 -ApplicationUser rodogarcia_adc_runtime` apenas confere os três scripts offline. Com `-OutputDirectory` apontando para uma pasta externa nova, ele gera cópias privadas revisáveis, com as variáveis resolvidas e sem metacomandos SQLCMD; não conecta nem executa SQL, e recusa sobrescrita. Sem `-ApplicationUser`, mantém o default original. Os arquivos originais preservam `:setvar`; esse diretivo tem precedência maior que `sqlcmd -v`, conforme [documentação Microsoft](https://learn.microsoft.com/en-us/sql/tools/sqlcmd/sqlcmd-use-scripting-variables?view=sql-server-ver17). Não usar `-v` para tentar alterar silenciosamente esse default nem executar os arquivos como migrations.

Após o reparo autorizado, validar a matriz exata: `CONNECT` no banco; `SELECT`, `INSERT` e `UPDATE` em `dbo`; `DELETE` somente em `ciclo_questionario`, `filial`, `area` e `colaborador`. O `002` verifica os quatro grants previstos por `003` e `004` e continua recusando roles, DDL, controle, delegação, DELETE em schema/outros objetos e acesso a outro banco de usuário. A execução real exige identidade atual, baseline e autorização próprios; o suporte a `ApplicationUser` não cria ou remapeia usuário automaticamente.

Nesta recuperação, `003` e `004` não serão executados automaticamente: o operador responsável aplica somente o reparo específico revisado e valida o resultado real. Os arquivos preparados são material de revisão, sem autorização implícita de executar suas concessões.

Nesta recuperação, usar somente o helper privado `C:\CloudflareMigracao\preparado-WIN-00NEDIJ1R5P\pm2\start-avaliacao-only.ps1`, que não inicia por padrão. Ele exige console elevado da mesma conta, identidade da VM/daemon/pipes, artefatos conferidos e comprovantes privados recentes de reparo limitado, TLS, login, schema e qualidade. O operador responsável pela recuperação prepara os comprovantes apenas depois das verificações reais. `-Apply` permite somente os dois novos processos da Avaliação, sem `save`, `resurrect`, reinício ou remoção de existente.

Não executar `iniciar-prod.bat` sem argumentos nesta etapa: o fluxo normal faz gate/build, pode encerrar DEV e substituir nomes legados deste projeto, e executa `pm2 save` sobre o daemon compartilhado. Esse save substituiria o snapshot preservado de oito nomes; listeners sozinhos não comprovam saúde da aplicação. O `--check` permanece um diagnóstico local seguro e não é um comando de atualização da instância já ativa.

### Fluxo normal para publicações futuras

Somente depois de autorização explícita para o alvo correto:

1. Registrar o responsável, horário, versão/artefato e forma de retorno.
2. Executar novamente as verificações sem alteração.
3. Preparar a troca coordenada das duas rotas externas na Cloudflare, com retorno às portas anteriores caso a nova origem falhe. Não presumir que a configuração remota já usa as novas portas.
4. Iniciar ou atualizar somente os processos `avaliacao-api-28081` e `avaliacao-front-38080` pelo script do repositório. O launcher remove os nomes anteriores `avaliacao-api-18081` e `avaliacao-front-18080` durante a migração; há uma janela de indisponibilidade até as rotas externas apontarem para as novas portas. O `pm2 save` do launcher só grava o novo snapshot após os dois listeners responderem.
5. Confirmar que cada processo escuta exclusivamente em loopback, que os hosts externos retornam o serviço esperado e que não há rota cruzada entre front-end e API.
   A validação de ambiente pode ser repetida sem expor valores:

   ```powershell
   pm2 jlist | node .\scripts\validate-pm2-runtime.cjs
   ```

6. Confirmar no endereço final HSTS/CSP/headers defensivos e, no Cloudflare, redirecionamento HTTP→HTTPS, WAF/bot protection e limite de borda conforme a decisão aprovada.
7. Salvar a evidência do teste, registrar a versão em operação e configurar/testar a restauração após reinício da VM.

O script `iniciar-prod.bat` não configura Cloudflare, firewall, TLS de SQL Server, backup, política de logs, PM2 após reinício ou rollback automático.

## Parada e retorno

Interrompa a publicação se houver falha de validação, rota externa inesperada, escuta fora do loopback, ausência de backup/restauração comprovada, erro de autorização ou ausência do artefato anterior.

Um retorno seguro requer instrução operacional aprovada, preservação de evidências e intervenção somente nos dois processos PM2 deste projeto. Não apague banco, avaliações, logs ou processos de outros sistemas como parte do retorno.

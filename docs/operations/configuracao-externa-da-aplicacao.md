# Configuração externa da aplicação

| Campo  | Valor                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status | Desenvolvimento local autorizado em loopback e produção configurada externamente com configuração e identidade SQL dedicadas; nenhum segredo é versionado. |
| Escopo | Persistência SQL Server, autenticação local, ciclos, avaliações e indicadores.                                                                             |
| Origem | ADC-007 a ADC-011, ADR-0008 e ADR-0011.                                                                                                                    |

## Princípio

O repositório inicia com persistência, autenticação, leitura de ciclos, avaliações e indicadores desabilitadas na configuração versionada. A ativação só é permitida quando a VM tiver recebido por canal protegido uma identidade SQL Server autorizada da aplicação — conta SQL ou identidade Windows do processo com autenticação integrada —, as configurações de emissão de sessão e uma chave aleatória de pelo menos 32 bytes codificada em Base64. Nenhum segredo deve ir para Git, `application.properties`, log, resposta HTTP, teste ou PM2 compartilhado.

No banco local dedicado autorizado, `V0001` a `V0007` já foram aplicadas e as validações do runner passaram. Em qualquer outro alvo, aplique e valide as migrations de forma autorizada antes de habilitar módulos; o código de leitura de ciclos exige explicitamente `V0003`, `V0005` e `V0007` e falha na inicialização em vez de consultar schema incompleto.

## Desenvolvimento local autorizado

O comando canônico de desenvolvimento é:

```bat
iniciar-dev.bat
```

Ele é distinto de `iniciar-prod.bat`. O launcher chama `scripts/iniciar-dev-local.ps1`, inicia somente processos de desenvolvimento no loopback, expõe a SPA em `https://localhost:5180` e a API em `https://localhost:5181`, e configura o proxy Vite para `/api` no mesmo domínio local. Cada execução encerra exclusivamente os processos Java/Vite confirmados como pertencentes a este repositório nessas duas portas e os reinicia nelas; se encontrar outro processo, não o encerra. As portas `18080` e `18081` permanecem reservadas aos processos privados de produção. O terminal permanece em primeiro plano enquanto a instância local estiver ativa; `Ctrl+C` encerra apenas os processos Java/Vite que esse terminal iniciou e ainda confirma nas portas fixas. Assim os cookies de autenticação seguros permanecem compatíveis com a SPA sem liberar CORS para origem externa.

No desenvolvimento local, a API usa autenticação integrada da identidade Windows que executa a JVM. O launcher cria/usa um certificado HTTPS local somente no perfil Windows atual; o PFX exportado para a execução, a senha desse PFX e o material HMAC são efêmeros e não entram no repositório. Ele força `debug=false`, desabilita detalhes de requisição e restringe os loggers HTTP, segurança e JDBC para impedir que respostas CSRF, tokens ou credenciais sejam serializados no log local, mesmo quando a máquina tiver variáveis de ambiente amplas. Ele não compila a API, não baixa a biblioteca de autenticação integrada e não executa `npm install`: antes de reiniciar processos, valida o JAR atual em `backend/target` e as dependências atuais em `frontend/node_modules` e falha sem interromper a instância em execução se algum pré-requisito estiver ausente ou desatualizado. A preparação desses artefatos pertence ao fluxo de produção autorizado. O navegador não abre automaticamente; `iniciar-dev.bat --open-browser` é a opção explícita para abri-lo.

Esse modo não cria configuração de produção, conta SQL dedicada, rota de Cloudflare, serviço PM2 ou acesso público. A inicialização ativada foi verificada com API/SPA/proxy em execução, `GET /api/v1/auth/csrf` retornando `200` pelo front-end e rota protegida retornando `401`; o fluxo interativo de credencial, login e navegador ainda precisa de validação antes de ser considerado aceito.

## Contrato do launcher de produção

Antes de usar `iniciar-prod.bat`, a operação autorizada deve fornecer ao processo três variáveis de ambiente. O launcher lê opcionalmente o arquivo local `.env` na raiz, que é ignorado pelo Git e aceita somente esses três ponteiros operacionais:

```text
AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG=<ARQUIVO_PROPERTIES_FORA_DO_REPOSITORIO>
AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL=https://api-formulario.rodogarcia.com.br/api/v1
AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY=<DIRETORIO_EXISTENTE_FORA_DO_REPOSITORIO>
```

O primeiro valor deve apontar para um arquivo `.properties` protegido fora do repositório e conter as propriedades obrigatórias descritas nesta página. O segundo não é segredo: ele é incorporado ao build Vite para que a SPA publicada no host do formulário chame o host da API correto. O terceiro precisa ser um diretório externo já criado para os logs dos dois processos PM2; o launcher não cria diretórios de log dentro do repositório.

Copie `.env.example` para `.env` e preencha os caminhos externos já provisionados. O `.env` não substitui o arquivo `.properties`: ele não deve conter senha, token, chave de sessão, URL JDBC com credencial ou qualquer outro segredo. Variáveis já definidas pelo mecanismo de ambiente aprovado continuam utilizáveis quando o campo correspondente do `.env` estiver vazio.

O launcher valida a existência e a localização externa do arquivo/diretório, bem como a URL HTTPS exata da API, antes de executar `npm ci`, o gate ou qualquer alteração no PM2. Em seguida ele fornece o arquivo à JVM por `SPRING_CONFIG_ADDITIONAL_LOCATION`, a URL ao Vite por `VITE_API_BASE_URL` e os caminhos externos ao PM2. O validador não lê, imprime ou tenta validar o conteúdo do arquivo de propriedades; permissões do arquivo/diretório, retenção e rotação continuam responsabilidades operacionais que exigem autorização e evidência próprias.

## Exemplo sem segredo

Forneça propriedades externas ao processo, por exemplo por arquivo local protegido fora do repositório ou pelo mecanismo de segredos aprovado para a VM. Escolha exatamente uma forma de autenticação SQL Server.

### Conta SQL Server

```properties
app.persistence.sqlserver.enabled=true
app.persistence.sqlserver.jdbc-url=<JDBC_URL_SQLSERVER_LOCAL>
app.persistence.sqlserver.username=<USUARIO_SQL_APLICACAO>
app.persistence.sqlserver.password=TODO
app.persistence.sqlserver.maximum-pool-size=10
app.persistence.sqlserver.connection-timeout=10s
```

### Autenticação integrada do Windows

```properties
app.persistence.sqlserver.enabled=true
app.persistence.sqlserver.jdbc-url=<JDBC_URL_SQLSERVER_LOCAL_COM_integratedSecurity=true>
app.persistence.sqlserver.maximum-pool-size=10
app.persistence.sqlserver.connection-timeout=10s
```

Com `integratedSecurity=true` na URL JDBC, a API usa a identidade Windows que executa a JVM e não lê nem envia `username` ou `password` ao Hikari. Não declare essas duas propriedades nesse modo. A identidade Windows precisa ter somente os privilégios mínimos no banco dedicado, e o ambiente precisa fornecer o suporte nativo exigido pelo driver Microsoft JDBC para autenticação integrada.

As propriedades abaixo são obrigatórias nas duas formas de autenticação:

```properties

app.security.authentication.enabled=true
app.security.authentication.issuer=<IDENTIFICADOR_DO_EMISSOR>
app.security.authentication.audience=<IDENTIFICADOR_DA_API>
app.security.authentication.hmac-secret-base64=TODO
app.security.authentication.access-lifetime=15m
app.security.authentication.refresh-lifetime=8h
app.security.authentication.failed-login-threshold=5
app.security.authentication.account-lock-duration=15m
app.security.authentication.login-maximum-attempts=10
app.security.authentication.login-window=1m

app.evaluation-cycles.read.enabled=true
app.assessments.enabled=true
app.indicators.enabled=true
```

As origens permitidas por CORS são configuração separada e precisam corresponder exatamente à SPA publicada. Não usar origem curinga com credenciais.

## Sequência operacional segura

1. Provisionar para produção a identidade SQL Server exclusiva da aplicação — conta SQL Server ou identidade Windows do processo —, sempre com mínimo privilégio sobre o banco dedicado, sem usar `sa` e sem acesso de leitura para contas de ferramenta. A identidade Windows usada no desenvolvimento local não equivale a esse provisionamento.
2. Para qualquer alvo novo, aplicar migrations e executar `database\executar-database.bat --validate` com a conta administrativa autorizada; esse passo não é executado automaticamente pela aplicação. O alvo local de desenvolvimento já está reconciliado em `V0001`–`V0007`.
3. Disponibilizar as propriedades externas sem imprimir seus valores e iniciar a API em ambiente não produtivo. No launcher local, elas existem somente no ambiente do processo e os segredos são gerados para a execução.
4. Antes de produção, executar o bootstrap controlado do primeiro administrador supremo e, em seguida, criar a segunda conta por aprovação independente da Diretoria. Atribua os papéis explicitamente e confirme a troca obrigatória da senha inicial. Uma conta técnica local de desenvolvimento não substitui esse bootstrap de produção. A API normal não cria nem promove administradores supremos. A conta técnica não pode elevar a si mesma nem conceder acesso de negócio; uma concessão de negócio requer RH/Diretoria, outro alvo e `ACESSOS.NEGOCIO.GERIR`.
5. Criar cadastros, questionários aprovados, configurações de cálculo, matrizes, ciclos e atribuições de questionário antes de abrir um ciclo; a macro não é importada automaticamente.
6. Executar a suíte de qualidade e o teste de autorização em ambiente não produtivo antes de qualquer liberação.

## Bootstrap do primeiro administrador de produção

O script `database\\scripts\\bootstrap-primeiro-administrador-producao.ps1` é a única rotina manual prevista para uma base `AVALIACAO_PROD` recém-migrada e sem usuários ou dados de negócio. Ele exige confirmação explícita, valida as sete migrations e os cinco papéis obrigatórios, bloqueia a execução concorrente, grava usuário protegido, credencial BCrypt com troca obrigatória de senha, os papéis necessários e a auditoria em uma única transação. Ele se recusa a operar se a base já tiver usuários ou dados de negócio.

Execute-o somente no console seguro da VM e informe a senha via `SecureString`; ela não deve constar de argumentos, arquivos, variáveis de ambiente, histórico, logs ou repositório:

```powershell
$senhaInicial = Read-Host 'Senha inicial' -AsSecureString
.\\database\\scripts\\bootstrap-primeiro-administrador-producao.ps1 `
  -Login 'login-autorizado@dominio' `
  -DisplayName 'Nome autorizado' `
  -InitialPassword $senhaInicial `
  -ConfirmProductionBootstrap
Remove-Variable senhaInicial
```

No primeiro acesso, a conta deve trocar a senha. A segunda conta de administrador supremo continua obrigatória e requer aprovação independente da Diretoria; este bootstrap não contorna essa segregação.

## Limites pendentes

Esta orientação não autoriza criação de conta SQL, aplicação em outro banco, configuração do Cloudflare Tunnel, firewall, TLS do SQL Server, backup, PM2 ou deploy. A origem confiável para limite de taxa atrás do Tunnel continua a usar o endereço remoto visto pela aplicação até que uma configuração de proxy confiável seja formalmente aprovada e testada.

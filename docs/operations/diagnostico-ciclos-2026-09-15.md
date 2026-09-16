# Diagnóstico de abertura de Novo ciclo — ADC-DIAG-001

> Atualização: os defeitos locais descritos abaixo foram corrigidos e testados em `ADC-COR-007`–`ADC-COR-010`. As seções iniciais preservam o diagnóstico anterior; a correção e seus limites estão no fim deste documento. Não houve publicação em produção.

## Conclusão e limite do diagnóstico anterior

O usuário esclareceu que a pessoa clicou em **Novo ciclo**, sem preencher ou enviar o formulário. Nas fontes atuais, esse botão é `type="button"`: limpa o estado de edição e desloca o foco para o formulário já existente na página. Somente **Criar ciclo** executa o POST. O ensaio local confirmou duas consultas GET na montagem e nenhuma nova chamada ao clicar em Novo ciclo.

Foi reproduzido um cenário compatível com a apresentação do incidente: uma consulta iniciada ao entrar na tela termina com 422 depois do clique; a interface exibe “Revise os campos informados” junto de “Nenhum ciclo disponível” e “Nenhuma versão aprovada”, embora ninguém tenha enviado campos. Isso comprova o defeito de apresentação e a possibilidade de erro tardio; **não comprova a causa do 422 produtivo**.

As capturas contêm 409 em questionários e 403/422 em ciclos, mas não mostram método, corpo, parâmetros, horário ou `requestId`. A leitura local dos dois logs da API indicados pelo dump do PM2 não encontrou as rotas nem as classes de validação investigadas. Não se autenticou em produção, não se consultou banco, não se reproduziu escrita real e não se recertificou o release ativo. O dump é um registro persistido, não evidência do estado corrente dos processos.

## Achados reproduzidos

| Achado                                                  | Evidência e alcance                                                                                                                                                                                                                                                                                                                                                     | Encaminhamento                                                                                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Falha de leitura apresentada como erro de preenchimento | `safeErrorMessage` transforma qualquer 422, inclusive GET, na mesma orientação de revisar campos. O clique em Novo ciclo apaga o erro presente, mas a consulta ainda pendente pode recolocá-lo depois.                                                                                                                                                                  | Separar erros de carregamento das ações do formulário; informar a operação que falhou e permitir tentar novamente.                                                                                         |
| Lista não carregada apresentada como vazia              | Ciclos carrega duas consultas com `Promise.all`; Cadastros e Vínculos carregam até seis. Uma rejeição impede aproveitar respostas bem-sucedidas. Os estados vazios não exigem leitura concluída com sucesso. O ensaio de Cadastros retornou uma filial fictícia com sucesso e ainda assim a tela afirmou não haver filial cadastrada porque a consulta de áreas falhou. | Distinguir carregando, carregado, falhou e vazio; preservar resultados válidos e explicitar dependências indisponíveis. Não sugerir recadastrar o que não foi possível consultar.                          |
| Proteção contra cursor repetido inoperante              | `listAllCycles` testa `!seenCursors.add(cursor)`. `Set.add` retorna o próprio conjunto, sempre verdadeiro. Três respostas com o mesmo cursor provocaram uma quarta consulta, interrompida somente pela falha artificial do ensaio.                                                                                                                                      | Conferir `has` antes de `add`, interromper cursor repetido e cobrir com regressão. Afeta Ciclos, opções de Avaliações e Indicadores, consumidores desse método.                                            |
| Cursor ausente vira parâmetro inválido                  | Uma resposta simulada sem `page.nextCursor` produziu outra chamada com `cursor=undefined`, seguida de 422 simulado.                                                                                                                                                                                                                                                     | Validar a estrutura da resposta e impedir consulta com cursor inválido. É fragilidade de compatibilidade; não foi observada no servidor produtivo.                                                         |
| Repetição de qualquer 403 em escritas                   | O cliente renova CSRF e repete uma vez toda escrita com 403, inclusive uma negação por permissão. O ensaio confirmou duas tentativas da mesma operação negada.                                                                                                                                                                                                          | Diferenciar falha de CSRF de autorização por código estável e repetir somente o caso recuperável. Preservar todas as verificações de permissão. Não foi demonstrado bypass nem escrita duplicada em banco. |

### Controles de comparação

- Questionários já separa `loadError` de `submitError` e não mostra lista vazia após falha de leitura; confirmado por ensaio de componente.
- Contas locais e a lista principal de Avaliações possuem guardas explícitas de erro antes do estado vazio; verificado nas fontes, sem novo ensaio desses componentes.
- O mapper Jackson configurado pela aplicação, em contexto Spring isolado com persistência/autenticação desabilitadas, serializou `{"items":[],"page":{"limit":100,"nextCursor":null}}`. A configuração externa local consultada não continha override da inclusão de nulos. Portanto, não há evidência para atribuir o incidente ao cursor omitido.

## Rastreabilidade insuficiente

Os handlers retornam `requestId`, mas a apresentação global de 403/409/422 termina antes de mostrá-lo. As validações de ciclo e os conflitos de questionário são convertidos em mensagens genéricas, sem indicar a regra específica. Os handlers investigados também não registram o motivo técnico da rejeição; os logs locais consultados não permitiram reconstruir a tentativa.

O contrato de erro deve manter códigos estáveis e metadados mínimos para diagnóstico: método, rota-modelo sem identificadores pessoais, status, código da regra e `requestId`. Não registrar payload, cookies, tokens, comentários ou dados de colaboradores. O aviso ao usuário precisa identificar a operação e uma referência segura, sem exibir mensagens internas do SQL ou stack trace.

O 403 seguido de 422 é compatível com a repetição automática após renovar CSRF, mas também pode representar chamadas distintas. O 409 de questionários pode resultar de versão duplicada, catálogo/conteúdo incompatível, cálculo/matriz incompatíveis ou restrição de integridade. As imagens não permitem escolher entre essas causas. Não atribuir esses erros a perfil incorreto ou banco indisponível sem evidência.

## Regra de datas: achado separado

A API exige a janela anual de 01/09 às 00:00 até 16/09 às 00:00, no mesmo ano, em `America/Sao_Paulo`, conforme [regras operacionais v1](../business/regras-operacionais-v1.md). O formulário permite preencher outras datas/fuso e o teste de criação atual usa datas fora dessa regra com API simulada. Isso merece alinhamento de orientação e cobertura de contrato, mas **não explica o clique em Novo ciclo sem envio**. Nenhuma mudança de regra de negócio foi proposta como solução para o incidente.

## Evidência executada

- Maven offline, saída isolada `backend/target/cycle-incident-diagnosis-20260915`: compilação, Enforcer, Spotless e 24 testes aprovados, sem falhas/ignorados. Suítes: configuração e administração de ciclos, autorização de leitura, administração de questionários e configuração de segurança. Repositórios simulados; nenhuma integração SQL habilitada.
- Vitest: 39 testes existentes aprovados nos arquivos `CycleAdministrationPanel.test.tsx` e `client.test.ts`.
- Revisão documental: scanner de segredos sem achados, UTF-8 válido, `git diff --check` e Prettier do relatório aprovados. Somente este relatório e o `STATES.md` são alterações versionáveis da tarefa; ensaios e saídas permanecem em diretórios ignorados. Recuperação documental não exige mudança de aplicação ou dados.
- Oito ensaios adicionais de diagnóstico aprovados, com componentes/cliente reais e API integralmente simulada. Arquivo local ignorado: `frontend/coverage/incident-diagnosis-20260915/incident.test.tsx`. Comando histórico de diagnóstico: `npm test -- coverage/incident-diagnosis-20260915/incident.test.tsx`. Após a correção, `coverage/**` está excluído da descoberta normal; as regressões corretivas foram versionadas em `src`. Esses ensaios afirmam o comportamento observado, inclusive os defeitos; não são regressões que certificam uma correção.
- Ensaio de serialização no contexto Spring isolado: `backend/target/cycle-incident-diagnosis-20260915/SerializationProbe.java`; resultado em `serialization-probe.log`. Executado com o Java usado pelo Maven. O primeiro ensaio encontrou Java 17 no PATH e o seguinte exigiu a origem CORS fictícia do contexto de teste; ambos foram ajustados somente no ensaio local.
- Não houve alteração de código da aplicação, contrato, dependência, migration ou serviço. Gate completo, auditorias de dependências, navegador real e SQL não foram reexecutados para este diagnóstico documental. Os testes executados não certificam o ambiente produtivo.

## Trabalho delimitado no diagnóstico (executado na correção abaixo)

1. Corrigir estado de carregamento, erro e vazio nos três painéis e preservar erro de leitura ao abrir um formulário novo.
2. Corrigir paginação defensiva, com testes de cursor repetido/ausente e resposta inválida.
3. Acrescentar rastreabilidade segura e distinguir CSRF de autorização antes de repetir escritas.
4. Alinhar ajuda/validação de experiência do formulário à regra de ciclo vigente e cobrir contrato real, preservando a autoridade do servidor.

O rastreamento local está concluído; o incidente produtivo permanece sem causa técnica individual confirmada. Sua confirmação exige a requisição afetada ou evidência correlacionada equivalente. Não há recomendação de recriar questionários, conceder permissões, modificar datas de negócio ou reiniciar produção com base apenas nas capturas.

## Correção local e verificação — ADC-COR-007 a ADC-COR-010

Autorização: o usuário solicitou “corrija e teste”. Foram corrigidos os comportamentos reproduzidos, sem alterar regras de negócio, permissões, dados ou migrations.

- **Leitura e recuperação:** Ciclos, Cadastros e Vínculos processam cada consulta separadamente, aproveitam resultados válidos, distinguem indisponibilidade de coleção vazia e ignoram respostas de uma carga substituída. Novo ciclo preserva falhas de leitura e continua apenas abrindo o formulário. Questionários, Contas, Avaliações e Indicadores também identificam a operação de leitura nas mensagens.
- **Paginação:** o cliente rejeita cursor ausente/inválido e detecta repetição antes de enviar outra chamada. A mudança alcança todos os consumidores de `listAllCycles`. Não foi comprovado que a API produtiva tenha emitido esses cursores.
- **Rastreabilidade:** erros apresentados incluem `requestId` validado; ciclos e questionários retornam `reasonCode` estável. Respostas de falha tratadas registram método, rota-modelo/família, status, código, motivo e referência. O teste verifica ausência de corpo, query, identificador individual, cookie e autorização no log. Rejeições CSRF usam `CSRF_INVALID`; apenas elas permitem uma repetição automática da escrita.
- **Formulário:** instruções e validação local cobrem código, janela/fuso vigentes e seleção de questionários; o servidor continua validando tudo. Fixtures anteriores com datas inválidas foram corrigidas, mantendo os testes da perda de edição.

### Evidência da correção

1. Gate iniciado em worktree isolado: scanner de segredos, sintaxe PowerShell, manifesto/launchers, regras de migrations, build Java/TypeScript/Vite, formatter/lint, **209 testes Java sem falhas (três SQL opt-in ignorados)** e **162 testes front-end aprovados**. Log: `backend/target/cycle-recovery-gate.log`.
2. A primeira execução parou na descoberta do Edge: o navegador escrevia `DevToolsActivePort` no perfil exclusivo, mas não repassava o endereço pelo stderr do launcher. O executor agora aceita esse arquivo. **Nenhum timeout foi ampliado.** A suíte inteira de navegador passou após essa correção; logs: `backend/target/cycle-recovery-browser.log` e `cycle-recovery-browser-final.log`. A inspeção das capturas levou a um ajuste de alinhamento dos campos com ajuda; build e suíte Edge foram repetidos após esse ajuste.
3. **Edge real, 375 e 1440 px:** clique em Novo ciclo sem escrita, falha GET tardia com referência preservada e sem falso vazio, recuperação por Atualizar, bloqueio de data inválida sem POST e criação válida com um único POST. Componentes React e cliente HTTP reais; transporte inteiramente simulado com dados fictícios. Capturas: `backend/target/cycle-recovery-375.png` e `cycle-recovery-1440.png`. Não é teste de persistência SQL nem autenticação produtiva.
4. Contrato HTTP em MockMvc com controllers, regras de domínio, advice e filtro reais; serviço simulado: criação válida 201, configurações inválidas 422 com motivo específico e cursor GET inválido 422. Filtros de segurança reais distinguem CSRF de falta de permissão.
5. Etapas restantes executadas separadamente após o navegador: SBOM CycloneDX/OSV sem achados e npm sem vulnerabilidades. Validação das **14 migrations e do SQL em modo somente leitura** passou separadamente no workspace, porque o worktree não recebeu configuração protegida. Logs: `cycle-recovery-java-audit.log` e `cycle-recovery-database.log`, em `backend/target`.
6. Build isolado para preservar o front-end servido pelo preview produtivo. Comparação SHA-256 dos 14 arquivos de `frontend/dist` antes/depois sem diferenças; listeners produtivos mantiveram endereço e PID. Evidência: `backend/target/cycle-recovery-production-verification.json`. Fontes testadas conferidas contra o workspace.

### Limites e recuperação

O incidente produtivo original ainda não tem causa individual confirmada e a correção **não foi publicada**. Os novos códigos/logs só estarão disponíveis no ambiente ativo depois de publicação autorizada. Para compatibilidade, publicar a API antes da SPA: com API antiga, o cliente novo não repete um 403 sem código CSRF e exige nova tentativa manual. Nenhum controle de autorização foi relaxado.

O aviso conhecido de bundle acima de 500 kB permanece. Não foram habilitadas integrações SQL com escrita nem executado aceite assistivo humano. O gate inicial interrompido e as etapas posteriores aprovadas estão registrados separadamente, sem afirmar aprovação de uma execução única.

Recuperação: reverter os arquivos da correção preservando alterações preexistentes; não há migration ou recuperação de dados. Antes de eventual implantação, seguir o runbook existente e validar logs/códigos no ambiente de destino.

## Revalidação para subida — ADC-VAL-011

Após novo pedido do usuário, a criação foi verificada também com **serviços e SQL Server DEV reais**. O teste versionado `CycleCreationDevSqlTests` usa controllers HTTP em MockMvc, principal fornecido pelo ensaio e a conta fictícia existente; não usa login nem servidor produtivo. Confere alvo DEV e rollback obrigatório antes de escrever.

Passaram consulta de versões aprovadas, rejeição de data inválida antes da gravação, criação 201, datas/versão/questionário e auditoria persistidos dentro da transação, leitura paginada, edição 204 e duplicidade 409. Ao final, conferida ausência do ciclo, da transição e da auditoria do teste. Nenhuma conta/schema/migration foi criada; dados existentes preservados. Uma expectativa inicial do teste sobre código em minúsculas foi corrigida para a normalização vigente em maiúsculas; nenhuma nova correção na aplicação foi necessária.

O gate completo das fontes terminou com código 0 no worktree isolado, usando `-SkipDatabase` e validação SQL/migrations somente leitura separada na raiz: 210 casos Java, quatro opt-in ignorados no gate, sendo o novo caso SQL executado explicitamente com sucesso; 162 testes front-end; suíte Edge completa; builds, formatter/lint, scanner, SBOM/OSV e npm aprovados. Assim, 207 casos Java executados e aprovados entre as duas execuções; três integrações antigas continuam não executadas.

Preflight `iniciar-prod.bat --check` aprovado. Fontes testadas conferidas por hash contra o workspace; `frontend/dist` e listeners produtivos preservados. Logs em `backend/target/cycle-release-{sql,gate,database,preflight,operation}.log` e conferência em `cycle-release-source-verification.json`. Instruções de reprodução no [guia de qualidade](../quality.md#criação-de-ciclo-com-sql-server-dev-e-rollback).

**Candidata validada para a atualização das correções reproduzidas; publicação não executada.** Atualizar API antes da SPA. A causa individual do incidente original e o comportamento autenticado em produção continuam sem nova evidência; os pré-requisitos externos históricos não foram alterados.

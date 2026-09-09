# Estado atual — Avaliação de Desempenho e Competências

> Atualizado em 2026-09-09. Inclui a publicação técnica solicitada em produção (`ADC-COR-005`), após corrigir os launchers e executar o gate completo pelo BAT. Preserva as evidências anteriores de auditoria, massa DEV, interface e filtros. A publicação técnica não substitui os pré-requisitos externos de negócio, dados e infraestrutura registrados abaixo.

## Resultado vigente

`ADC-COR-005`: publicação concluída pelo `iniciar-prod.bat`, com código 0 e gate completo aprovado no Windows PowerShell. API e front-end estão online no PM2 e acessíveis nos hosts HTTPS previstos. Os 11 processos de outros sistemas mantiveram PID, status e contador de reinícios.

`ADC-COR-001`: os cinco achados da auditoria foram corrigidos no código. `ADC-DEV-002`: a massa complementar foi efetivamente gravada em `AVALIACAO_DEV`, validada por API e preservada na reexecução. Gate final completo aprovado, com revisão do diff e evidências abaixo.

Nas tarefas anteriores `ADC-COR-001` e `ADC-DEV-002`, não houve escrita em PROD, migration nova, mudança de concessões, deploy de produção ou exclusão de avaliação/histórico. As alterações preexistentes do usuário foram preservadas. Na etapa anterior de auditoria/massa, o DEV foi recompilado e iniciado com o back-end atualizado para testar as jornadas reais. A integração de tabelas não iniciou/encerrou serviços nem gravou dados no banco.

## Publicação técnica — ADC-COR-005 concluída

O usuário solicitou explicitamente corrigir e concluir a subida para produção após as falhas do launcher. A execução ocorreu em 2026-09-09, entre 18:29 e 18:36 (America/Sao_Paulo), pelo BAT existente. Os dois processos deste projeto estavam parados antes da publicação. O teste negativo do launcher passou no Windows PowerShell: o stderr esperado das tentativas inválidas é capturado antes da verificação dos códigos de saída, com restauração da preferência de erros ao final. Não foi removida nenhuma etapa do gate.

- Preflight `iniciar-prod.bat --check`, verificação operacional, scanner de segredos, sintaxe PowerShell, manifesto mínimo PM2 e regressão dos launchers aprovados. Dependências locais íntegras, incluindo `vite/client` e `@types/node`, reutilizadas pelo hash do lockfile.
- Maven: 201 testes, zero falhas/erros e três testes SQL condicionais não habilitados. Front-end: Prettier, Oxlint, 142 testes em 15 arquivos, build TypeScript/Vite e regressões no Edge aprovados. SBOM/OSV e npm sem vulnerabilidades encontradas. Migrations e validações SQL executadas somente em modo leitura, com sucesso.
- Release Java ativo: `backend/target/releases/d24220d0c772424bbdc80b084ed52ea1/avaliacao-desempenho-api-0.0.1-SNAPSHOT.jar`; SHA-256 `111D26B5958EF14F02A14990732E6E6AAB53BBCDBBFCA2AD1EB80A5D5B4C7328`. Base Git `bf5c3c0`, com as correções operacionais locais descritas em `ADC-COR-004`.
- `avaliacao-api-18081` e `avaliacao-front-18080` online, sem reinícios, com listeners exclusivamente em `127.0.0.1:18081` e `127.0.0.1:18080`. Validador do runtime PM2 aprovou ambiente mínimo, contrato de inicialização e logs; `pm2 save` concluído. Os 11 outros processos permaneceram inalterados.
- Front-end privado/público e endpoint CSRF privado/público retornaram HTTP 200. `/api/v1/auth/me` e `/api/v1/assessments` retornaram 401 sem sessão. HSTS, CSP, `nosniff` e proteção contra framing presentes nos seis retornos. O host público entrega `/assets/index-BhtRQHKb.js`, correspondente ao build local e contendo a base pública correta da API. Nenhum login ou teste autenticado foi executado em produção.
- Evidências locais ignoradas pelo Git: `backend/target/publication-20260909.log`, `production-http-verification-20260909.json` e `production-process-baseline-20260909.json`. Recuperação: JAR anterior preservado no release `bcb9649bcdad46a1bb80226886f5e533`; snapshot do `dist` anterior e argumentos anteriores dos dois processos em `backend/target/production-rollback-20260909-182907`. Rollback não precisou ser executado nem foi ensaiado nesta tarefa.
- Não houve migration, carga, concessão, exclusão de histórico ou mudança em Cloudflare/firewall/SQL Server. Permanecem o aviso conhecido de tamanho do bundle e os pré-requisitos externos abaixo. A checagem operacional confirmou Cloudflared ativo/automático e reiterou o firewall desabilitado; o diretório de logs foi validado pelo preflight do BAT com a configuração externa carregada.

## Filtros no DEV em execução — ADC-COR-003 concluída

O defeito relatado estava na versão em execução: a SPA já enviava os quatro campos, mas a API DEV iniciada às 14:07 executava um JAR anterior. Uma reprodução autenticada confirmou que os quatro parâmetros devolviam a mesma página sem filtro; nomes inexistentes também retornavam resultados. A inspeção do controller compilado no JAR confirmou ausência de `evaluatedName` e `managerName`. Não foi necessário alterar a implementação da SPA, o contrato ou o SQL dos filtros.

A instância DEV foi recompilada e reiniciada com `scripts/iniciar-dev-local.ps1`, preservando a porta 5080 e a origem do Dev Tunnel já configurada, previamente confirmada na allowlist CORS da API local. O JAR atual está em `backend/target/dev-local-releases/7c96dc41a3324cbc9d73bba77da048ce`; o anterior foi preservado. O reinício exige novo login. O proxy local da SPA respondeu HTTP 200 com JSON de CSRF; o acesso externo pelo Dev Tunnel não foi recertificado por ensaio autenticado.

Novo `scripts/testar-filtros-avaliacoes-dev.ps1`: 19 cenários aprovados contra a API ativa e o ciclo fictício existente `DEV-COMPLETO-FLUXOS`, com comparação independente da projeção SQL. Cobre cada nome completo/parcial, três avaliadores, exclusão de autoavaliações pelo filtro de gestor, nomes inexistentes, cada status de avaliação/feedback, quatro campos combinados por E, combinação vazia, limpeza, paginação de dois itens e enums inválidos (HTTP 422). Somente consultas de negócio; login/logout geraram suas sessões/auditorias normais. Nenhuma avaliação, cadastro, concessão ou migration foi alterada.

Gate completo `target/assessment-filters-runtime-verification` aprovado: 201 testes Java (três opt-in ignorados), 142 testes front-end, builds/formatter/lint, Edge, scanner, SBOM/OSV e npm sem achados, 14 migrations/SQL somente leitura. Os dois testes SQL com CTEs fictícias passaram separadamente em `target/assessment-filters-runtime-sql`. Após finalizar o novo ensaio, scanner de segredos, sintaxe PowerShell, UTF-8 e `git diff --check` aprovados; os dois processos produtivos mantiveram PID/data de criação. Logs locais ignorados: `backend/target/assessment-filters-runtime-{gate,api,sql,restart}.log`. O ensaio da API é opt-in porque depende de DEV/massa/credenciais locais; o gate das fontes sozinho não comprova atualização do serviço ativo. Permanecem os limites de bundle e aceite assistivo humano já registrados.

## Grade e paginação dos cartões de avaliação — ADC-UI-054 concluída localmente

Títulos dos cartões não quebram mais linha: recebem reticências quando excedem a coluna e preservam o nome integral no atributo `title`, exibido pelo tooltip nativo ao passar o mouse. O selo continua reservado na mesma linha. Cartões da mesma página/linha passam a esticar até a mesma altura e o rodapé de ações ocupa a régua inferior; botões não quebram o texto.

A grade é previsível e a página é recarregada do início ao cruzar a largura, sem reutilizar cursor em outro limite: abaixo de 48,0625 rem há uma coluna e dois itens; de 48,0625 a menos de 80 rem, duas colunas e quatro itens; a partir de 80 rem, três colunas e seis itens. Assim, cada página contém no máximo duas linhas, mantendo o cursor opaco, filtros e autorização integralmente no servidor. O contrato já aceita `limit` de 1 a 100; nenhuma rota, migration, dependência, dado ou permissão foi alterada.

Vitest cobre o atributo do título e o limite largo de seis itens; Edge verifica título sem quebra/reticências, o tooltip nativo, colunas por largura, altura/régua dos cartões e botões nos temas claro/escuro. Aceite visual/assistivo humano permanece externo; nenhum serviço foi reiniciado e nenhum deploy foi feito.

## Transição de rolagem da sidebar — ADC-UI-053 concluída localmente

A indicação de que há itens fora da área visível do drawer deixou de aplicar `backdrop-filter`: o efeito desfocava o texto do menu e formava uma faixa brusca. Ela agora usa somente um gradiente translúcido curto de 1,8 rem, com superfície mais opaca e régua discreta nos controles de subir/descer. As setas, a rolagem, o foco visível, o teclado, a redução de movimento, as rotas e as permissões existentes foram preservados.

A regressão em navegador real passou a exigir as duas faixas, ausência de `backdrop-filter` e altura máxima de 30 px, em claro/escuro e 320/375/768/1024/1440 px. Não houve alteração de JSX, dependência, API, banco, impressão, serviço ou deploy. O aceite visual/assistivo humano continua externo.

## Navegação lateral e cartões — ADC-UI-052 concluída localmente

A navegação lateral existente permanece como drawer contextual à direita; recebeu hierarquia visual de lista, grupos mais legíveis, item atual sóbrio e guia vertical para os subitens de Administração. Rotas, módulos disponíveis por perfil, foco, abertura/fechamento e permissões não foram modificados. A referência foi aplicada como linguagem visual, sem deslocar o drawer para outra borda nem criar itens de navegação novos.

Cartões de superfície foram simplificados para fundo sólido, borda discreta, raio consistente e sombra curta nos dois temas. A lista de avaliações agora possui zonas semânticas de identificação/status, contexto e ação: títulos longos podem quebrar sem invadir o selo, metadados e rodapé são separados por réguas leves, e cartões não interativos não ganham animação ou cursor de ação. Não houve mudança de resumo retornado, filtros, callback de abertura, API, banco, impressão ou regra de acesso.

Foram acrescentadas regressões do cartão real e ensaio Edge para navegação/cartões: cinco larguras (320–1440 px), claro/escuro, hierarquia do subnível, ausência de overflow, foco de teclado, ação com alvo mínimo e hover neutro no cartão da avaliação. Capturas fictícias foram inspecionadas; o aceite visual/assistivo humano continua externo. Nenhuma dependência, migration, escrita de dados, reinício de serviço ou deploy foi realizado.

## Filtros da lista de avaliações — ADC-UI-051 concluída localmente

Implementados os quatro filtros solicitados, combináveis por E: nome do colaborador avaliado, nome do gestor avaliador, status da avaliação e status do feedback. A busca por trecho ignora caixa/acentos, mas mantém caracteres SQL literais. Feedback usa a situação efetiva da versão atual; autoavaliação não corresponde ao filtro de gestor. Os filtros reduzem o conjunto autorizado no SQL antes do cursor/limite, sem mudar permissão, projeção, cálculo ou estado persistido.

Interface responsiva com Aplicar/Limpar, início na primeira página ao mudar a busca, filtros preservados na navegação e proteção contra respostas obsoletas. Ao voltar do editor, os quatro valores aplicados reaparecem nos campos, cobertos por regressão específica. Localização por ciclo/colaborador e pré-visualização administrativa existentes foram preservadas. CSS restrito ao novo componente; nenhum ajuste adicional nos botões globais, impressão ou tabelas. A alteração HTTP é aditiva em v1 e exige back-end atualizado antes do front-end para que os parâmetros sejam reconhecidos; o DEV em execução não foi reiniciado.

Gate completo `target/assessment-filters-verification` aprovado: 201 testes Java, zero falhas/erros e três casos SQL opt-in ignorados no ciclo padrão; 139 testes front-end naquela rodada, builds/formatter/lint, scanner, SBOM/OSV sem achados, npm sem vulnerabilidades e 14 migrations/SQL somente leitura. Após a correção de retorno do editor, toda a validação front-end foi repetida: 140 testes em 15 arquivos, formatter/lint/build e ensaio Edge aprovados. Na reexecução, uma corrida de tempo no ensaio antigo da cortina foi corrigida para aceitar o overlay já removido ao mudar a mídia; continuou exigindo ausência/ocultação na impressão e callback único, sem alteração no componente de tema.

Dois testes opt-in de SQL Server passaram separadamente em `target/assessment-filters-sql`, executando SQL/bindings reais sobre CTEs fictícias somente leitura (sem tabelas/dados reais). Abrangem filtros combinados, acentos, caracteres literais, três páginas, ausência de permissão, autor alheio, ator inexistente, vínculo revogado, autoavaliação e status. O teste histórico de rotação de sessão com escrita permaneceu ignorado. Edge validou quatro campos em cinco larguras/dois temas, grade, limites, teclado/foco; capturas desktop/celular inspecionadas. Impressão A4/21 notas, opções desabilitadas, botões compactos, tabela de vínculos e cortina continuaram aprovados. Aviso de bundle acima de 500 kB permanece conhecido (aproximadamente 617 kB JS/514 kB CSS), sem nova dependência ou limite silenciado.

Nenhuma migration, dependência nova, escrita em banco, concessão, reinício de serviço ou deploy nesta tarefa. Detalhes de uso, contrato, testes, limites e recuperação: [filtros-avaliacoes.md](docs/operations/filtros-avaliacoes.md).

## Botões globais compactos — ADC-UI-050 corrigida e validada localmente

O usuário apontou regressão real após o primeiro gate: o botão Encerrar ficou vertical na tabela de vínculos. A regra nova `overflow-wrap: anywhere` permitiu quebrar palavra dentro da coluna de ação com `width: 1%`. O ensaio anterior verificava overflow, mas não altura/linhas do rótulo nessa tabela com ícone. A quebra por letra foi removida e a largura intrínseca de ícone + texto reservada nas ações da tabela desktop. O gate anterior (`target/global-buttons-verification`) não detectou esse defeito e não foi usado como evidência suficiente da correção.

Nova regressão executada com o `RelationshipAdministrationPanel` real, sete vínculos fictícios e API simulada sem escritas: 14 casos, em sete viewports/densidades e dois temas. Todos mantiveram Encerrar em uma linha e altura de 36 px, com ícone de 18 px, sem inflar linhas desktop ou ultrapassar a célula. Confirmação/cancelamento e paginação passaram. O teste de sensibilidade reaplicou o CSS antigo e reproduziu a quebra nos dois temas. Capturas claras/escuras foram inspecionadas. DPR 1,5/2 e viewport reduzido são emulação de layout/densidade, não aceite manual de zoom.

Escala compacta solicitada preservada: ações comuns com altura mínima de 38 px, tabelas/ícones com 36 px, ícones Lucide de 18 px, cantos de 10 px e separação de 8 px. Preenchimento sólido e saturação consistente, preservando azul/verde/vermelho/neutro conforme a ação. Texto branco nas ações coloridas; contraste mínimo medido de aproximadamente 4,64:1 nos cenários habilitados. Rótulos quiet voltaram a ficar visíveis no celular.

A única folha de produção alterada nesta tarefa é `frontend/src/visual-skin.css`: bloco compartilhado de botões, tokens de estado e indicador de paginação. Não há JSX/callback/permissão/API/banco alterado, nova dependência ou deploy. Desabilitados não recebem ponteiro/hover; foco e movimento reduzido permanecem acessíveis. Cartões de jornada, ajuda e estrutura de navegação não foram convertidos em botões de formulário. As mudanças anteriores do usuário foram preservadas.

Novo gate completo `target/global-buttons-regression-fix` aprovado após corrigir a regressão: 194 testes Java (zero falhas/erros, uma integração SQL opt-in ignorada), 126 testes front-end em 14 arquivos, build/formatter/lint, scanner, SBOM/OSV, npm e 14 migrations/SQL somente leitura. Edge validou o painel real acima e 16 variantes/contextos em cinco larguras e dois temas (160 combinações), incluindo contraste, escala compacta, ícones, rótulos, foco, hover inativo e movimento reduzido. Tabelas, cortina e impressão A4 de uma página/21 notas também passaram.

O ensaio da cortina agora restaura `NODE_ENV` após o build em memória para não misturar renderers React dev/prod em testes subsequentes; isso não afeta a SPA. Nenhuma vulnerabilidade nova encontrada. O aviso anterior de bundle acima de 500 kB permanece visível, sem ampliar dependências nesta tarefa. Detalhes e recuperação: [botoes-globais.md](docs/operations/botoes-globais.md).

## Alternância de tema com cortina — ADC-UI-049 concluída

O componente anexado pelo usuário foi integrado em `frontend/src/components/ui/curtain-theme-toggle.tsx`, substituindo somente os botões de tema do cabeçalho autenticado e de `AuthPageFrame` (login/restauração/troca de senha). O CSS próprio preserva o layout, as cores e as dimensões existentes. `App` continua responsável por `data-theme` e pela preferência visual `adc-theme`; não há classe global `dark`, storage adicional ou mudança de autenticação/permissões.

A troca ocorre após a descida da cortina, com `animationend` e timeout de segurança. A implementação impede cliques/teclas repetidos, conserva foco, respeita movimento reduzido, finaliza antes de imprimir e cancela timers/listeners ao desmontar. As variantes e a demonstração permanecem importáveis, sem criar rota nem sobrescrever o demo da tabela. Nenhuma nova dependência, edição de estilos globais ou alteração do trabalho anterior de tabelas; nenhum serviço/deploy ou escrita em banco.

Gate completo em `target/curtain-theme-verification` aprovado. A rodada do gate executou 125 testes front-end; após acrescentar uma regressão de login/persistência e remover um aviso de lint exclusivo da fixture, a suíte completa foi reexecutada: 126 testes em 14 arquivos, lint sem avisos e formatação aprovada. Edge mediu quadros reais da descida/subida em 375/1440 px, Enter/foco, tema das tabelas, campo preservado, movimento reduzido, impressão e desmontagem. Regressões anteriores de A4/21 notas, hover desabilitado e dez variações de tabela nos dois temas também passaram. Screenshots fictícios foram inspecionados, sem alegar aceite humano assistivo.

Bundle atual: aproximadamente 613 kB JS/514 kB CSS (171/54 kB gzip); o aviso anterior de chunk acima de 500 kB permanece visível. Instalação/estrutura, adaptações em relação ao exemplo, limites e recuperação: [alternancia-tema-cortina.md](docs/operations/alternancia-tema-cortina.md).

## Tabelas administrativas — ADC-UI-048 concluída

Conforme escolha explícita do usuário, Reshaped foi aplicado a todas as tabelas dos cinco painéis administrativos: contas, cadastros, vínculos, questionários e ciclos. `reshaped@4.1.0` foi fixado no package/lockfile, sem atualizar ou remover versões de dependências existentes. React/TypeScript/Tailwind já estavam configurados; foram acrescentados o diretório `frontend/src/components/ui` e o alias `@/` no TypeScript/Vite.

O componente solicitado reexporta o pacote real; a adaptação administrativa usa seus slots com raiz `table` e `caption` nativos para manter semântica, rótulos e seletores responsivos. O provider Slate é local e acompanha o tema existente. Comparação dos cinco painéis após normalização/transpilação confirmou somente trocas de tags e import: callbacks, filtros, ações, paginação e regras de negócio foram preservados. Nenhuma edição em `index.css`, `App.css`, `visual-skin.css`, formulários de avaliação, indicadores, impressão, permissões ou API.

Gate completo aprovado em `target/reshaped-table-verification`, com 115 testes front-end, ensaio Edge de dez variações em cinco larguras e dois temas, isolamento de estilos representativos, sem overflow/células cortadas nos cenários medidos e impressão mantida em uma página A4. O modo scoped não é um sandbox; a biblioteca mantém listeners globais internos. O bundle passou para aproximadamente 610 kB JS/511 kB CSS (170/53 kB gzip), mantendo visível o aviso Vite de chunk acima de 500 kB. Otimização ampla de carregamento não foi incluída nesta mudança localizada. Estrutura, instalação opcional do CLI shadcn, demonstração, limites e rollback: [tabelas-administrativas-reshaped.md](docs/operations/tabelas-administrativas-reshaped.md).

## Correções da auditoria

| Achado | Estado corrigido e evidência |
| --- | --- |
| RH via controles de edição/envio/feedback de outro autor por ter permissões globais | O detalhe da API agora inclui `allowedActions` por ator/recurso, reutilizando os guardas das escritas. A interface exige o respectivo booleano verdadeiro; campo ausente mantém consulta. Testes de componente e chamadas reais confirmam ações próprias e negação `403` para edição/feedback alheios. Não houve bypass prévio comprovado no servidor. |
| Padding responsivo reaparecia na impressão e quebrava em duas páginas | A regra de impressão agora também cobre a especificidade de `.application-shell:not(...)`. PDF real do Edge com CSS compilado, 21 competências e cabeçalho extenso: uma página A4, folha começando no topo e sem página em branco. |
| Radar ampliado nominalmente, mas rótulos físicos pequenos | Área SVG impressa de aproximadamente 188 mm, viewBox sem sobra vertical e rótulos físicos medidos em aproximadamente 3,1 mm. Lista completa e não paginada das 21 notas abaixo; assinatura e data à direita. |
| BAT retornava sucesso depois de falha no PowerShell | Captura de `ERRORLEVEL` fora dos blocos condicionais. Testes com URL inválida nos modos direto/interativo retornam falha; cancelamento retorna 2. Existe somente `iniciar-dev.bat`, sem atalho duplicado. |
| Encerramento pré-produção ignorava Vite em porta dinâmica de Dev Tunnel | Descoberta pelo executável exato do projeto e identidade do processo, incluindo porta 5080. Revalidação de PID/data de criação antes de encerrar; alvo desconhecido aborta. Testes usam processos simulados, sem encerrar processos reais ou publicar em PROD. |

A retirada do plano de ação preserva o valor legado ao salvar; banco e contrato continuam compatíveis. Alternativas realmente desabilitadas mantêm seleção, não aceitam ponteiro e não mudam com hover, validado no Edge. Isso agora também vale para o rascunho alheio que antes aparecia indevidamente editável no RH.

A regressão autenticada antiga esperava que o RH sem permissão de feedback fosse negado na camada HTTP. Após `V0014`, RH possui feedback próprio e deve ser negado por autoria no recurso. O teste foi corrigido para exigir as duas negações por autoria (RH/Diretoria) e conservar a negação HTTP do Administrador técnico; não se removeu o teste de segurança.

## Massa complementar DEV

| Cenário | Estado inicial verificado |
| --- | --- |
| `DEV-COMPLETO-LIVRE` | Aberto e sem avaliações, com oito opções de equipe para RH/Gestor, duas gerências para Diretoria e vínculos de autoavaliação. |
| `DEV-COMPLETO-FLUXOS` | 21 avaliações: dez de gestor publicadas, duas enviadas, quatro rascunhos (dois parciais/dois reabertos), três autoavaliações publicadas e duas Diretoria–Gerência publicadas. |
| `DEV-COMPLETO-CONFIG` | Rascunho com questionários/atribuições para testar configuração e abertura. |
| `DEV-COMPLETO-FUTURO` | Aberto, com encerramento futuro e uma autoavaliação publicada; fechamento antecipado negado com 409. |
| `DEV-COMPLETO-ENCERRADO` | Janela passada e encerramento realizado pela API; sem avaliações individuais. |

Foram acrescentados 20 colaboradores fictícios (19 ativos e um inativo), filiais/áreas ativas e inativas, lotações com vigência/autoria e lotação histórica encerrada, vínculos de avaliação e de autoavaliação do RH. Duas pessoas já existentes foram reutilizadas para autoavaliação. Os quatro primeiros ciclos têm 21 atribuições cada (84), cobrindo Operacional, Administrativo e Liderança; o ciclo encerrado também possui os três questionários aplicados.

Cada equipe de `FLUXOS` tem cinco avaliações publicadas com notas 80/90/100/110/120. Há comentários, datas/conclusões de feedback, pendências e histórico de reabertura. API confirmou média agregada 100 e CSV agregado; filial com duas pessoas elegíveis é suprimida. Os resultados foram calculados pelo servidor, não inseridos por SQL.

As quatro contas de teste existentes e suas senhas foram preservadas. Uma conta técnica fictícia comum, não suprema, foi adicionada para testar contas/cadastros. Credenciais ficam somente nos CSV locais protegidos e ignorados pelo Git: `secrets/contas-teste-dev.csv` e `secrets/conta-admin-teste-dev.csv`.

Roteiro, comandos, finalidade de cada ciclo e recuperação: [massa-complementar-dev.md](docs/operations/massa-complementar-dev.md). Consulta padrão é somente leitura; `-Populate` exige a opção explícita e não altera uma carga já concluída. `-Validate` confere a massa inicial por API, sem editar avaliações/cadastros, com sessões e auditorias normais. Testes manuais podem modificar as quantidades esperadas dessa validação; ela nunca restaura dados automaticamente.

Campos nulos previstos pelo fluxo foram mantidos: rascunho sem resultado, vínculo vigente sem encerramento, feedback pendente sem conclusão e autoavaliação sem feedback. Não se criaram concessões excepcionais ou preenchimentos falsos apenas para eliminar valores nulos.

## Escopo e autorização vigentes

- Monólito React + TypeScript / Java / SQL Server, execução direta na VM, sem Docker obrigatório. Cadastros, contas/perfis, vínculos, questionários versionados e ciclos disponíveis na API/SPA responsiva.
- Avaliações seguem `RASCUNHO → ENVIADA → PUBLICADA`; reabertura registra nova versão e preserva histórico. Feedback de avaliação de equipe/Diretoria publicada pertence somente ao avaliador original.
- Nota/classificação, permissões, escopo, janela e estado são autoridades do servidor. Configuração versionada `2024.1`, escala 80–120; autoavaliação não altera resultado da avaliação de gestor.
- `GERENCIA_RH` pode avaliar sua equipe e realizar autoavaliação conforme `V0014`, com conta ativa, vínculos vigentes, ciclo e questionário atribuídos. Não recebe autoridade sobre respostas ou feedback alheios.
- Contas e concessões: Administrador técnico possui `USUARIOS.LER`; RH possui administração de acesso de negócio, mas não consulta de contas por padrão. A carga não ampliou essa permissão. Administrador técnico continua sem avaliações, indicadores e exportação.
- Indicadores e CSV usam agregação SQL e supressão integral abaixo de cinco colaboradores distintos. Sessões usam cookies seguros, refresh rotativo/revogável, CSRF, CORS restrito, rate limit e auditoria minimizada.
- `allowedActions` é extensão aditiva do detalhe HTTP v1. Publicar back-end compatível antes do front-end; cliente novo com API antiga fica em consulta. Nenhuma migration é necessária para esse contrato.

## Evidências executadas em 2026-09-08

| Área | Resultado |
| --- | --- |
| Back-end | Maven Verify: 201 testes, zero falhas/erros e três casos SQL opt-in ignorados no ciclo padrão. Dois deles executados separadamente em leitura sobre CTEs fictícias; o caso histórico com escrita não foi executado. Build e Spotless aprovados. |
| Front-end | 142 testes em 15 arquivos após ADC-UI-054; Prettier, Oxlint sem avisos e build aprovados. Inclui a regressão de estrutura semântica/alinhamento dos cartões, título truncado com tooltip nativo, paginação de duas linhas e transição curta sem desfoque do drawer, além dos filtros, autorização, tabelas e tema. |
| Navegador real | Edge headless com componentes e CSS compilado: uma página A4 com 21 notas, início no topo, rótulos medidos e alternativa desabilitada sem hover. A medição aguarda fontes/renderização e a sincronização do layout paginado pelo PDF. Tabelas administrativas verificadas em 320/375/768/1024/1440 px, temas claro/escuro e comparação de estilos representativos fora das tabelas. Cortina React real validada em 375/1440 px, teclado/foco, ambos os sentidos, movimento reduzido, impressão e desmontagem. |
| API/SQL reais DEV (etapa anterior) | `scripts/testar-fluxo-feedback-dev.ps1` passou após atualizar a expectativa de V0014: repositórios, sessão/CSRF, concorrência, idempotência, histórico/feedback, indicadores/CSV e negações por perfil/recurso. Não foi reexecutado na tarefa visual; o gate atual fez apenas validação SQL somente leitura. |
| Massa DEV | `-Populate` concluído, reexecução sem alteração/duplicação, `-Validate` aprovado; inventário SQL confirmou cinco ciclos, 22 avaliações complementares, 20 novas pessoas e 84 atribuições. |
| Launchers | Teste de porta dinâmica, alvo desconhecido, propagação de falha e cancelamento aprovado; não houve encerramento real de processos por esse teste. |
| Botões em navegador real | 160 combinações (16 variantes × cinco larguras × dois temas), contraste habilitado mínimo de 4,64:1, ações compactas, ícones de 18 px, sem rótulos cortados/ocultos nos cenários medidos, sem hover inativo e com foco por Tab. Mais 14 casos no painel real Diretoria–Gerência: Encerrar em uma linha/36 px, confirmação, cancelamento, paginação e reprodução controlada do defeito com o CSS antigo. |
| Filtros em SQL/navegador | SQL real/bindings sobre CTEs fictícias DEV, com dois testes de combinação/cursor/escopo e estados aprovados; nenhum DDL/DML ou leitura de avaliações reais nesse ensaio. Edge: dez combinações de viewport/tema, quatro campos, sem overflow, grade responsiva, rótulos e foco por Tab. |
| Navegação/cartões no Edge | Ensaio com CSS compilado e dados fictícios em 320/375/768/1024/1440 px, claro/escuro: drawer entre 304–336 px, guia aninhada de 1 px, item atual, cartões sólidos sem gradiente, foco por Tab, sem overflow e sem hover/cursor nos cartões de avaliação. A lista real validou cabeçalho, metadados e rodapé em cada cartão; título de identificação longa em uma linha com reticências/tooltip nativo, régua inferior igual e colunas 1/2/3 conforme a largura. As duas transições de rolagem também foram verificadas sem `backdrop-filter` e com no máximo 30 px. |
| Gate final | `scripts/verify-quality.ps1 -BackendBuildDirectory target/assessment-cards-two-rows-verification` aprovado: scanner, sintaxe, 14 migrations, 201 testes Java, 142 testes front-end, builds/testes/lint, Edge, SBOM CycloneDX com 58 componentes/OSV sem achados, npm sem vulnerabilidades e validação SQL somente leitura. Gate anterior de rolagem: `target/sidebar-scroll-fade-verification`; o antecessor de botões `target/global-buttons-verification` não havia detectado a regressão de Encerrar. |

O catálogo contém 14 migrations imutáveis (`V0001`–`V0014`). A reconciliação DEV/PROD até V0014 já havia sido registrada em 2026-09-08 antes desta carga; não se executou `--apply` nesta rodada. Teste autenticado em PROD permanece fora do escopo por decisão explícita e não volta ao backlog.

O release produtivo e a infraestrutura existentes não foram modificados nem tiveram seu estado corrente recertificado nesta auditoria. Evidências anteriores de PM2, HTTPS e restauração técnica são históricas; não significam que esta correção foi implantada em produção.

## Tarefas pendentes reais

- `ADC-COR-006` pendente de correção (2026-09-09): comparação solicitada pelo usuário confirmou nova falha na suíte, posterior à publicação aprovada. O log das 18:42 passou pelos launchers e Maven, mas registrou 139 testes aprovados e três falhas Vitest: dois testes de questionários excederam 5 segundos; a edição de ciclo enviou o nome anterior. Às 18:31 os 142 testes passaram. Na investigação, duas execuções isoladas dos testes de ciclos e uma execução completa em terminal interativo às 18:47 passaram; esta última incluiu um teste exploratório adicional (143 casos). A hipótese de sobreposição entre destaque visual e edição não reproduziu o defeito no ensaio, que foi retirado sem alterar os testes originais. A causa exata da divergência de nome e dos tempos variáveis continua não confirmada; não declarar a suíte estável nem tratar nova execução aprovada como correção. O validador confirmou os dois processos publicados online, com ambiente e contrato válidos. Nenhuma nova publicação, reinício, alteração de aplicação/dependências ou escrita em banco foi executada nesta investigação.

- `ADC-COR-005` concluída (2026-09-09): BAT completo retornou 0, release publicado, dois processos PM2 online, endpoints HTTPS e acesso sem autenticação verificados; evidências e recuperação descritas acima. Nenhuma pendência técnica conhecida para esta subida; condições externas de uso com dados reais permanecem separadas.

- `ADC-DEV-004` concluída localmente (2026-09-09): os arquivos de tipo ausentes foram restaurados de uma instalação temporária gerada pelo `package-lock`, copiando somente itens inexistentes e sem trocar os arquivos em uso. `npm ls --depth=0`, TypeScript/Vite build, Prettier e 142 testes front-end foram aprovados. Nenhuma versão, configuração TypeScript, API, banco, serviço ou processo foi alterado.
- `ADC-COR-004` concluída localmente (2026-09-09): `iniciar-prod.bat` agora interrompe com código 1 qualquer falha de `npm ci`, antes do gate ou do PM2. O encerramento pré-produção reconhece o Vite DEV executado pelo wrapper npm, mesmo com barra duplicada, mas continua exigindo o binário deste repositório, `--strictPort` e ausência de `preview`. O teste do launcher também passou a tratar somente as três falhas simuladas como esperadas antes de inspecionar seus códigos de saída: no Windows PowerShell, o stderr de processo com erro era lançado como exceção antes da asserção. Testes simulados passaram no Windows PowerShell 5.1 e no PowerShell 7; o ensaio `-WhatIf` identificou somente o PID local da porta 5080. Nenhuma interrupção, início, exclusão ou alteração de processo PM2 foi executada nesta correção.
- `ADC-COR-003` concluída no DEV: build antigo identificado e substituído pelo launcher existente, acesso local preservado, 19 cenários pela API ativa e gate completo aprovados. Necessário novo login após o reinício. Nenhuma publicação em PROD.
- `ADC-UI-054` concluída localmente: títulos em linha única/tooltip nativo, cartões e botões alinhados e paginação responsiva de no máximo duas linhas; cobertura Vitest/Edge e gate completo aprovados. Aceite visual/assistivo humano permanece externo; nenhum deploy é implícito.
- `ADC-UI-053` concluída localmente: blur removido da transição de rolagem, gradiente curto e controles preservados; cobertura Edge adicionada e gate completo aprovado. Aceite visual/assistivo humano permanece externo; nenhum deploy é implícito.
- `ADC-UI-052` concluída localmente: navegação lateral e cartões refinados, com validações completas e sem alteração de comportamento. Aceite visual/assistivo humano permanece externo; nenhum deploy é implícito.
- `ADC-UI-051` concluída no código e nas validações locais; a ativação pendente no DEV foi realizada e validada pela API em `ADC-COR-003`. Aceite visual/assistivo humano permanece externo; nenhuma publicação em PROD.
- `ADC-UI-050` concluída localmente após corrigir a regressão de Encerrar e executar novo gate com geometria do painel real, coluna de ação estreita, dois temas e viewports/densidades variados. Aceite visual do usuário e zoom assistivo manual permanecem externos; nenhum deploy implícito.
- `ADC-UI-049` concluída no escopo local solicitado; aceite assistivo humano permanece no pré-requisito externo já existente, sem deploy implícito.
- `ADC-UI-048` concluída no escopo solicitado; ressalva conhecida de tamanho do bundle e aceite assistivo humano registrados, sem alegação de isolamento absoluto ou deploy.
- Não há pendência técnica conhecida nos cinco achados auditados ou na preparação/validação da massa solicitada; `ADC-COR-001` e `ADC-DEV-002` concluídas no escopo local autorizado.
- As tarefas históricas não autorizam carga real, concessão especial, alteração de infraestrutura ou deploy. A publicação específica solicitada em `ADC-COR-005` foi concluída; isso não autoriza novas mudanças externas.

## Pré-requisitos externos para ativação com dados reais

Estes itens não são backlog de código e não podem ser declarados concluídos sem pessoas, políticas, credenciais ou mudanças de infraestrutura externas ao repositório.

| Condição externa                           | Evidência ainda necessária                                                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dados e aceite de negócio (`ADC-PEND-001`) | Origem, responsável, minimização, manifesto, rollback e autorização da carga real; aprovação RH/LGPD para conteúdo, filtros, indicadores e CSV.                                                                                                             |
| Continuidade administrativa (`ADC-020`)    | Segunda pessoa como administradora suprema e procedimento de recuperação com dois custodiantes reais. A conta existente está ativa e não usa mais a senha inicial.                                                                                          |
| Backup operacional                         | Definir RPO, RTO, retenção, destino, criptografia/chaves e agenda de full/log backup; executar restauração periódica sob essa política. O teste técnico de restauração passou, mas seu backup foi removido e não substitui uma cópia operacional protegida. |
| Rede e SQL Server                          | Inventariar consumidores da instância compartilhada e então restringir TCP 1433/Firewall do Windows sem interromper outros sistemas. Atualmente a instância escuta em todas as interfaces e os perfis do firewall não fornecem a barreira exigida.          |
| Cloudflare/HTTPS                           | Ativar e testar redirecionamento HTTP→HTTPS nos dois hosts, WAF/bot protection e rate limit no edge/proxy confiável. Na evidência final, HTTPS está protegido, mas HTTP ainda retorna `200` sem redirecionar.                                               |
| Retenção e observabilidade                 | Aprovar e automatizar rotação/retenção de logs, sessões/tokens e backups; validar alertas, disponibilidade e recuperação automática do PM2 após reinício da VM.                                                                                             |
| Criptografia em repouso                    | Definir proteção do banco e dos backups e custódia das chaves. Não há TDE nem certificado de criptografia de backup configurado no estado observado.                                                                                                        |
| Acessibilidade manual (`ADC-PEND-019`)     | Executar o [roteiro assistivo](docs/operations/roteiro-validacao-assistiva.md) com navegador-alvo, teclado, leitor de tela, zoom 200/400%, temas e celular. Axe/jsdom não substitui essa validação humana.                                                  |

## Riscos e recuperação

- Os pré-requisitos externos acima permanecem conforme os registros anteriores; rede, Cloudflare, TDE e backup não foram reconfigurados nem revalidados nesta rodada.
- O roteiro de impressão cobre Edge/A4 e dados fictícios representativos, não todas as impressoras, escalas ou futuros questionários. Aceite assistivo/manual permanece externo.
- Uma tentativa inicial da carga de encerrar prazo futuro foi corretamente negada. O ciclo e sua autoavaliação foram preservados sob `FUTURO`; um cenário separado com janela passada foi encerrado pela API. Nenhum gatilho foi desativado ou prazo aberto sobrescrito.
- Massa complementar é identificável e preserva histórico; recuperação deve usar inativação/encerramento autorizados, nunca exclusão de avaliações ou auditoria. O teste autenticado criou e removeu somente suas próprias filiais fictícias descartáveis e associações de questionário em ciclo rascunho; não removeu avaliações ou histórico.
- Credenciais permanecem fora do Git e dos logs. Não copiar massa ou credenciais DEV para PROD.
- O release anterior e o snapshot do front-end foram preservados em `ADC-COR-005`. Consultar [pre-publication-runbook.md](docs/operations/pre-publication-runbook.md) antes de nova implantação ou rollback.

## Documentos operacionais

- [Filtros de avaliações autorizadas](docs/operations/filtros-avaliacoes.md)
- [Botões globais compactos](docs/operations/botoes-globais.md)
- [Alternância de tema com cortina](docs/operations/alternancia-tema-cortina.md)
- [Tabelas administrativas Reshaped](docs/operations/tabelas-administrativas-reshaped.md)
- [Massa DEV e roteiro de testes](docs/operations/massa-complementar-dev.md)
- [Gate de qualidade](docs/quality.md)
- [Contrato HTTP v1](docs/api/contrato-http-v1.md)
- [Regras operacionais](docs/business/regras-operacionais-v1.md)
- [Checklist de prontidão para uso real](docs/operations/checklist-prontidao-uso-real.md)
- [Backup e restauração](docs/operations/backup-restauracao-sql-server.md)
- [Configuração externa](docs/operations/configuracao-externa-da-aplicacao.md)
- [Aceite de segurança pré-liberação](docs/security/aceite-seguranca-pre-liberacao.md)

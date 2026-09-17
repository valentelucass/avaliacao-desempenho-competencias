# Qualidade e verificações locais

## Gate local completo

Execute na raiz do repositório:

```powershell
.\scripts\verify-quality.ps1
```

O comando é um gate local. Ele não cria usuários, dados de negócio, migrations, processos PM2, regras de firewall ou rotas da Cloudflare.

O build grava `frontend/dist`. Se o preview produtivo estiver servindo esse diretório, execute o gate em uma cópia isolada das fontes atuais para não publicar arquivos por efeito do teste. Na correção de ciclos de 2026-09-15, um worktree temporário recebeu as alterações locais, usou as dependências existentes e executou `verify-quality.ps1 -SkipDatabase`; a validação SQL somente leitura foi executada separadamente na raiz autorizada. Um manifesto de hashes conferiu equivalência das fontes testadas, e os hashes de `dist` e PIDs produtivos foram comparados antes/depois.

O ensaio Edge inclui `check-cycle-recovery.cjs`, com componente e cliente HTTP reais compilados em modo de produção e transporte inteiramente fictício. Verifica clique em Novo ciclo sem escrita, erro tardio de leitura, preservação da referência, recuperação por Atualizar, rejeição local de data inválida e criação fictícia após preencher dados válidos, em 375/1440 px. A suíte normal ignora `coverage/`, onde permanecem os ensaios históricos que afirmavam o comportamento defeituoso; as regressões da correção estão versionadas em `src/`.

O gate inclui regressões dos launchers com processos simulados e impressão/hover em Microsoft Edge headless instalado no caminho padrão do Windows. O teste do navegador usa componentes reais, o CSS compilado e dados inteiramente fictícios, sem conexão com a API; valida uma única página A4, 21 notas, ausência de espaço no topo, tamanho físico dos rótulos e alternativas desabilitadas sem hover. Para executá-lo isoladamente após o build: `node frontend/scripts/check-assessment-print.cjs`. Aguarda fontes e quadros de renderização antes das medições; não substitui o aceite da impressora real.

O mesmo ensaio também executa a [alternância de tema com cortina](operations/alternancia-tema-cortina.md) com React no Edge: animação real em 375/1440 px, Enter/foco, troca nos dois sentidos, tema das tabelas, campos preservados, movimento reduzido, impressão e desmontagem. A fixture é compilada em memória pelo Vite, sem modificar a SPA ou acessar API/dados reais.

Os [botões globais compactos](operations/botoes-globais.md) são medidos em 16 variantes/contextos, cinco larguras e dois temas (160 combinações), com contraste mínimo de texto, dimensões/ícones, rótulos, foco por Tab e ausência de hover nos inativos. A geração das fixtures é local; nenhuma operação de negócio é disparada.

A regressão de `Encerrar` é verificada adicionalmente no `RelationshipAdministrationPanel` real: coluna de ação estreita, ícone e texto em uma linha, altura compacta, confirmação/cancelamento e paginação. Há casos responsivos e densidades 1/1,5/2 nos dois temas. Reaplicar o CSS defeituoso precisa reproduzir a quebra, para comprovar que o teste detecta o problema relatado. Dados e API são fictícios; não se encerra vínculo real. Densidade/viewport emulados não substituem a validação manual de zoom.

| Área         | Verificação executada                                                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositório  | Scanner heurístico de segredos, análise de sintaxe dos scripts PowerShell versionáveis e validação estática do manifesto PM2. O scanner informa apenas arquivo, linha e categoria; nunca imprime o possível valor sensível.                    |
| Banco        | Nome, checksum e conteúdo permitido das migrations; depois, com o banco existente, reconciliação de histórico e validações SQL somente leitura.                                                                                                |
| Back-end     | Maven Enforcer, convergência/limite superior de dependências, Spotless, testes unitários, empacotamento e geração de SBOM CycloneDX.                                                                                                           |
| Front-end    | Prettier, Oxlint, Vitest, testes automatizados de acessibilidade com axe e build Vite/TypeScript.                                                                                                                                              |
| Dependências | `npm audit --audit-level=high` e verificação do SBOM Java pelo OSV Scanner. As consultas de vulnerabilidade dependem de conectividade externa; o binário oficial do scanner Java é fixado por versão e validado por SHA-256 antes da execução. |

Use o comando sem `-SkipDatabase` no banco local dedicado. O catálogo versionado atual contém `V0001`–`V0014`; a reconciliação somente leitura dos dois bancos foi registrada em 2026-09-08. Use `-SkipDatabase` somente quando o alvo SQL Server não estiver disponível para o gate; essa opção ainda valida os arquivos de migration, mas não substitui a execução completa contra SQL Server antes da liberação.

## Opções para iniciar avaliações

`ADC-COR-023`: `AssessmentsPanel.creation.test.tsx` cobre a retirada de opções após criação/retorno, atualização manual, ciclos esgotados, resposta tardia e recuperação de falhas. O gate inclui `check-assessment-creation-options.cjs`: React real com transporte fictício no Edge, criação e retorno em 375/1440 px, temas claro/escuro, Gestor/RH/Diretoria e autoavaliação. `AssessmentCreationOptionsReadOnlySqlTests`, opt-in `-Dadc.dev.sql.readonly=true`, executa os repositórios e bindings reais sobre CTEs fictícias em AVALIACAO_DEV, sem ler tabelas de negócio nem executar DDL/DML. Verifica os três estados, exclusão independente de autoria, ciclos esgotados e independência entre ciclos/tipos; usa a DLL JDBC local como os demais ensaios SQL.

## Restauração opcional de sessão

`ADC-COR-021`: `SessionRestorationHttpTests` verifica a rota aditiva `/auth/sessions/restore` com a cadeia Spring, cookies e token CSRF mascarado reais, serviço/repositório de identidade fictícios e nenhum SQL. Cobre ausência de sessão, refresh recusado, acesso válido sem rotação, renovação com cookies seguros e invalidação de CSRF, negações por método/CSRF, preservação dos 401 existentes e propagação de falha não relacionada à autenticação. Testes de App com o cliente HTTP real verificam a abertura sem consultas protegidas; os testes do cliente cobrem concorrência entre restauração/refresh, descarte de CSRF, falhas e nova tentativa.

O gate também executa `node frontend/scripts/check-session-restoration.cjs`. Compila a SPA em memória e usa HTTP fictício exclusivamente em loopback, com perfil novo do Edge, sem API real ou credenciais de usuário. Em 375/1440 px, verifica login sem sessão, retomada manual, sessão disponível e indisponibilidade do serviço; captura erros do console e exige zero nos cenários normais. Login inválido mantém 401 e feedback visível. É evidência do cliente no navegador, não de ativação do JAR DEV/PROD nem de persistência SQL.

## Criação de ciclo com SQL Server DEV e rollback

`CycleCreationDevSqlTests` é opt-in por `-Dadc.dev.cycles.rollback=true`. Executa controllers HTTP, serviços, validações e repositórios reais sobre `AVALIACAO_DEV`: questionários aprovados, fim anterior ao início rejeitado, criação com abertura em 16/09/2026 14:00 e encerramento em 16/10/2026 23:59 (São Paulo), autoavaliação habilitada, persistência das datas/versões, paginação completa, edição e duplicidade. O principal é fornecido pelo teste; autenticação e filtros são cobertos separadamente. Não inicia servidor, não usa a configuração de produção e exige uma conta fictícia ativa `qa.feedback.rh.%` já existente.

A URL DEV é fixa e `DB_NAME()` é conferido antes da escrita. A transação é marcada para rollback antes do primeiro comando; depois, o teste exige ausência do ciclo, da transição e da auditoria correspondente. Nenhuma conta, migration, schema ou avaliação é criada. A autenticação integrada usa a DLL local compatível com o driver JDBC, pela propriedade `java.library.path`. Executar de `backend`, passando o caminho dessa DLL como argumento da JVM de teste:

`mvnw.cmd -Dtest=CycleCreationDevSqlTests -Dadc.dev.cycles.rollback=true "-DargLine=-Djava.library.path=<diretório da DLL local>" test`

O ensaio também abre o próprio ciclo fictício, após ajustar sua janela em rascunho para conter o horário corrente, e exige conflito ao tentar alterar datas depois da abertura. O rollback cobre todas essas etapas.

`ADC-COR-014` acrescenta janelas relativas ao horário corrente: abertura futura e período expirado retornam 409 com motivos distintos, sem abertura/auditoria de sucesso; o período corrente abre normalmente e o encerramento antecipado retorna seu motivo específico. As datas do ciclo informado pelo usuário são consultadas somente para diagnóstico, sem alteração; o ensaio usa exclusivamente o ciclo fictício próprio.

O ensaio não é ativado pelo gate padrão. Sua execução explícita foi aprovada em ADC-VAL-011 e, com datas configuráveis e imutabilidade, em ADC-COR-013; as integrações antigas continuam com suas próprias opções.

## Acessibilidade

`ADC-IMP-001` e `ADC-IMP-002` sucedem a preparação `ADC-UI-057`: importação de Colaboradores, Lotações e Atribuições com conferência e confirmação. `SpreadsheetImportTests` cobre leitor XLSX restrito, regras, limites, ator, expiração, revalidação e repetição. `AllocationImportTests` cobre cabeçalhos reordenados, colunas extras, datas Excel 1900/1904 e texto, espaços não separáveis, referências ativas, homônimos, duplicidade, sobreposição inclusiva e histórico preservado. `SpreadsheetImportHttpTests` verifica paginação e corpo limitado; o teste de segurança verifica permissão e CSRF nas três rotas antes do controller. `SpreadsheetImportDevSqlTests`, opt-in `-Dadc.dev.import.rollback=true`, usa exclusivamente lotes fictícios de 379/378 linhas em AVALIACAO_DEV, JDBC/HTTP reais, auditoria e rollback obrigatório, incluindo falha no meio do lote e conferência desatualizada. `AllocationImportDevSqlTests`, com o mesmo opt-in, verifica cinco lotações e auditorias, dados/datas persistidos, reenvio sem duplicar, conflitos, histórico encerrado, revalidação e falha após a primeira escrita; savepoints isolam falhas esperadas dentro da transação externa sempre desfeita. Ausência dos dados próprios é conferida ao final. Nenhum arquivo ou nome do usuário é fixture de teste.

No front-end, testes do importador verificam seleção, conferência das cinco informações de lotação, confirmação explícita, duplicidades, pendências de data/período, sessão, repetição com o mesmo token após falha de rede e invalidação por arquivo/ciclo. O cliente preserva corpo binário, cookies e CSRF na recuperação. O ensaio Edge `check-spreadsheet-import.cjs` usa o painel React real e transporte fictício, verificando os três importadores, teclado, foco, contraste mínimo de 4,5:1 das instruções, conferência antes da escrita, confirmação única e ausência de overflow em 320/375/768/1024/1440 px e dois temas. Verifica também limites internos das tabelas/controles, com nomes fictícios longos em lotações. Persistência é verificada separadamente no SQL DEV. Regras e limites no [documento de importação](business/importacao-planilhas-cadastros.md).

`ADC-VAL-016`: regressões reproduzem a linha indevida gerada por Filial isolada e o acúmulo de prévias ao sair da tela. Após correção, testar descarte na desmontagem, resposta de conferência tardia e saída durante confirmação (aguardar conclusão antes de descartar), preservando reenvio do mesmo token após falha de rede enquanto a tela permanece aberta. O leitor deve ignorar linhas somente com a coluna descartada e preservar os números das linhas úteis. Evidências antes/depois e da candidata final no STATES.md.

`ADC-UI-055` / `ADC-UI-056`: `FeedbackMessage` apresenta erros, sucessos e alertas em notificações empilhadas no topo da tela, fora do fluxo do conteúdo. Por solicitação posterior do usuário, sucesso desaparece após 5 segundos e erro/alerta após 10 segundos. Ponteiro, foco de teclado e aba oculta suspendem o prazo; ao sair da interação ou voltar à aba, o prazo inteiro recomeça. Mensagem nova reinicia o temporizador; fechamento manual/desmontagem o cancelam. Mantém `alert`/`status`, referência de requisição e botão de fechamento por teclado; expiração não move o foco. Carregamento e instruções dos campos permanecem em contexto. Avisos de diálogos ficam no escopo acessível do modal; os avisos de fundo ficam ocultos enquanto ele está aberto. Notificações não são impressas. `Feedback.test.tsx` cobre temporização, pausas, callbacks atuais, ciclo de vida/StrictMode, empilhamento, fechamento, repetição, associação ao formulário e modal. Edge verifica erro/sucesso no topo em 375/1440 px e expiração real de ambos, com repetição do erro após expirar, em 375 px. Aceite assistivo humano permanece pendente.

`ADC-COR-015`: regressão de duplicidade usa ciclo fictício exclusivo no SQL DEV, com rollback previamente marcado. Reenvio com código em minúsculas enquanto rascunho e repetição após abertura retornam `CYCLE_CODE_ALREADY_EXISTS`; continuam existindo somente um ciclo e uma auditoria de criação, com configuração preservada. O teste HTTP verifica motivo/referência sem detalhes internos, e Edge exercita o formulário real com transporte fictício. Nenhum dado do ciclo informado pelo usuário é alterado.

O ensaio Edge também mede os [quatro filtros da lista de avaliações](operations/filtros-avaliacoes.md) no painel real, em cinco larguras e dois temas, incluindo grade responsiva, limites dos controles e Tab/foco. O teste SQL opt-in `AssessmentListReadOnlySqlTests` executa os bindings e predicados reais sobre CTEs fictícias no DEV; não cria nem altera dados. Ele é separado do ensaio histórico de rotação de sessão com escrita.

O ensaio Edge também cobre as tabelas administrativas Reshaped em dez variações, cinco larguras (320 a 1440 px) e dois temas, verificando overflow, células visíveis, ausência de interatividade nas linhas passivas e preservação de estilos representativos fora das tabelas. Detalhes e limites em [tabelas-administrativas-reshaped.md](operations/tabelas-administrativas-reshaped.md).

Os testes com axe cobrem regras automatizáveis nas jornadas principais e nos diálogos administrativos. A regra de contraste é desabilitada nesses testes porque o `jsdom` não implementa o canvas usado pelo axe para medir cores. Isso não substitui a revisão em navegador de contraste, foco visível, teclado, responsividade, zoom e leitor de tela no ambiente-alvo.

## Verificação operacional pré-publicação

Depois de atualizar o DEV, `./scripts/testar-filtros-avaliacoes-dev.ps1` (PowerShell 7) verifica os quatro filtros na API realmente em execução, em todas as páginas de dois itens, comparando com o ciclo fictício existente `DEV-COMPLETO-FLUXOS`. Usa a conta fictícia RH local e somente consultas de negócio; login/logout geram sessões e auditoria normais. Esse ensaio opt-in é separado do gate, que valida as fontes e não atualiza os processos ativos. Detalhes e pré-requisitos: [filtros de avaliações](operations/filtros-avaliacoes.md).

`./scripts/check-operation.ps1` é somente leitura: confirma JDK, Node.js, npm, disponibilidade do comando PM2, serviço `cloudflared` e a exposição das portas privadas `18080`/`18081`. Ele alerta sobre firewall e diretório de logs, mas não altera nada e não é aceite de produção. O procedimento completo está em [Runbook de pré-publicação](operations/pre-publication-runbook.md).

Depois de uma publicação, `pm2 jlist | node .\scripts\validate-pm2-runtime.cjs` valida sem imprimir valores que os dois processos estão online, usam o release e as portas esperadas, possuem logs e não receberam chaves ou valores de ambiente fora da allowlist explícita e dos três metadados internos do PM2.

## Lacunas conhecidas

- O gate agora gera SBOM CycloneDX e o verifica com OSV Scanner, mas ainda não inclui SAST avançado independente, como SpotBugs ou Semgrep, nem CI em provedor. Isso não deve ser convertido em alegação de conformidade ou certificação.
- O cenário autenticado automatizado em `AVALIACAO_DEV` exercita a API/SPA locais, persistência SQL Server, autorização por papel e recurso, sessão/CSRF, feedback, indicadores e CSV com massa exclusivamente fictícia. Por decisão explícita, teste autenticado em `AVALIACAO_PROD` não faz parte deste encerramento técnico.
- Permanecem externos ao gate: carga e desempenho com dados aprovados, navegador/dispositivo e tecnologia assistiva manuais, política/agenda/criptografia dos backups, proxy/Cloudflare, firewall, monitoração e CI. O procedimento técnico de backup e restauração foi executado com sucesso em 2026-08-29, mas não substitui uma política de continuidade.

O estado canônico, as evidências executadas e os pré-requisitos externos para uso real ficam no [STATES.md](../STATES.md).


## Manutenção de cadastros e importação de vínculos

`ADC-COR-022`/`ADC-IMP-003`: `MasterDataMaintenanceSecurityTests` usa filtros Spring e controllers reais com serviços fictícios para verificar permissão, CSRF, DTOs e códigos seguros. `ManagerAssignmentImportTests` cobre cabeçalhos/datas, modelo distribuído, ambiguidade, conta inelegível, inatividade, repetição, períodos, isolamento por ator/família e revalidação. `SpreadsheetImportHttpTests` verifica projeção mínima e namespace próprio.

`MasterDataMaintenanceDevSqlTests` é opt-in `-Dadc.dev.maintenance.rollback=true`, somente AVALIACAO_DEV e massa fictícia própria. JDBC/serviços reais, transação marcada para rollback antes da escrita e savepoints para falhas esperadas: edição/reativação preservam ID, exclusão somente sem uso, histórico/auditoria preservados, vínculos idênticos sem duplicação, período inclusivo, prévia desatualizada e falha na segunda linha sem escrita parcial. Requer a DLL JDBC local como os outros testes SQL. Não é teste autenticado de produção.

O gate inclui `check-master-data-maintenance.cjs` e amplia `check-spreadsheet-import.cjs` ao quarto importador, com componentes reais/dados fictícios. Verifica teclado, confirmação, rótulos, limites de controles/tabelas e responsividade em cinco larguras/dois temas. Persistência e segurança HTTP são verificadas separadamente. Artefatos e resultados efetivamente executados ficam no STATES.md; scripts de concessão produtiva não são executados pelo gate.

# Estado atual — Avaliação de Desempenho e Competências

> Atualizado em 2026-09-08. Estado consolidado após a auditoria e a complementação autorizada de DEV. Substitui os relatos intermediários contraditórios; não equivale a aceite de produção ou garantia universal de ausência de defeitos.

## Resultado vigente

`ADC-COR-001`: os cinco achados da auditoria foram corrigidos no código. `ADC-DEV-002`: a massa complementar foi efetivamente gravada em `AVALIACAO_DEV`, validada por API e preservada na reexecução. Gate final completo aprovado, com revisão do diff e evidências abaixo.

Nenhuma escrita em PROD, migration nova, mudança de concessões, deploy de produção ou exclusão de avaliação/histórico foi executada nesta rodada. As alterações preexistentes do usuário foram preservadas. O DEV foi recompilado e iniciado com o back-end atualizado para testar as jornadas reais.

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
| Back-end | Maven Verify: 194 testes, zero falhas/erros e uma integração SQL opt-in ignorada no ciclo padrão. Build e Spotless aprovados. |
| Front-end | 110 testes em 12 arquivos, Prettier, Oxlint e build aprovados. Regressões novas de ações por recurso incluem ausência do campo e RH consultando rascunho/feedback alheios. |
| Navegador real | Edge headless com componentes e CSS compilado: uma página A4 com 21 notas, início no topo, rótulos medidos e alternativa desabilitada sem hover. A medição aguarda fontes/renderização e a sincronização do layout paginado pelo PDF. |
| API/SQL reais DEV | `scripts/testar-fluxo-feedback-dev.ps1` passou após atualizar a expectativa de V0014: repositórios, sessão/CSRF, concorrência, idempotência, histórico/feedback, indicadores/CSV e negações por perfil/recurso. |
| Massa DEV | `-Populate` concluído, reexecução sem alteração/duplicação, `-Validate` aprovado; inventário SQL confirmou cinco ciclos, 22 avaliações complementares, 20 novas pessoas e 84 atribuições. |
| Launchers | Teste de porta dinâmica, alvo desconhecido, propagação de falha e cancelamento aprovado; não houve encerramento real de processos por esse teste. |
| Gate final | `scripts/verify-quality.ps1 -BackendBuildDirectory target/audit-completion` aprovado: scanner, sintaxe, 14 migrations, builds/testes/lint, Edge, SBOM CycloneDX com 58 componentes/OSV sem achados, npm sem vulnerabilidades e validação SQL somente leitura. `git diff --check` aprovado. |

O catálogo contém 14 migrations imutáveis (`V0001`–`V0014`). A reconciliação DEV/PROD até V0014 já havia sido registrada em 2026-09-08 antes desta carga; não se executou `--apply` nesta rodada. Teste autenticado em PROD permanece fora do escopo por decisão explícita e não volta ao backlog.

O release produtivo e a infraestrutura existentes não foram modificados nem tiveram seu estado corrente recertificado nesta auditoria. Evidências anteriores de PM2, HTTPS e restauração técnica são históricas; não significam que esta correção foi implantada em produção.

## Tarefas pendentes reais

- Não há pendência técnica conhecida nos cinco achados auditados ou na preparação/validação da massa solicitada; `ADC-COR-001` e `ADC-DEV-002` concluídas no escopo local autorizado.
- Nenhuma carga real, concessão especial, alteração de infraestrutura ou deploy está autorizada por estas tarefas.

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
- O release anterior permanece disponível. Implantação/rollback exigem escopo próprio; consultar [pre-publication-runbook.md](docs/operations/pre-publication-runbook.md).

## Documentos operacionais

- [Massa DEV e roteiro de testes](docs/operations/massa-complementar-dev.md)
- [Gate de qualidade](docs/quality.md)
- [Contrato HTTP v1](docs/api/contrato-http-v1.md)
- [Regras operacionais](docs/business/regras-operacionais-v1.md)
- [Checklist de prontidão para uso real](docs/operations/checklist-prontidao-uso-real.md)
- [Backup e restauração](docs/operations/backup-restauracao-sql-server.md)
- [Configuração externa](docs/operations/configuracao-externa-da-aplicacao.md)
- [Aceite de segurança pré-liberação](docs/security/aceite-seguranca-pre-liberacao.md)

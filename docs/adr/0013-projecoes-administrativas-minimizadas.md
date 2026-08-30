# ADR-0013 — Projeções administrativas minimizadas por capacidade

| Campo     | Valor                                                                                       |
| --------- | ------------------------------------------------------------------------------------------- |
| Status    | Aceita em 2026-08-26.                                                                       |
| Decisores | Implementação sob `AGENTS.md`, ADR-0007, ADR-0009, ADR-0011 e a tarefa ADC-016.             |
| Escopo    | Telas administrativas React e leituras HTTP necessárias para operar os comandos existentes. |

## Contexto

Os comandos administrativos para contas, cadastros, vínculos, questionários, ciclos e atribuições
já existiam, mas parte deles não tinha uma leitura protegida que permitisse selecionar ou reconhecer
os recursos depois de recarregar a tela. Usar UUID digitado manualmente seria propenso a erro e não
cumpriria uma experiência administrativa funcional. Expor os modelos persistidos completos, por sua
vez, poderia revelar credenciais, dados pessoais, histórico de vínculo ou dados de avaliação.

Também há permissões granulares: uma pessoa com `CICLOS.GERIR`, por exemplo, precisa escolher uma
versão aprovada para configurar um ciclo, sem receber o poder de criar ou alterar questionários. O
mesmo vale para vínculos, que precisam de opções de pessoas sem exigir uma permissão genérica de
consulta de contas ou cadastros.

## Decisão

- Criar o módulo de leitura administrativa separado (`administracao`) com projeções JDBC, serviço,
  política de autorização, controlador e mapeadores de DTO. Ele não é uma rota de acesso direto às
  entidades persistidas.
- Manter cada rota em negação por padrão, com gate HTTP e `@PreAuthorize` da capacidade que torna a
  operação útil. As opções de vínculo são protegidas pela própria permissão de vínculo; a leitura de
  versões aprovadas aceita `QUESTIONARIOS.GERIR` ou `CICLOS.GERIR`.
- Retornar apenas os campos necessários à seleção e à listagem: identificadores técnicos onde o
  comando precisa deles, rótulos de exibição, situação ativa e referências mínimas entre recursos.
  As atribuições ativas carregam somente os rótulos de ciclo e questionário necessários para a tabela.
- Excluir de todas as projeções senha, hash, token, sessão, CPF, login quando não necessário, papéis
  completos, concessões, histórico, auditoria, comentários, plano de ação, resposta, competência,
  opção, ponto, nota e classificação de avaliações.
- Organizar a SPA por rotas administrativas (`/administracao/{usuarios,cadastros,vinculos,questionarios,ciclos}`),
  usando as projeções para selects e rótulos. Os controles locais ocultam ações não autorizadas, mas
  o servidor permanece a autoridade final para escopo, vigência, estado, integridade e auditoria.

## Consequências

- Cadastros e vínculos podem ser operados sem UUIDs manuais e sem ampliar desnecessariamente a
  leitura de contas ou dados pessoais.
- A criação e a atualização de ciclo continuam limitadas a versões aprovadas, e uma versão de
  questionário continua imutável depois de criada.
- A superfície HTTP administrativa aumenta de modo explícito e documentado em
  [Contrato HTTP v1](../api/contrato-http-v1.md); novos campos devem passar pela mesma análise de
  minimização e autorização.
- Esta decisão não autorizou migration, carga de dados, exclusão, alteração de ambiente,
  configuração externa ou publicação. Posteriormente, o cenário autenticado de DEV exercitou as
  projeções e escritas administrativas cobertas contra SQL Server com massa fictícia; carga e aceite
  de dados reais continuam exigindo procedimento externo próprio.

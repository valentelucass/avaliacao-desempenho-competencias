# ADR-0010 — Fundação estrutural de cadastros, ciclos e avaliações

| Campo     | Valor                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Status    | Aceita e aplicada pelas migrations `V0003` e `V0004` em 2026-08-25.                                                                 |
| Decisores | Solicitação explícita do usuário, regras conhecidas em `AGENTS.md` e pendências registradas em `STATES.md`.                         |
| Escopo    | Estrutura vazia do SQL Server e regras puras de ciclo/rascunho/envio; não habilita uso real do formulário, autenticação ou cálculo. |

> Atualização em 2026-08-25: a ADR-0011 definiu as regras de negócio antes pendentes. As estruturas adicionais foram versionadas nas migrations imutáveis `V0005` e `V0007`, posteriormente aplicadas e validadas no banco local dedicado, sem alterar `V0003` ou `V0004`.

## Contexto

Os módulos de cadastros, ciclos e avaliações precisavam preservar histórico enquanto a regra de negócio ainda não estava definida. A fundação foi criada sem antecipar a regra; a ADR-0011 agora fornece a versão `2024.1` que guiará as migrations e casos de uso posteriores.

Criar registros reais ou uma fórmula definitiva antes dessas decisões arriscaria registrar avaliações com regra incorreta. Ao mesmo tempo, a base relacional precisa separar colaborador de usuário, preservar vínculo de gestor, manter versões de questionário e impedir associação acidental entre gestor, colaborador e avaliação.

## Decisão

As migrations aplicadas criam somente a fundação estrutural, sem semear dados de negócio.

- A `V0003` cria filiais, áreas, colaboradores, lotações históricas, vínculos gestor–colaborador, questionários/competências versionados, perguntas, opções de resposta e ciclos com transições registradas.
- O texto livre do gestor permanece apenas na lotação. A autorização futura exige o vínculo explícito entre a conta do gestor e o colaborador; a regra v1 determina um único vínculo ativo por colaborador, a ser imposto em nova migration.
- A `V0004` cria avaliações exclusivamente do tipo `GESTOR`, suas versões, respostas e transições de criação, envio e publicação. A chave composta da avaliação exige que o gestor, o colaborador e o vínculo sejam coerentes entre si.
- A camada de domínio permite ciclo `RASCUNHO → ABERTO → ENCERRADO` e avaliação `RASCUNHO → ENVIADA` quando todas as perguntas obrigatórias forem respondidas. Publicação e reabertura permanecem bloqueadas até a implementação da regra já aprovada.
- Não foram criados CPF, cargo, usuários, credenciais, associações de papel, filiais/áreas, questionários, ciclos, vínculos, avaliações, notas, classificações, comentários, planos de ação ou dados pessoais.
- A estrutura não persiste pontos, pesos, resultado final, arredondamento ou classificação. A regra v1 define média simples e `HALF_UP` com uma casa; uma migration posterior levará esses dados versionados ao banco.

## Consequências

- As migrations mantêm uma trilha de versões e transições, mas a implementação de repositórios, casos de uso, autenticação e autorização por escopo continua necessária antes de qualquer endpoint ser liberado.
- A autoavaliação e a reabertura exigirão nova migration; a estrutura atual não as aceita silenciosamente.
- A publicação estrutural somente poderá ser habilitada quando o questionário, cálculo e classificação v1 estiverem persistidos e versionados no servidor.
- Alterações de schema posteriores exigem uma nova migration. As `V0003` e `V0004` não serão alteradas depois de aplicadas.

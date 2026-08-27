# ADR-0006 — Contrato da API e modelo relacional lógico antes da persistência

- **Status:** Aceita para documentação e desenho técnico
- **Data:** 2026-08-25
- **Origem:** Execução autorizada das tarefas ADC-005 e ADC-006 pelo usuário.

## Contexto

A fundação técnica já possui front-end e back-end, mas ainda não havia contrato HTTP nem modelo de dados. Implementar controladores, autenticação ou SQL sem esses limites favoreceria exposição de entidades, regras calculadas no cliente e alterações impossíveis de versionar.

## Decisão

- A API usará a base versionada `/api/v1`, com convenções de erro, correlação, paginação, idempotência e concorrência documentadas em [Contrato HTTP v1](../api/contrato-http-v1.md).
- O SQL Server seguirá o [modelo relacional lógico](../architecture/modelo-relacional-logico.md), que separa usuário, colaborador, vínculo de gestor, versões de questionário/cálculo/avaliação, sessões e auditoria.
- Os contratos de regra ainda pendente ficam reservados e explicitamente marcados; não serão convertidos em endpoint, DTO final, índice único ou regra de domínio até a decisão do negócio.
- Esta decisão não cria DDL, migration, banco, usuário SQL, credencial, dados reais ou endpoint funcional.

## Consequências

- Controllers futuros usam DTOs do contrato; entidades de persistência continuam internas e distintas do domínio e da API.
- Migrations futuras deverão respeitar os invariantes e índices previstos, com testes de atualização e recriação de schema.
- A implementação de login, JWT, renovação, RBAC/ABAC e auditoria durável depende desse modelo e de persistência autorizada.
- As pendências de modelo de avaliação, fluxo detalhado, cadastro mestre, indicadores e retenção permanecem abertas no `STATES.md`.

## Evidência e testes afetados

- Revisão documental de convenções de contrato, dados pessoais, transições e relações históricas.
- Testes futuros: contrato HTTP, autorização por escopo, paginação, idempotência, concorrência, migration, auditoria, retenção e recuperação de identidade.

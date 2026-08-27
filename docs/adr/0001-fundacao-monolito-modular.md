# ADR-0001 — Fundação como monólito modular

- **Status:** Aceita para a fundação
- **Data:** 2026-08-25
- **Responsável:** Engenharia; validação operacional da VM pendente

## Contexto

O produto é uma aplicação interna com front-end React + TypeScript, back-end Java e SQL Server. A primeira etapa precisa criar uma base reprodutível sem antecipar decisões pendentes sobre questionário, permissões, contratos de negócio, banco ou infraestrutura da VM.

## Decisão

- Manter um único repositório com `frontend/` e `backend/` independentes.
- Usar React, TypeScript e Vite no front-end.
- Usar Spring Boot 4.1.1 e Maven Wrapper no back-end, compilando para Java 21.
- Organizar os futuros módulos por capacidade de negócio e, internamente, em `api`, `application`, `domain` e `infrastructure`.
- Usar verificações locais para formatação, lint, testes e build; a integração com um provedor de CI será definida quando houver repositório remoto autorizado.

## Consequências

- A aplicação poderá evoluir por módulos sem criar microserviços prematuramente.
- Os contratos HTTP, persistência e segurança não serão adiantados nesta fundação e continuam com suas tarefas próprias.
- A máquina de desenvolvimento deve usar um JDK compatível para executar a aplicação. A VM e sua versão efetiva de Java ainda precisam de confirmação operacional.

# ADR-0002 — MVC no back-end

- **Status:** Aceita
- **Data:** 2026-08-25
- **Origem:** Solicitação explícita do usuário.

## Contexto

O projeto já adota um monólito modular com as camadas `api`, `application`, `domain` e `infrastructure`. Foi solicitado que o back-end siga a arquitetura MVC padrão, sem transformar controllers em serviços de negócio ou expor a persistência.

## Decisão

Cada módulo usará MVC adaptado a uma API REST:

- `api/controller` representa o **Controller**.
- `domain/model` representa o **Model** de negócio.
- `api/dto` representa a **View** JSON da API.
- `application/service` coordena os casos de uso.
- `infrastructure/persistence/repository` implementa a persistência por trás de portas do domínio/aplicação.

## Consequências

- Controllers permanecem pequenos e testáveis, limitados ao protocolo HTTP.
- A regra de cálculo e a classificação continuam no domínio, nunca na view ou no controller.
- DTOs, modelos de domínio e entidades de persistência continuam distintos.
- Não há classes MVC vazias; a convenção é aplicada somente a casos de uso reais.
- Os módulos de identidade, cadastros, ciclos, avaliações e indicadores agora aplicam essa convenção, com testes de controller, aplicação, domínio e persistência estática/por mock. A validação de integração SQL Server continua pendente de ambiente autorizado.

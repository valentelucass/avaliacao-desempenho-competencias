# ADR-0016 — Perfis Administrador e Usuário comum

- **Status:** Superada para provisionamento e contrato em 2026-08-27; a `V0009` permanece como registro histórico imutável.
- **Data:** 2026-08-26
- **Origem:** Solicitação explícita para separar a experiência entre administradores e usuários comuns.

## Contexto

O papel `ADMINISTRADOR_PLATAFORMA` era técnico e precisava ser combinado com papéis de negócio para que uma pessoa administradora enxergasse todos os módulos. Isso tornava a criação de conta confusa e escondia telas esperadas para administradores.

## Decisão

- `ADMINISTRADOR_PLATAFORMA` passa a representar o perfil **Administrador**, com o catálogo integral de permissões v1.
- `COLABORADOR` é o perfil **Usuário comum**, limitado à própria autoavaliação e condicionado ao vínculo ativo, ao ciclo e ao questionário atribuídos.
- A criação e a substituição de acesso na interface oferecem somente esses dois perfis. Papéis legados continuam reconhecidos para leitura e histórico, mas não são oferecidos para novas concessões.
- A autorização por recurso, a privacidade dos indicadores, a validação de vínculo e a proteção da conta suprema não são removidas. Acesso integral a módulos não permite burlar regras de integridade ou criar avaliações sem os dados obrigatórios.

## Estado atual — 2026-08-29

Esta ADR preserva a decisão histórica que levou à `V0009`; ela não define mais o fluxo administrativo vigente. Para novas contas e substituições de acesso, o contrato aceita exatamente um perfil entre Administrador (`ADMINISTRADOR_PLATAFORMA`), Gestor (`GESTOR`), Gerência de RH (`GERENCIA_RH`), Diretoria (`DIRETORIA`) e Colaborador (`COLABORADOR`), sem permissões individuais.

O Administrador administra a plataforma, mas não é autoridade para publicação/reabertura, indicadores ou exportação. Essas operações exigem Gerência de RH ou Diretoria, a permissão correspondente e o escopo revalidado no servidor. Os bancos canônicos reconciliaram `V0001`–`V0013`: `V0011` restringe essas permissões e normaliza contas administrativas legadas; `V0013` remove do Administrador técnico os acessos remanescentes a avaliações e autoavaliações. A migration `V0009` não é reescrita.

## Consequências

- A migration `V0009` concede explicitamente as permissões v1 ao papel de Administrador. Contas existentes com esse papel passam a exigir nova autenticação para receber as permissões no token.
- O administrador pode atribuir perfis de administrador ou usuário comum a terceiros; nunca à própria conta pelo fluxo normal.
- Novas permissões não serão concedidas automaticamente: exigem alteração explícita da migration/catálogo em decisão futura.

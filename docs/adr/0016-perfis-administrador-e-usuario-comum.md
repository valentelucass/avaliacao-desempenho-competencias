# ADR-0016 — Perfis Administrador e Usuário comum

- **Status:** Aceita; migration e publicação pendentes de execução autorizada
- **Data:** 2026-08-26
- **Origem:** Solicitação explícita para separar a experiência entre administradores e usuários comuns.

## Contexto

O papel `ADMINISTRADOR_PLATAFORMA` era técnico e precisava ser combinado com papéis de negócio para que uma pessoa administradora enxergasse todos os módulos. Isso tornava a criação de conta confusa e escondia telas esperadas para administradores.

## Decisão

- `ADMINISTRADOR_PLATAFORMA` passa a representar o perfil **Administrador**, com o catálogo integral de permissões v1.
- `COLABORADOR` é o perfil **Usuário comum**, limitado à própria autoavaliação e condicionado ao vínculo ativo, ao ciclo e ao questionário atribuídos.
- A criação e a substituição de acesso na interface oferecem somente esses dois perfis. Papéis legados continuam reconhecidos para leitura e histórico, mas não são oferecidos para novas concessões.
- A autorização por recurso, a privacidade dos indicadores, a validação de vínculo e a proteção da conta suprema não são removidas. Acesso integral a módulos não permite burlar regras de integridade ou criar avaliações sem os dados obrigatórios.

## Consequências

- A migration `V0009` concede explicitamente as permissões v1 ao papel de Administrador. Contas existentes com esse papel passam a exigir nova autenticação para receber as permissões no token.
- O administrador pode atribuir perfis de administrador ou usuário comum a terceiros; nunca à própria conta pelo fluxo normal.
- Novas permissões não serão concedidas automaticamente: exigem alteração explícita da migration/catálogo em decisão futura.

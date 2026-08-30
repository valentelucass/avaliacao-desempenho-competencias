# ADR-0017 — Feedback integrado e avaliação Diretoria–Gerência

- **Status:** Aceita para implementação em desenvolvimento.
- **Data:** 2026-08-29
- **Origem:** Regras de feedback recebidas do RH, resposta de perfis do gestor e aceite explícito do usuário.

## Contexto

O fluxo existente encerrava a avaliação em `PUBLICADA`, não persistia feedback e não distinguia uma avaliação feita pela Diretoria sobre uma Gerência. Também havia ambiguidade entre a situação da avaliação e a etapa posterior de conversa com o avaliado.

## Decisão

- A situação principal continua `RASCUNHO → ENVIADA → PUBLICADA`; `ENVIADA` permanece como submissão do avaliador, antes da homologação de RH/Diretoria.
- Feedback é uma dimensão vinculada à versão publicada, com `NAO_APLICAVEL`, `PENDENTE` e `CONCLUIDO`; ele não substitui `PUBLICADA` e não é cadastro externo.
- Ao publicar avaliação de Gestor ou Diretoria–Gerência, o feedback inicia `PENDENTE`. Somente o autor original registra uma conclusão com data e comentário, tornando-o `CONCLUIDO`.
- Autoavaliação é publicada por RH/Diretoria e recebe `NAO_APLICAVEL`; não admite feedback.
- RH e Diretoria leem todas as avaliações e podem publicar/reabrir, mas não registram, editam ou substituem feedback de outro avaliador. Gestor lê somente o que realizou e sua autoavaliação. Colaborador não avaliador não acessa a plataforma. Administrador técnico não recebe escopo de avaliação.
- Reabertura preserva integralmente a versão e seu feedback. A nova versão reaberta nasce em rascunho; publicação posterior cria outro feedback pendente quando aplicável.
- `DIRETORIA_GERENCIA` é tipo próprio de avaliação e exige vínculo Diretoria–Gerência vigente. Ele não reutiliza `vinculo_gestor_colaborador`.
- Indicadores permanecem baseados somente em avaliações de Gestor publicadas, independentemente de feedback pendente ou concluído.

## Consequências

- O schema precisa de situação de feedback por versão publicada, registro de conclusão e vínculo Diretoria–Gerência com integridade e vigência.
- A API recebe uma operação explícita e idempotente de conclusão; dados de autoria e horário técnico são produzidos pelo servidor. O comentário integral não é inserido em eventos de auditoria.
- A interface mostra situação principal e feedback separadamente, restringindo ação ao autor e preservando o histórico de versões.
- As migrations, massa e testes desta decisão serão executados somente no banco fictício `AVALIACAO_DEV`. Nenhuma alteração em `AVALIACAO_PROD` decorre desta ADR.

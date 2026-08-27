# ADR-0009 — Catálogo inicial de papéis e permissões

| Campo     | Valor                                                                                        |
| --------- | -------------------------------------------------------------------------------------------- |
| Status    | Aceita e aplicada pela `V0002` em 2026-08-25.                                                |
| Decisores | Regras recebidas do gestor e confirmação do usuário.                                         |
| Escopo    | Catálogo de referência de acesso; não cria usuário, credencial ou acesso de negócio efetivo. |

## Contexto

O sistema terá usuários locais administrados na plataforma. O gestor confirmou que somente gestores autorizados avaliam; Gerência de RH e Diretoria consultam avaliações completas, publicam, reabrem e exportam; administradores de plataforma cuidam de contas e acessos sem receber essas permissões de negócio automaticamente.

## Decisão

A `V0002` cria o catálogo inicial, sem atribuí-lo a qualquer usuário:

| Papel                      | Permissões iniciais                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ADMINISTRADOR_PLATAFORMA` | `USUARIOS.LER`, `USUARIOS.CRIAR`, `USUARIOS.ALTERAR`, `ACESSOS.GERIR`                                                  |
| `GESTOR`                   | `AVALIACOES.AVALIAR_VINCULADOS`, `AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS`                                            |
| `GERENCIA_RH`              | `AVALIACOES.VISUALIZAR_TODAS`, `AVALIACOES.PUBLICAR`, `AVALIACOES.REABRIR`, `INDICADORES.VISUALIZAR`, `DADOS.EXPORTAR` |
| `DIRETORIA`                | Mesmo conjunto confirmado para Gerência de RH                                                                          |

O atributo de administrador supremo permanece separado dos papéis de negócio. O catálogo não inclui permissões de autoavaliação, consulta de rascunho ou resultado pelo gestor, associação gestor–colaborador, exportação pelo gestor ou um papel de colaborador, pois essas regras ainda não foram definidas em detalhe.

## Atualização posterior em 2026-08-25

A `V0006` foi aplicada no banco local dedicado e acrescentou o papel `COLABORADOR`, as permissões v2024.1 e `ACESSOS.NEGOCIO.GERIR`, conforme a regra operacional aprovada posteriormente. A única conta local de desenvolvimento recebeu somente `ADMINISTRADOR_PLATAFORMA`, continua sem escopo de negócio e exige troca da senha inicial; seus dados de identificação e credencial não são registrados nesta ADR.

## Consequências

- O catálogo fica versionado e auditável no banco, mas nada é autorizado até haver conta autenticada, atribuição ativa, implementação de RBAC e verificação de escopo no servidor.
- Uma conta com `ADMINISTRADOR_PLATAFORMA` não recebe consulta, publicação, indicadores ou exportação por herança implícita.
- A autorização de avaliação do gestor continuará exigindo, além da permissão, o vínculo gestor–colaborador quando ele for implementado.
- Alterações futuras no catálogo exigem nova migration; a `V0002` não será alterada depois de aplicada.

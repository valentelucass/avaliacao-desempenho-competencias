# ADR-0003 — Gestão local de identidade por administradores de plataforma

- **Status:** Aceita para a versão inicial
- **Data:** 2026-08-25
- **Origem:** Decisão explícita do usuário, com delegação explícita para definir a contingência do administrador supremo em 2026-08-25.
- **Responsável conhecido:** Lucas Andrade, administrador supremo inicial.

## Contexto

Era necessário definir como os usuários entrarão no sistema antes de receber uma eventual opinião do gestor sobre os demais papéis e o fluxo de avaliação. Não há autorização para integrar Active Directory ou SSO nesta versão inicial.

## Decisão

- A versão inicial usará usuários locais, administrados dentro da própria plataforma.
- Administradores de plataforma terão um tratamento próprio para criar usuários, definir seu papel na plataforma e conceder as permissões correspondentes.
- Lucas Andrade será o administrador supremo inicial e não poderá ser excluído pelo fluxo normal de administração de usuários.
- Antes da liberação em produção, deverão existir pelo menos duas contas ativas de administrador supremo. Isso evita que a indisponibilidade de uma única pessoa impeça a administração da plataforma.
- A promoção, troca, desativação ou redução do papel de administrador supremo exigirá solicitação, justificativa e aprovação de outro administrador supremo ativo. Solicitante e aprovador deverão ser pessoas diferentes; autoaprovação será bloqueada.
- Enquanto houver apenas Lucas como administrador supremo, a criação do segundo administrador supremo exigirá a autorização independente de um membro da Diretoria, registrada na solicitação. Depois disso, a regra de dois administradores supremos passa a valer.
- O sistema nunca permitirá excluir, bloquear, rebaixar ou remover o último administrador supremo ativo. A proteção de Lucas no fluxo normal permanece válida.
- Se nenhum administrador supremo puder entrar, uma recuperação excepcional só poderá ocorrer mediante autorização de dois custodiantes previamente designados: um da Diretoria e um responsável de plataforma. Eles deverão ser pessoas distintas entre si e da conta afetada. A recuperação será de uso único, terá alvo e motivo definidos e não criará senha compartilhada, token permanente ou acesso oculto.
- A recuperação excepcional deve revogar as sessões dos administradores afetados, forçar a redefinição de senha quando aplicável e bloquear contas suspeitas em vez de apagá-las.
- Toda alteração ou recuperação de administrador supremo registrará solicitante, aprovador, executor, data/hora, motivo, estado anterior, estado posterior e resultado — nunca senha, token ou código de recuperação.
- Não será criada conta, senha, credencial, integração externa ou permissão efetiva nesta decisão; ela somente estabelece a regra que será implementada na tarefa de segurança.

## Exemplo de comportamento esperado

Um administrador de plataforma cria um novo usuário, informa os dados mínimos necessários, escolhe o papel aplicável e concede as permissões aprovadas para esse papel. Ao tentar excluir o administrador supremo inicial, o sistema deve bloquear a operação e registrar a tentativa em auditoria.

Para criar o segundo administrador supremo enquanto Lucas for o único, Lucas registra a solicitação e uma pessoa da Diretoria a aprova. Depois de existirem dois administradores supremos ativos, nenhuma pessoa pode promover, rebaixar ou desativar um deles sozinha.

Se os administradores supremos não conseguirem entrar, os dois custodiantes designados autorizam uma recuperação única e auditada. A recuperação não revela senha nem cria uma conta permanente fora das regras normais.

## Atualização operacional em 2026-08-25

Por autorização explícita do usuário, foi criada uma conta técnica local de desenvolvimento protegida como administrador supremo, com troca obrigatória da senha inicial, papel `ADMINISTRADOR_PLATAFORMA` e auditoria. Ela não recebeu escopo de negócio e seus dados de identificação e credencial não são registrados nesta ADR. Esse bootstrap é restrito ao desenvolvimento local e não substitui a identificação, os dois administradores, a dupla atuação e os custodiantes que continuam obrigatórios antes de produção.

Em 2026-08-26, por autorização explícita, o primeiro administrador supremo protegido de `AVALIACAO_PROD` foi criado pela rotina transacional de bootstrap. Foram atribuídos os papéis técnico e de negócio necessários à verificação integral da plataforma, com troca obrigatória da senha no primeiro acesso e auditoria sem segredo. Identificação pessoal e credencial não são registradas nesta ADR. A segunda conta independente, aprovada pela Diretoria, permanece obrigatória.

## Estado atual — 2026-08-27

Os registros de bootstrap acima são históricos. O fluxo administrativo atual admite exatamente um perfil entre Administrador, Gestor, Gerência de RH, Diretoria e Colaborador, sem permissões individuais. A `V0011` em fonte preserva o histórico e normaliza contas administrativas legadas que acumulam papéis para o perfil único de Administrador; ela ainda aguarda aplicação autorizada em `AVALIACAO_DEV` e `AVALIACAO_PROD`. Publicação/reabertura, indicadores e exportação permanecem reservados a Gerência de RH ou Diretoria, e a segunda conta suprema independente continua obrigatória antes de uso operacional.

## Consequências e pendências

- A matriz granular de papéis e permissões para RH, gestor e colaborador continua pendente de implementação e detalhamento.
- Publicação, reabertura e ausência de recurso já estão definidas: Gerência de RH e Diretoria publicam/reabrem; gestor autorizado avalia; não há recurso por solicitação do avaliado. Permanecem pendentes o motivo/estado de retorno auditáveis, a autoavaliação e a visibilidade do resultado.
- Antes da produção, Lucas deverá indicar os dois custodiantes e a aplicação deverá passar por um teste de recuperação em ambiente não produtivo. Esses nomes e eventual credencial de emergência não serão registrados neste repositório.
- A decisão não autoriza integração com Active Directory/SSO, criação de usuários reais, credenciais, banco de dados ou endpoints.
- Testes afetados quando a funcionalidade existir: criação de usuário, atribuição e revogação de permissões, bloqueio de exclusão do administrador supremo, bloqueio de remoção do último administrador supremo ativo, bloqueio de autoaprovação, aprovação da promoção, recuperação de uso único, revogação de sessões e auditoria dessas ações.

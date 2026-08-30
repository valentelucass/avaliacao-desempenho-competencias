# Contrato HTTP da API — v1

| Campo                         | Valor                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                        | Implementado no código-fonte e coberto por testes unitários/contratuais e cenário autenticado automatizado em DEV; a configuração versionada continua desabilitada por padrão.                                                                                      |
| Base verificada               | Os hosts públicos responderam em verificação anônima; o cenário autenticado foi executado somente na API/SPA locais contra `AVALIACAO_DEV`, com massa fictícia. Por decisão explícita, teste autenticado em `AVALIACAO_PROD` não integra este encerramento técnico. |
| Pré-requisitos para novo alvo | Histórico completo da fonte até `V0013`, identidade SQL de mínimo privilégio, TLS validado, configuração externa protegida, bootstrap controlado de administradores e validação autorizada por alvo.                                                                |
| Origem                        | `AGENTS.md`, [Regra operacional 2024.1](../business/regras-operacionais-v1.md), ADR-0011, ADR-0012, ADR-0017 e ADR-0018.                                                                                                                                            |

## Estado de ativação

As rotas persistidas não são registradas no processo padrão. `application.properties` mantém `app.persistence.sqlserver.enabled`, `app.security.authentication.enabled`, `app.evaluation-cycles.read.enabled`, `app.assessments.enabled` e `app.indicators.enabled` como `false`.

Em 2026-08-29, `AVALIACAO_DEV` e `AVALIACAO_PROD` reconciliaram `V0001`–`V0013`. `AVALIACAO_DEV` foi validada por sessão autenticada fictícia, incluindo persistência SQL Server, autorização por papel/recurso, feedback, indicadores/CSV, sessão/CSRF, refresh e logout. A configuração padrão ainda não registra as rotas persistidas; o launcher local as ativa somente em processo controlado. Esse estado não equivale a aceite de negócio, carga autorizada de dados reais ou certificação dos controles externos. A sequência segura está em [Configuração externa da aplicação](../operations/configuracao-externa-da-aplicacao.md).

## Convenções

- JSON UTF-8 é o formato padrão; erros usam `application/problem+json` e nunca incluem senha, token, hash, SQL, stack trace ou comentário integral.
- IDs são UUIDs opacos. Datas/hora são ISO-8601 UTC; datas de vigência usam `YYYY-MM-DD`.
- Todas as respostas recebem `X-Request-Id`. O cliente pode enviar um valor curto e seguro nesse cabeçalho.
- Escritas exigem CSRF. A SPA busca `GET /auth/csrf` e envia `X-CSRF-TOKEN`; ela não armazena credenciais em `localStorage` ou `sessionStorage`.
- Criação, envio, publicação, reabertura e conclusão de feedback exigem `Idempotency-Key` (até 256 caracteres). Rascunhos exigem `If-Match` com o `ETag` devolvido pela API.
- O navegador nunca define ator, permissão, papel efetivo, vínculo, questionário aplicável, estado, nota ou classificação. Todos são validados ou calculados no servidor.

As coleções não são uniformes nesta primeira entrega: ciclos aceitam `limit` de 1 a 100 e `cursor` UUID; avaliações aceitam `limit` de 1 a 100 e cursor opaco retornado pela própria API. As leituras administrativas minimizadas abaixo não são paginadas e não implicam uma listagem pública ou genérica. Não assumir paginação genérica onde o recurso não a declara.

## Erros estáveis

| HTTP | Código                                                                                                        | Uso                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 400  | `REQUEST_MALFORMED`                                                                                           | JSON, UUID, parâmetro ou cabeçalho malformado.                     |
| 401  | `AUTHENTICATION_FAILED` / `AUTHENTICATION_REQUIRED`                                                           | Login, token ou sessão inválidos, sem revelar existência de conta. |
| 403  | `ACCESS_DENIED`                                                                                               | Permissão, papel, segregação ou escopo insuficiente.               |
| 404  | `RESOURCE_NOT_FOUND`                                                                                          | Recurso inexistente ou fora do escopo.                             |
| 409  | `CONFLICT`, `INVALID_STATE_TRANSITION`, `DUPLICATE_EVALUATION`, `REVISION_MISMATCH`, `IDEMPOTENCY_KEY_REUSED` | Concorrência, estado ou reenvio incompatível.                      |
| 422  | `VALIDATION_FAILED`                                                                                           | Entrada semanticamente inválida.                                   |
| 429  | `RATE_LIMITED`                                                                                                | Limite local de login ou indicador excedido.                       |
| 503  | `SERVICE_UNAVAILABLE`                                                                                         | Estrutura/migration exigida não disponível.                        |

## Sessão local

| Operação                        | Corpo / retorno                                                                  | Regra                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /auth/csrf`                | `{ "token": "…" }`                                                               | Público somente para obter o token técnico de CSRF.                                             |
| `POST /auth/sessions`           | `{ "login", "password" }` → `204`                                                | Aplica limitação local, autenticação genérica e escreve `ADC-ACCESS` e `ADC-REFRESH`.           |
| `POST /auth/sessions/refresh`   | → `204`                                                                          | Rotaciona o refresh opaco armazenado somente por hash e substitui os cookies.                   |
| `DELETE /auth/sessions/current` | → `204`                                                                          | Revoga a sessão autenticada e limpa cookies.                                                    |
| `GET /auth/me`                  | `{ id, displayName, permissions, passwordChangeRequired, supremeAdministrator }` | Permissões servem à interface; a autorização sempre é revalidada no servidor.                   |
| `PUT /auth/password`            | `{ "currentPassword", "newPassword" }` → `204`                                   | Exige nova senha de 12 a 200 caracteres, revoga todas as sessões do usuário e limpa os cookies. |

Os cookies de credencial são host-only, `HttpOnly`, `Secure`, `SameSite=Strict`; o JWT curto HS256 contém somente `iss`, `aud`, `sub`, `exp`, `nbf`, `jti` e `sid`. Em cada requisição o servidor revalida assinatura, claims, sessão, situação da conta e permissões efetivas. O limiter usa o endereço remoto visto pela aplicação até haver proxy confiável formalmente configurado.

## Administração de usuários e acesso

Todas as rotas abaixo exigem autenticação e a permissão correspondente. A API normal nunca cria, promove ou altera administrador supremo.

| Operação                                                | Permissão                                  | Contrato                                                                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /administration/users`                             | `USUARIOS.LER`                             | Lista `UserResponse`, sem hash, senha, token ou sessão.                                                                                                                                  |
| `GET /administration/users/{userId}`                    | `USUARIOS.LER`                             | Retorna o mesmo `UserResponse`.                                                                                                                                                          |
| `POST /administration/users`                            | `USUARIOS.CRIAR`                           | `{ login, displayName, initialPassword, initialRoles: ["GESTOR"] }` → `201`; exige exatamente um perfil suportado e troca de senha inicial.                                              |
| `PATCH /administration/users/{userId}`                  | `USUARIOS.ALTERAR`                         | `{ displayName, status: ACTIVE\|BLOCKED\|DISABLED }`; bloqueio/desativação revoga sessões.                                                                                               |
| `PATCH /administration/users/{userId}/logical-deletion` | `USUARIOS.ALTERAR`                         | `{ deleted: true }` marca somente uma conta comum como excluída logicamente, desativa-a e revoga sessões.                                                                                |
| `PUT /administration/users/{userId}/password-reset`     | `USUARIOS.ALTERAR` + administrador supremo | `{ temporaryPassword }` de 12 a 200 caracteres; somente para conta comum ativa, força troca e revoga sessões.                                                                            |
| `PUT /administration/users/{userId}/access-grants`      | `ACESSOS.GERIR` ou `ACESSOS.NEGOCIO.GERIR` | `{ roles: ["GERENCIA_RH"], permissions: [] }`; substitui o perfil por exatamente um papel suportado. O campo `permissions` é obrigatório por compatibilidade, mas só aceita lista vazia. |

`UserResponse` contém `id`, `login`, `displayName`, `status`, `protectedFromNormalFlow`, `logicallyDeleted`, `passwordChangeRequired`, `roles`, `individualPermissions` e `updatedAt`. `roles` contém exatamente um dos papéis suportados. `individualPermissions` é somente leitura para visualizar concessões legadas ainda registradas; a API rejeita qualquer item não vazio em `permissions`, e uma substituição de perfil as revoga de forma auditável. A substituição também revoga as sessões do alvo.

Os únicos perfis provisionáveis são `ADMINISTRADOR_PLATAFORMA` (Administrador), `GESTOR` (Gestor), `GERENCIA_RH` (Gerência de RH), `DIRETORIA` (Diretoria) e `COLABORADOR` (Colaborador). Cada conta recebe exatamente um deles. Uma conta não pode alterar a própria configuração de acesso nem excluir a si mesma. A substituição de perfil de negócio exige `ACESSOS.NEGOCIO.GERIR`; a atribuição do perfil Administrador exige também `ACESSOS.GERIR`. O catálogo atual concede a gestão de acesso de negócio a Administrador, RH e Diretoria, mas isso não concede ao Administrador autoridade para publicar, reabrir, consultar indicadores ou exportar. A conta administradora suprema protegida não pode ser alterada, ter acesso substituído, ser desativada ou excluída logicamente pela API normal. Essa defesa impede autoelevação direta ou por conta intermediária.

O Administrador não é autoridade de publicação, reabertura, indicadores ou exportação. Essas ações requerem o papel `GERENCIA_RH` ou `DIRETORIA`, a permissão correspondente e as demais regras de escopo. O Gestor só atua sobre colaboradores com vínculo vigente; o Colaborador só atua na própria autoavaliação quando houver vínculo e ciclo aplicáveis.

Além dessas decisões administrativas, `ADMINISTRADOR_PLATAFORMA` não cria, consulta, edita, envia ou conclui avaliações nem autoavaliações. Essa restrição é aplicada por `V0013`, pelas permissões efetivas e pela autorização individual no servidor.

A recuperação administrativa de senha é uma exceção controlada: somente o ator marcado no banco como administrador supremo pode redefinir a senha de outra conta comum, nunca a própria conta, uma conta suprema, protegida, excluída logicamente ou inativa. A senha temporária é recebida uma única vez, convertida imediatamente em hash BCrypt, não é retornada nem registrada na auditoria. A operação força troca no próximo login, limpa bloqueio de tentativas, revoga todas as sessões do alvo e registra `USUARIO.SENHA_REDEFINIR`.

## Cadastros e vínculos

Os cadastros mantêm escritas administrativas; criações retornam `201` com `{ "id": "UUID" }` e `Location`, e encerramentos/revogações retornam `204`. Toda escrita é transacional e auditada.

| Operação                                                                | Permissão                            | Corpo                                                            |
| ----------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `POST /master-data/branches` / `areas`                                  | `CADASTROS.GERIR`                    | `{ name }`                                                       |
| `PATCH /master-data/branches/{id}/deactivate` / `areas/{id}/deactivate` | `CADASTROS.GERIR`                    | Sem corpo                                                        |
| `DELETE /master-data/branches/{id}`                                     | `CADASTROS.GERIR`                    | Sem corpo; somente filial já inativa e sem lotações.             |
| `POST /master-data/collaborators`                                       | `CADASTROS.GERIR`                    | `{ displayName }`                                                |
| `PATCH /master-data/collaborators/{id}/deactivate`                      | `CADASTROS.GERIR`                    | Sem corpo                                                        |
| `POST /master-data/allocations`                                         | `CADASTROS.GERIR`                    | `{ collaboratorId, branchId?, areaId?, managerText?, startsOn }` |
| `PATCH /master-data/allocations/{id}/close`                             | `CADASTROS.GERIR`                    | `{ endsOn }`                                                     |
| `POST /master-data/user-collaborator-links`                             | `VINCULOS_USUARIO_COLABORADOR.GERIR` | `{ userId, collaboratorId, startsOn }`                           |
| `PATCH /master-data/user-collaborator-links/{id}/close`                 | `VINCULOS_USUARIO_COLABORADOR.GERIR` | `{ endsOn }`                                                     |
| `POST /administration/manager-assignments`                              | `VINCULOS_GESTOR_COLABORADOR.GERIR`  | `{ managerUserId, collaboratorId, startsOn }`                    |
| `PATCH /administration/manager-assignments/{id}/close`                  | `VINCULOS_GESTOR_COLABORADOR.GERIR`  | `{ endsOn }`                                                     |
| `POST /master-data/questionnaire-assignments`                           | `CADASTROS.GERIR`                    | `{ cycleId, collaboratorId, cycleQuestionnaireId }`              |
| `PATCH /master-data/questionnaire-assignments/{id}/revoke`              | `CADASTROS.GERIR`                    | `{ reason }`                                                     |

As leituras abaixo permitem apenas reconstruir as seleções e ações administrativas após recarregar a SPA. Cada rota tem gate HTTP e autorização de método/caso de uso pela permissão indicada; uma permissão de vínculo não substitui `CADASTROS.GERIR`, nem o contrário.

| Operação                                            | Permissão                            | Resposta minimizada                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /master-data/branches`                         | `CADASTROS.GERIR`                    | Lista `{ id, name, active }` de filiais.                                                                                                                                 |
| `GET /master-data/areas`                            | `CADASTROS.GERIR`                    | Lista `{ id, name, active }` de áreas.                                                                                                                                   |
| `GET /master-data/collaborators`                    | `CADASTROS.GERIR`                    | Lista `{ id, displayName, active }` de colaboradores.                                                                                                                    |
| `GET /master-data/allocations/active`               | `CADASTROS.GERIR`                    | Lista somente lotações não encerradas: `{ id, collaboratorId, branchId?, areaId?, managerText?, startsOn? }`.                                                            |
| `GET /administration/manager-assignments/active`    | `VINCULOS_GESTOR_COLABORADOR.GERIR`  | Lista somente vínculos não revogados: `{ id, managerUserId, collaboratorId, startsOn? }`.                                                                                |
| `GET /administration/manager-assignments/options`   | `VINCULOS_GESTOR_COLABORADOR.GERIR`  | `{ managers: [{ id, displayName }], collaborators: [{ id, displayName }] }`; somente contas ativas com papel `GESTOR` vigente e colaboradores ativos.                    |
| `GET /master-data/user-collaborator-links/active`   | `VINCULOS_USUARIO_COLABORADOR.GERIR` | Lista somente vínculos não encerrados: `{ id, userId, collaboratorId, startsOn }`.                                                                                       |
| `GET /master-data/user-collaborator-links/options`  | `VINCULOS_USUARIO_COLABORADOR.GERIR` | `{ users: [{ id, displayName }], collaborators: [{ id, displayName }] }`; somente contas e colaboradores ativos.                                                         |
| `GET /master-data/questionnaire-assignments/active` | `CADASTROS.GERIR`                    | Lista somente atribuições não revogadas, inclusive de ciclos abertos: `{ id, cycleId, cycleCode, cycleName, collaboratorId, cycleQuestionnaireId, questionnaireTitle }`. |
| `GET /master-data/questionnaire-assignment-options` | `CADASTROS.GERIR`                    | Lista somente ciclos `RASCUNHO` que já possuem questionário aplicado: `{ cycleId, cycleCode, cycleName, questionnaires: [{ cycleQuestionnaireId, title }] }`.            |

Decisão de minimização: essas projeções não devolvem CPF, credencial, hash, senha, token, sessão, autoria, `rowversion`, datas de criação/encerramento/revogação, motivo de revogação, histórico, avaliação, resposta, nota, classificação, comentário ou plano de ação. As coleções de lotação e vínculos excluem registros encerrados/revogados em vez de permitir deduzir seu histórico. As opções de atribuição também excluem ciclos abertos/encerrados, conteúdo do questionário e atribuições passadas. A lista de atribuições ativas mantém somente os rótulos `cycleCode`, `cycleName` e `questionnaireTitle`, inclusive após abertura do ciclo; ela não inclui pergunta, opção de resposta, competência, ponto, avaliação ou histórico. As opções de vínculo devolvem somente `id` e `displayName`: não expõem login, situação, papel completo, concessões, credenciais ou os vínculos ativos do escolhido. Elas existem sob a própria permissão de vínculo para viabilizar sua escrita, sem conceder `USUARIOS.LER` ou `CADASTROS.GERIR`. A `V0005` aplicada no banco local dedicado impõe vínculo ativo único de gestor e de conta por colaborador.

## Questionários e ciclos

| Operação                                                                 | Permissão                                     | Contrato                                                                                                                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /questionnaire-versions`                                           | `QUESTIONARIOS.GERIR`                         | Cria e aprova atomicamente versão completa, escala 80/90/100/110/120, cálculo `MEDIA_SIMPLES`/`HALF_UP` e matriz `GERAL`. Retorna IDs da versão, configuração e matriz. |
| `GET /questionnaire-versions/approved`                                   | `QUESTIONARIOS.GERIR` ou `CICLOS.GERIR`       | Lista versões aprovadas com `{ questionnaireVersionId, questionnaireCode, questionnaireName, versionNumber, title, configurationOptions }`.                             |
| `GET /evaluation-cycles?limit=&cursor=`                                  | Escopo de ciclo/avaliação/indicador aplicável | Página de ciclos autorizados.                                                                                                                                           |
| `GET /evaluation-cycles/{cycleId}/questionnaires/{cycleQuestionnaireId}` | Mesmo escopo de leitura                       | Questionário aplicado e congelado do ciclo autorizado.                                                                                                                  |
| `GET /evaluation-cycles/{cycleId}/administration-draft`                  | `CICLOS.GERIR`                                | Retorna somente configuração ainda em rascunho para substituição administrativa.                                                                                        |
| `POST /evaluation-cycles`                                                | `CICLOS.GERIR`                                | Cria rascunho com configuração, questionários aprovados e IDs de cálculo/matriz.                                                                                        |
| `PUT /evaluation-cycles/{cycleId}`                                       | `CICLOS.GERIR`                                | Substitui somente a configuração de rascunho.                                                                                                                           |
| `POST /evaluation-cycles/{cycleId}/open`                                 | `CICLOS.GERIR`                                | Abre uma vez, somente dentro da janela e com questionário aplicado.                                                                                                     |
| `POST /evaluation-cycles/{cycleId}/close`                                | `CICLOS.GERIR`                                | Encerra uma vez após o fim da janela.                                                                                                                                   |

Em cada item de `GET /questionnaire-versions/approved`, `configurationOptions` contém somente combinações aprovadas `{ calculationConfigurationVersionId, calculationCode, calculationVersionNumber, classificationMatrixVersionId, classificationMatrixCode, classificationMatrixVersionNumber }`. Esses IDs são os únicos adicionais necessários para compor `questionnaires` na criação ou substituição do ciclo; perguntas, opções, pontos, competências, bandas e textos descritivos não são retornados nessa leitura. `CICLOS.GERIR` recebe a mesma projeção mínima somente para configurar um ciclo, sem ganhar permissão para criar ou alterar questionários.

`GET /evaluation-cycles/{cycleId}/administration-draft` devolve `{ cycleId, code, name, openingAtLocal, closingAtLocal, timeZone, selfAssessmentEnabled, questionnaires }`, onde cada item de `questionnaires` contém somente `{ cycleQuestionnaireId, questionnaireVersionId, calculationConfigurationVersionId, classificationMatrixVersionId }`. `openingAtLocal` e `closingAtLocal` são convertidos do UTC persistido para o `timeZone` do ciclo para reutilização no `PUT`. O recurso responde `404 RESOURCE_NOT_FOUND` quando o ciclo não existe ou não está em rascunho, sem expor sua situação.

O ciclo v2024.1 exige `America/Sao_Paulo`, início em 1º de setembro às 00:00 e fim exclusivo em 16 de setembro às 00:00. Após a abertura, questionários, cálculo, matriz, fuso e janela ficam imutáveis.

## Vínculo Diretoria–Gerência

Essas rotas exigem `VINCULOS_DIRETORIA_GERENCIA.GERIR`, CSRF nas escritas e preservam vigência/autoria. O vínculo não substitui o vínculo gestor–colaborador.

| Operação                                                                  | Regra                                                                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /administration/director-manager-assignments/active`                 | Retorna vínculos ativos minimizados `{ id, directorUserId, managerCollaboratorId, startsOn }`.      |
| `GET /administration/director-manager-assignments/options`                | Retorna somente Diretorias elegíveis e colaboradores ativos para a composição segura do vínculo.    |
| `POST /administration/director-manager-assignments`                       | Recebe `{ directorUserId, managerCollaboratorId, startsOn }`, valida exclusividade e retorna `201`. |
| `PATCH /administration/director-manager-assignments/{assignmentId}/close` | Recebe `{ endsOn }`, encerra logicamente a vigência e retorna `204`, preservando o histórico.       |

## Avaliações

| Operação                                                                            | Regra                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /assessments?limit=1..100&cursor=<opaco>&cycleId={UUID}&collaboratorId={UUID}` | Retorna `{ items, page: { limit, nextCursor } }` no escopo do ator. `cycleId` e `collaboratorId` são filtros opcionais, sempre reaplicados depois da regra de escopo; `nextCursor` só deve ser reutilizado com os mesmos filtros. |
| `GET /assessments/creation-options?cycleId={UUID}`                                  | Gestor recebe somente `{ collaborators: [{ id, displayName }] }` ainda avaliáveis por ele no ciclo.                                                                                                                               |
| `GET /assessments/director-creation-options?cycleId={UUID}`                         | Diretoria recebe somente Gerências vinculadas e ainda avaliáveis por ela no ciclo.                                                                                                                                                |
| `GET /assessments/{assessmentId}`                                                   | Retorna detalhe somente quando o ator possui escopo do recurso.                                                                                                                                                                   |
| `POST /assessments/{assessmentId}/print-events`                                     | Requer o mesmo escopo de leitura do detalhe e CSRF; registra a solicitação de impressão e retorna `204`, sem gerar ou devolver arquivo.                                                                                           |
| `POST /assessments`                                                                 | Requer `Idempotency-Key`; aceita gestor ou Diretoria–Gerência com `{ type, cycleId, collaboratorId }`, ou autoavaliação com `{ type: "AUTOAVALIACAO", cycleId }`. O servidor valida o vínculo adequado ao tipo.                   |
| `PATCH /assessments/{assessmentId}`                                                 | Requer `If-Match`; salva respostas, comentário e plano somente em rascunho autorizado.                                                                                                                                            |
| `POST /assessments/{assessmentId}/submit`                                           | Requer `If-Match` e `Idempotency-Key`; valida todas as respostas e calcula resultado no servidor.                                                                                                                                 |
| `POST /assessments/{assessmentId}/publish`                                          | Requer `Idempotency-Key`; somente RH/Diretoria publicam avaliação enviada. Gestor e Diretoria–Gerência iniciam feedback `PENDENTE`; autoavaliação fica `NAO_APLICAVEL`.                                                           |
| `POST /assessments/{assessmentId}/feedback`                                         | Requer `Idempotency-Key`; `{ feedbackDate: "YYYY-MM-DD", comment }`. Somente o autor original conclui feedback de sua avaliação publicada elegível. Repetição com a mesma chave é idempotente; não há edição/substituição.        |
| `POST /assessments/{assessmentId}/reopen`                                           | Requer `Idempotency-Key` e `{ reason }` de até 80 caracteres; somente RH/Diretoria reabrem avaliação publicada. A versão e eventual feedback anteriores permanecem históricos.                                                    |

Detalhes devolvem `id`, `cycle`, `evaluated`, `type`, `status`, `feedbackStatus`, `revision`, `updatedAt`, questionário, respostas e, quando aplicável, `result.finalScore` e `result.classification { label, guidance }`. Quando a situação de feedback é `CONCLUIDO`, o detalhe autorizado inclui `feedback: { feedbackDate, comment, completedAt }`; a autoria técnica é inferida no servidor e não é recebida do navegador. Para avaliação enviada ou publicada, devolvem ainda `competencyScores: [{ id, name, score }]`, com a média simples por competência calculada no servidor a partir das respostas persistidas e arredondada para uma casa decimal; esse campo é apenas apresentação individual autorizada e não é um indicador agregado. Cada opção de resposta do questionário traz também seu `points` somente para exibição transparente ao avaliador; o cliente continua enviando exclusivamente `optionId` e o servidor continua sendo a única autoridade para validar a escala, calcular a nota e classificar o resultado. Rascunho não possui resultado nem `competencyScores`. A nota é calculada no servidor, pertence a 80–120 e usa a regra `2024.1`.

Criação, edição e envio regulares só ocorrem dentro da janela aberta. Publicação e reabertura administrativa também são permitidas após o encerramento. A reabertura registrada de uma avaliação de gestor encerrada permite somente ao gestor autor corrigir e reenviar aquele rascunho; não reabre o ciclo, autoavaliações ou novas criações.

A cópia individual é gerada exclusivamente pela caixa de impressão local do navegador, depois do evento auditado. A interface a disponibiliza somente para detalhe enviado ou publicado com resultado calculado e aplica folha A4 compacta de uma página: gráfico radar, nota final e classificação calculadas no servidor e uma linha vazia para assinatura física do colaborador. Comentário, plano de ação, respostas, tabela textual e assinatura eletrônica não fazem parte da cópia; a linha de assinatura não é transmitida nem persistida. Não há rota de download, PDF persistido, anexo ou envio de conteúdo de avaliação por e-mail.

## Indicadores e exportação

| Operação                                 | Regra                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /indicators/options?cycleId={UUID}` | RH/Diretoria recebem `{ branches, areas, managers, competencies }`, cada item `{ id, label }`; cada lista omite opções abaixo de cinco colaboradores distintos.   |
| `GET /indicators`                        | Requer `cycleId` e `metric`; aceita no máximo uma de `branchId`, `areaId`, `managerUserId`; `competencyId` é obrigatório somente para `COMPETENCY_SCORE_AVERAGE`. |
| `POST /indicators/exports`               | Recebe o mesmo filtro em JSON e retorna CSV UTF-8 agregado ou o corpo seguro de indisponibilidade.                                                                |

As métricas são `FINAL_SCORE_AVERAGE`, `COMPETENCY_SCORE_AVERAGE` e `CLASSIFICATION_DISTRIBUTION`. A população contém somente avaliações de gestor publicadas. Filtro de colaborador sempre produz `DADOS_INSUFICIENTES`; grupos menores que cinco não revelam média, contagem, percentual, faixa, gráfico ou identificador. A resposta segura é:

```json
{
  "availability": "DADOS_INSUFICIENTES",
  "policyVersion": "2024.1"
}
```

Consulta e exportação exigem tanto a permissão efetiva correspondente quanto papel `GERENCIA_RH` ou `DIRETORIA`, são auditadas e usam limite local em memória (20 requisições por 15 minutos na configuração padrão). O CSV nunca contém colaborador, login, CPF, comentário, plano de ação, contagem ou resultado individual.

## Condições externas que não alteram o contrato de rotas

- A integração autenticada com SQL Server foi exercitada em DEV com massa fictícia. Carga de dados reais, aceite de RH/LGPD e desempenho no volume aprovado continuam externos; não há exigência técnica de teste autenticado em `AVALIACAO_PROD` neste encerramento.
- A identidade SQL dedicada de mínimo privilégio e o TLS validado foram confirmados no alvo canônico. Segundo administrador supremo, dois custodiantes, retenção/rotação, criptografia em repouso e política/ensaio de backup permanecem procedimentos externos.
- Formalizar no Cloudflare redirecionamento HTTP→HTTPS, proxy confiável para limite de taxa, WAF/bot protection, limite de borda e revalidação dos headers públicos; revisar também o firewall compartilhado da porta 1433 sem afetar outros sistemas.
- Monitoramento, teste assistivo manual e aprovação de liberação continuam exigindo responsáveis e evidências próprias.
- A interface React cobre login, troca de senha, avaliações, indicadores e as rotas administrativas de contas/acessos, cadastros/atribuições, vínculos, questionários e ciclos. As telas usam somente as projeções administrativas minimizadas descritas acima; a API continua autoridade para permissão, escopo, integridade, estado e auditoria.

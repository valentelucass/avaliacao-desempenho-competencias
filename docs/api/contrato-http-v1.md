# Contrato HTTP da API — v1

| Campo                         | Valor                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                        | Implementado no código-fonte e coberto por testes unitários/contratuais e cenário autenticado automatizado em DEV; a configuração versionada continua desabilitada por padrão.                                                                                      |
| Base verificada               | Os hosts públicos responderam em verificação anônima; o cenário autenticado foi executado somente na API/SPA locais contra `AVALIACAO_DEV`, com massa fictícia. Por decisão explícita, teste autenticado em `AVALIACAO_PROD` não integra este encerramento técnico. |
| Pré-requisitos para novo alvo | Histórico completo da fonte até `V0014`, identidade SQL de mínimo privilégio, TLS validado, configuração externa protegida, bootstrap controlado de administradores e validação autorizada por alvo.                                                                |
| Origem                        | `AGENTS.md`, [Regra operacional 2024.1](../business/regras-operacionais-v1.md), ADR-0011, ADR-0012, ADR-0017 e ADR-0018.                                                                                                                                            |

## Estado de ativação

As rotas persistidas não são registradas no processo padrão. `application.properties` mantém `app.persistence.sqlserver.enabled`, `app.security.authentication.enabled`, `app.evaluation-cycles.read.enabled`, `app.assessments.enabled` e `app.indicators.enabled` como `false`.

Em 2026-09-08, verificações somente leitura confirmaram `AVALIACAO_DEV` e `AVALIACAO_PROD` reconciliadas de `V0001` a `V0014`, inclusive a habilitação das jornadas de avaliação e autoavaliação da Gerência de RH. `AVALIACAO_DEV` foi validada por sessão autenticada fictícia, incluindo persistência SQL Server, autorização por papel/recurso, feedback, indicadores/CSV, sessão/CSRF, refresh e logout. A configuração padrão ainda não registra as rotas persistidas; o launcher local as ativa somente em processo controlado. Esse estado não equivale a aceite de negócio, carga autorizada de dados reais ou certificação dos controles externos. A sequência segura está em [Configuração externa da aplicação](../operations/configuracao-externa-da-aplicacao.md).

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
| 403  | `ACCESS_DENIED`, `CSRF_INVALID`                                                                               | Permissão/escopo insuficiente ou falha de CSRF.                    |
| 404  | `RESOURCE_NOT_FOUND`                                                                                          | Recurso inexistente ou fora do escopo.                             |
| 409  | `CONFLICT`, `INVALID_STATE_TRANSITION`, `DUPLICATE_EVALUATION`, `REVISION_MISMATCH`, `IDEMPOTENCY_KEY_REUSED` | Concorrência, estado ou reenvio incompatível.                      |
| 422  | `VALIDATION_FAILED`                                                                                           | Entrada semanticamente inválida.                                   |
| 429  | `RATE_LIMITED`                                                                                                | Limite local de login ou indicador excedido.                       |
| 503  | `SERVICE_UNAVAILABLE`                                                                                         | Estrutura/migration exigida não disponível.                        |

## Sessão local

### Diagnóstico de falhas e recuperação de CSRF

Correções de 16/09/2026 (`ADC-COR-019`/`ADC-COR-021`): a inicialização da SPA cancela a continuação de efeitos encerrados, inclusive na execução duplicada do StrictMode em desenvolvimento. Restauração opcional, renovação explícita e recuperação de 401 compartilham uma operação por instância do cliente HTTP, liberada após sucesso ou falha. Isso evita disputar a rotação do mesmo token dentro da página; não coordena abas diferentes. A abertura e o botão de retomada agora usam `POST /auth/sessions/restore`, com CSRF: acesso válido já autenticado pelo filtro retorna `200 { "authenticated": true }` sem rotação; sem acesso válido, um refresh válido é rotacionado pelo caso de uso existente e retorna o mesmo resultado. Ausência de refresh ou credencial recusada retorna `200 { "authenticated": false }`, sem identidade, novos cookies ou concessão de acesso. Somente após `true` a SPA consulta `/auth/me`; após `false`, apresenta o login. Falhas de CSRF, limitação e infraestrutura continuam erros, sem conversão genérica em sessão ausente. As respostas não permitem cache.

`/auth/me`, `/auth/sessions/refresh` e login inválido preservam seus 401. A nova rota é aditiva em v1; ativar a API compatível antes da SPA. API antiga não oferece restauração opcional: o novo cliente apresenta a falha, sem contornar segurança nem voltar silenciosamente às consultas antigas. O aviso de React DevTools e as mensagens de conexão do Vite são informativos. Origem: pedido do usuário para eliminar os erros de console da abertura sem sessão, mantendo login e autorização.

Correção de 16/09/2026 (`ADC-COR-018`): a revalidação JWT de cada chamada não deve invalidar o CSRF de uma sessão em andamento. O controlador limpa o cookie CSRF após login, refresh, logout e troca de senha bem-sucedidos; a SPA descarta o token em memória nessas transições e obtém um novo antes da próxima escrita. Cookie/header, mascaramento do token e gates de permissão permanecem obrigatórios. A estratégia CSRF de autenticação implícita é neutra neste fluxo stateless: evita a limpeza por `SessionManagementFilter` em toda leitura autenticada, mantendo a rotação explícita nos endpoints. Referência técnica: [configuração de sessão do Spring Security 7.1.1](https://github.com/spring-projects/spring-security/blob/7.1.1/config/src/main/java/org/springframework/security/config/annotation/web/configurers/SessionManagementConfigurer.java) e [ciclo do token CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html).

Extensão aditiva de v1 em 2026-09-15: uma rejeição pelo filtro CSRF retorna `403 CSRF_INVALID`; negações por permissão/escopo continuam `403 ACCESS_DENIED`. O cliente renova o CSRF e repete a escrita **uma única vez**, somente para `CSRF_INVALID`. Não repete uma negação de autorização ou uma resposta 403 sem esse código. Publicar a API compatível antes da SPA; com API anterior, o cliente novo mantém a negação e exige nova tentativa manual, preservando segurança.

Erros de configuração de ciclos mantêm `422 VALIDATION_FAILED` e acrescentam `reasonCode`: `CYCLE_WINDOW_ORDER_INVALID`, `CYCLE_TIME_ZONE_INVALID`, `CYCLE_CODE_INVALID`, `CYCLE_QUESTIONNAIRE_COUNT_INVALID`, `CYCLE_QUESTIONNAIRE_REPEATED` ou `CYCLE_CONFIGURATION_INVALID`. `CYCLE_WINDOW_ORDER_INVALID` indica encerramento igual ou anterior à abertura. O código legado `CYCLE_WINDOW_INVALID` identificava a janela fixa de setembro, removida na revisão autorizada `ADC-COR-013`; o cliente conserva sua mensagem para respostas de uma API antiga. Os campos do contrato permanecem os mesmos. Ativar a API atualizada antes da SPA para que ambas aceitem o período configurado.

Conflitos de questionário mantêm `409 CONFLICT` e acrescentam motivo estável: `QUESTIONNAIRE_CATALOG_CONFLICT`, `COMPETENCY_CATALOG_CONFLICT`, `COMPETENCY_VERSION_CONFLICT`, `CALCULATION_CONFIGURATION_CONFLICT`, `CLASSIFICATION_MATRIX_CONFLICT`, `QUESTIONNAIRE_STATE_CONFLICT` ou `QUESTIONNAIRE_INTEGRITY_CONFLICT`. O último cobre restrições de integridade sem revelar nomes de tabelas ou dados conflitantes; não afirma que toda falha é duplicidade de versão.

`reasonCode` é opcional, e clientes devem preservar o tratamento genérico para valores ausentes/desconhecidos. A interface usa mensagens locais de uma lista permitida e mostra `requestId` validado também em 403/409/422. Erros de leitura identificam a consulta que falhou e não pedem correção de campos não enviados.

Falhas HTTP tratadas são registradas com método, rota-modelo (ou família permitida antes do mapeamento), status, `code`, `reasonCode` e `requestId`. Não entram no registro corpo, query string, identificador do recurso, cookie, credencial, comentário nem mensagem interna da exceção. Esta instrumentação local precisa ser publicada para produzir evidência no runtime; não reconstrói tentativas anteriores.

| Operação                        | Corpo / retorno                                                                  | Regra                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/csrf`                | `{ "token": "…" }`                                                               | Público somente para obter o token técnico de CSRF.                                                                     |
| `POST /auth/sessions`           | `{ "login", "password" }` → `204`                                                | Aplica limitação local, autenticação genérica e escreve `ADC-ACCESS` e `ADC-REFRESH`.                                   |
| `POST /auth/sessions/refresh`   | → `204`                                                                          | Rotaciona o refresh opaco armazenado somente por hash e substitui os cookies.                                           |
| `POST /auth/sessions/restore`   | → `200 { "authenticated": boolean }`                                             | Restauração opcional com CSRF; preserva acesso válido ou tenta o refresh. `false` não autentica nem retorna identidade. |
| `DELETE /auth/sessions/current` | → `204`                                                                          | Revoga a sessão autenticada e limpa cookies.                                                                            |
| `GET /auth/me`                  | `{ id, displayName, permissions, passwordChangeRequired, supremeAdministrator }` | Permissões servem à interface; a autorização sempre é revalidada no servidor.                                           |
| `PUT /auth/password`            | `{ "currentPassword", "newPassword" }` → `204`                                   | Exige nova senha de 12 a 200 caracteres, revoga todas as sessões do usuário e limpa os cookies.                         |

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

O Administrador não é autoridade de publicação, reabertura, indicadores ou exportação. Essas ações requerem o papel `GERENCIA_RH` ou `DIRETORIA`, a permissão correspondente e as demais regras de escopo. Gestor e Gerência de RH só atuam sobre colaboradores com vínculo gestor–colaborador vigente; a Gerência de RH também realiza a própria autoavaliação somente quando houver vínculo conta–colaborador, ciclo e questionário aplicáveis. O Colaborador só atua na própria autoavaliação quando houver vínculo e ciclo aplicáveis.

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
| `GET /administration/manager-assignments/options`   | `VINCULOS_GESTOR_COLABORADOR.GERIR`  | `{ managers: [{ id, displayName }], collaborators: [{ id, displayName }] }`; somente contas ativas com papel `GESTOR` ou `GERENCIA_RH` vigente e colaboradores ativos.   |
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

O ciclo exige `America/Sao_Paulo` e encerramento estritamente posterior à abertura. Datas e horários são configuráveis, inclusive entre meses e anos; o início é inclusivo e o fim exclusivo. Exemplo válido: `openingAtLocal: "2026-09-16T14:00"` e `closingAtLocal: "2026-10-16T23:59"`. Após a abertura, questionários, cálculo, matriz, fuso e janela ficam imutáveis. A revisão de calendário `ADC-COR-013` está registrada em `docs/business/regras-operacionais-v1.md`; não modifica questionários, cálculo ou versões históricas e não exige migration.

As transições mantêm HTTP `409 CONFLICT` quando a janela impede a operação, com `reasonCode` específico: `CYCLE_OPENING_NOT_REACHED` antes da abertura salva, `CYCLE_WINDOW_ENDED` ao tentar abrir depois do prazo e `CYCLE_CLOSING_NOT_REACHED` ao tentar encerrar antes do fim salvo. O relógio e as datas persistidas são conferidos no SQL Server, mantendo o bloqueio transacional do ciclo. Um motivo específico só é retornado se o registro ainda estiver no estado esperado; recurso ausente, estado incompatível ou outra falha continuam com conflito genérico. Não são retornados campos adicionais de negócio. O `requestId` é mantido na resposta e no diagnóstico seguro.

Criar o rascunho não abre o ciclo automaticamente. É necessário salvar a configuração e acionar a abertura dentro do período configurado. A mudança `ADC-COR-014` melhora a explicação dessas regras existentes, sem permitir abertura antecipada ou encerramento antecipado. API antiga permanece compatível com a SPA nova, mas continua retornando a mensagem genérica até ser atualizada.

Criar um ciclo com código já existente retorna `409 CONFLICT` com `reasonCode: CYCLE_CODE_ALREADY_EXISTS` e `requestId`. O código é normalizado antes da gravação; a verificação e a inserção usam a mesma operação/transação, com bloqueio da chave no SQL Server. Nenhum ciclo, configuração ou histórico existente é substituído. Outros conflitos de integridade continuam genéricos. A interface orienta selecionar o ciclo existente em **Ciclos disponíveis** ou usar outro código para um novo ciclo. Diagnóstico aditivo de `ADC-COR-015`, sem migration; requer API atualizada.

## Vínculo Diretoria–Gerência

Essas rotas exigem `VINCULOS_DIRETORIA_GERENCIA.GERIR`, CSRF nas escritas e preservam vigência/autoria. O vínculo não substitui o vínculo gestor–colaborador.

| Operação                                                                  | Regra                                                                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /administration/director-manager-assignments/active`                 | Retorna vínculos ativos minimizados `{ id, directorUserId, managerCollaboratorId, startsOn }`.      |
| `GET /administration/director-manager-assignments/options`                | Retorna somente Diretorias elegíveis e colaboradores ativos para a composição segura do vínculo.    |
| `POST /administration/director-manager-assignments`                       | Recebe `{ directorUserId, managerCollaboratorId, startsOn }`, valida exclusividade e retorna `201`. |
| `PATCH /administration/director-manager-assignments/{assignmentId}/close` | Recebe `{ endsOn }`, encerra logicamente a vigência e retorna `204`, preservando o histórico.       |

## Avaliações

| Operação                                                    | Regra                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /assessments`                                          | Retorna `{ items, page: { limit, nextCursor } }` no escopo do ator. Aceita `limit=1..100`, `cursor` opaco e os filtros opcionais abaixo; `nextCursor` só deve ser reutilizado com os mesmos filtros.                       |
| `GET /assessments/creation-options?cycleId={UUID}`          | Gestor recebe somente `{ collaborators: [{ id, displayName }] }` ainda avaliáveis por ele no ciclo.                                                                                                                        |
| `GET /assessments/director-creation-options?cycleId={UUID}` | Diretoria recebe somente Gerências vinculadas e ainda avaliáveis por ela no ciclo.                                                                                                                                         |
| `GET /assessments/{assessmentId}`                           | Retorna detalhe somente quando o ator possui escopo do recurso.                                                                                                                                                            |
| `POST /assessments/{assessmentId}/print-events`             | Requer o mesmo escopo de leitura do detalhe e CSRF; registra a solicitação de impressão e retorna `204`, sem gerar ou devolver arquivo.                                                                                    |
| `POST /assessments`                                         | Requer `Idempotency-Key`; aceita gestor ou Diretoria–Gerência com `{ type, cycleId, collaboratorId }`, ou autoavaliação com `{ type: "AUTOAVALIACAO", cycleId }`. O servidor valida o vínculo adequado ao tipo.            |
| `PATCH /assessments/{assessmentId}`                         | Requer `If-Match`; salva respostas, comentário e plano somente em rascunho autorizado.                                                                                                                                     |
| `POST /assessments/{assessmentId}/submit`                   | Requer `If-Match` e `Idempotency-Key`; valida todas as respostas e calcula resultado no servidor.                                                                                                                          |
| `POST /assessments/{assessmentId}/publish`                  | Requer `Idempotency-Key`; somente RH/Diretoria publicam avaliação enviada. Gestor e Diretoria–Gerência iniciam feedback `PENDENTE`; autoavaliação fica `NAO_APLICAVEL`.                                                    |
| `POST /assessments/{assessmentId}/feedback`                 | Requer `Idempotency-Key`; `{ feedbackDate: "YYYY-MM-DD", comment }`. Somente o autor original conclui feedback de sua avaliação publicada elegível. Repetição com a mesma chave é idempotente; não há edição/substituição. |
| `POST /assessments/{assessmentId}/reopen`                   | Requer `Idempotency-Key` e `{ reason }` de até 80 caracteres; somente RH/Diretoria reabrem avaliação publicada. A versão e eventual feedback anteriores permanecem históricos.                                             |

Filtros de listagem (aditivos em v1, ADC-UI-051):

| Parâmetro                   | Semântica                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cycleId`, `collaboratorId` | UUIDs opcionais já existentes para localização/pré-visualização administrativa.                                                                                                        |
| `evaluatedName`             | Trecho literal do nome de exibição do colaborador avaliado.                                                                                                                            |
| `managerName`               | Trecho literal do nome de exibição da conta avaliadora registrada em `GESTOR` ou `DIRETORIA_GERENCIA`; não usa o gestor atual da lotação. Autoavaliação não corresponde a este filtro. |
| `status`                    | `RASCUNHO`, `ENVIADA` ou `PUBLICADA`.                                                                                                                                                  |
| `feedbackStatus`            | `PENDENTE`, `CONCLUIDO` ou `NAO_APLICAVEL`, conforme a mesma situação efetiva devolvida na lista e a versão atual da avaliação.                                                        |

Os filtros são combinados por **E**, sempre dentro da autorização existente e antes do limite/cursor no SQL. Nomes aceitam até 160 caracteres sem controles, com espaços externos removidos; vazio significa sem filtro. A busca ignora caixa e acentos (`Latin1_General_100_CI_AI`); `%`, `_`, colchetes e apóstrofos não são curingas nem SQL. Estados/nome inválidos retornam `422` genérico, sem ecoar a entrada. O resumo e suas permissões não mudaram. Front-end novo deve ser usado com back-end atualizado: versões anteriores podem ignorar os parâmetros novos. Nenhuma migration é necessária.

Detalhes devolvem `id`, `cycle`, `evaluated`, `type`, `status`, `feedbackStatus`, `revision`, `updatedAt`, questionário, respostas e, quando aplicável, `result.finalScore` e `result.classification { label, guidance }`. Quando a situação de feedback é `CONCLUIDO`, o detalhe autorizado inclui `feedback: { feedbackDate, comment, completedAt }`; a autoria técnica é inferida no servidor e não é recebida do navegador. Para avaliação enviada ou publicada, devolvem ainda `competencyScores: [{ id, name, score }]`, com a média simples por competência calculada no servidor a partir das respostas persistidas e arredondada para uma casa decimal; esse campo é apenas apresentação individual autorizada e não é um indicador agregado. Cada opção de resposta do questionário traz também seu `points` somente para exibição transparente ao avaliador; o cliente continua enviando exclusivamente `optionId` e o servidor continua sendo a única autoridade para validar a escala, calcular a nota e classificar o resultado. Rascunho não possui resultado nem `competencyScores`. A nota é calculada no servidor, pertence a 80–120 e usa a regra `2024.1`.

Criação, edição e envio regulares só ocorrem dentro da janela aberta. Publicação e reabertura administrativa também são permitidas após o encerramento. A reabertura registrada de uma avaliação de gestor encerrada permite somente ao gestor autor corrigir e reenviar aquele rascunho; não reabre o ciclo, autoavaliações ou novas criações.

O detalhe também devolve `allowedActions: { edit, submit, publish, reopen, completeFeedback }`, cinco booleanos calculados no servidor para o ator e o recurso consultados, reutilizando as verificações das escritas (autoria, permissão, vínculo, estado e janela aplicáveis). São orientações de interface, não autorização reutilizável: cada comando continua revalidando todas as condições. Não são aceitos nos DTOs de entrada. A inclusão é aditiva em v1; clientes antigos podem ignorá-la. O cliente novo exige o valor `true` e mantém a tela somente para consulta quando o campo estiver ausente: publicar o back-end compatível antes do front-end evita indisponibilidade transitória das ações. RH com permissão global de avaliação não recebe edição, envio ou feedback de outro autor.

A cópia individual é gerada exclusivamente pela caixa de impressão local do navegador, depois do evento auditado. A interface a disponibiliza somente para detalhe enviado ou publicado com resultado calculado: gráfico radar, nota final, classificação, orientação e lista completa das competências com suas notas calculadas no servidor, além de assinatura física e data à direita. O layout A4 foi validado em uma página no Edge com 21 competências e cabeçalho longo; configurações de impressora, escala e cabeçalhos externos devem ser conferidas na prévia. Comentário, plano de ação, respostas individuais e assinatura eletrônica não fazem parte da cópia; assinatura e data em papel não são transmitidas nem persistidas. Não há rota de download, PDF persistido, anexo ou envio de conteúdo de avaliação por e-mail.

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

## Importação de colaboradores, lotações e atribuições por XLSX

Adições compatíveis de 16/09/2026, autorizadas pelo usuário em `ADC-IMP-001` e `ADC-IMP-002`. Todas as rotas abaixo exigem sessão e **CADASTROS.GERIR**; escritas exigem CSRF.

| Método e rota                                                  | Contrato                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST /master-data/imports/collaborators/preview`              | Corpo binário XLSX; não usar multipart ou JSON.                         |
| `POST /master-data/imports/allocations/preview`                | Mesmo corpo; cinco cabeçalhos de lotação, sem `cycleId`.                |
| `POST /master-data/imports/assignments/preview?cycleId={uuid}` | Mesmo corpo; ciclo em rascunho selecionado explicitamente.              |
| `GET /master-data/imports/{id}?page=1`                         | Página de 25 linhas da conferência do ator autenticado.                 |
| `POST /master-data/imports/{id}/confirm`                       | Sem corpo. Confirma o lote revalidado; retorna `{ created, existing }`. |
| `DELETE /master-data/imports/{id}`                             | Sem corpo. Descarta a conferência do próprio ator; resposta 200 vazia.  |

Upload exige `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; assinatura/conteúdo OOXML e limites são conferidos independentemente desse cabeçalho. Máximo de 1.048.576 bytes, uma aba literal, 1.000 linhas de dados e 8 MiB expandidos. Cabeçalhos e regras no [modelo de negócio](../business/importacao-planilhas-cadastros.md). **Filial é ignorada nas Atribuições**, sem gerar lotação. Em Lotações, os cinco cabeçalhos podem estar em qualquer ordem entre A e Z; colunas extras de dados são ignoradas, mantendo a proibição de fórmulas/links/macros. Datas aceitam texto `dd/MM/aaaa` ou serial inteiro do Excel 1900/1904, sem horário; a prévia devolve `dd/MM/aaaa`.

Prévia responde 200 com `{ id, expiresAt, total, creates, existing, errors, page, totalPages, rows }`. Cada linha contém `{ line, name, questionnaire, status, message, allocation }`; `status` é `CREATE`, `EXISTS` ou `ERROR`. `allocation` é nulo nos dois modelos anteriores; em Lotações contém `{ branch, area, manager, startsOn }`, somente valores de conferência, sem IDs internos. Uma planilha estruturalmente válida pode retornar pendências de negócio em `rows`; nenhuma escrita ocorre na prévia. O UUID expira em 15 minutos e pertence ao ator, não à sessão/token enviado pelo cliente. Contagens cobrem o lote; linhas são paginadas, sem IDs internos de colaborador/questionário.

Lotações exige colaborador único ativo e início válido; filial/área opcionais devem existir e estar ativas quando preenchidas. Gestor é texto informativo. Lotação aberta idêntica é `EXISTS`; sobreposição inclusiva, homônimo, repetição ou referência inválida é `ERROR`. Confirmação cria lotações abertas pelos casos de uso auditados, sem alterar ou encerrar períodos existentes.

Na confirmação, erros de linha ou dados alterados rejeitam todo o lote. Escritas e auditorias são atômicas, reaproveitando ações individuais. Repetir o mesmo UUID após sucesso retorna o mesmo resultado enquanto válido. Reinício perde prévias; reenviar o arquivo exige nova conferência e identifica registros existentes. Não há deduplicação por hash do arquivo nem autorização para atualizar/remover cadastros.

Erros seguem Problem Details e `requestId`, com `code`: `IMPORT_INVALID_FILE` (422), `IMPORT_LIMIT_EXCEEDED` (413), `IMPORT_EXPIRED` (409, também para UUID de outro ator), `IMPORT_STALE` (409), `IMPORT_RATE_LIMITED` (429). Conteúdo e causas internas não são incluídos. Limites: dez tentativas de upload/confirmação por ator por minuto, duas leituras simultâneas, quatro prévias por ator e 32 globais; instância única. Limpeza de prévias a cada minuto; sem arquivo em disco.


## Manutenção de Áreas e Colaboradores — ADC-COR-022

Extensão aditiva, com `CADASTROS.GERIR`, CSRF e ator obtido da sessão:

| Rota | Corpo / comportamento |
| --- | --- |
| `PATCH /master-data/areas/{id}` | `{ name }`; corrige nome inclusive inativo, preserva situação/ID. |
| `PATCH /master-data/collaborators/{id}` | `{ displayName }`; corrige nome inclusive inativo, preserva situação/ID. |
| `PATCH /master-data/areas/{id}/reactivate` | Sem corpo; inativo → ativo. |
| `PATCH /master-data/collaborators/{id}/reactivate` | Sem corpo; inativo → ativo, sem alterar vínculos. |
| `DELETE /master-data/areas/{id}` | Somente inativo sem lotação, inclusive histórica. |
| `DELETE /master-data/collaborators/{id}` | Somente inativo sem lotações, vínculos, atribuições ou avaliações, inclusive históricos. |

Sucesso: 204. Nome obrigatório, até 200 caracteres; campos extras rejeitados também nos DTOs compartilhados de criação. Estado incompatível/recurso ausente continua conflito, sem vazamento de SQL. Exclusão negada por uso/atividade: 409 `MASTER_DATA_DELETE_BLOCKED`; falta de habilitação SQL: 503 `MASTER_DATA_DELETE_UNAVAILABLE`. Auditoria mínima transacional em todas as operações, sem apagar histórico. Nomes são rótulos atuais do mesmo cadastro, inclusive em consultas históricas, não novos IDs ou versões de avaliação.

## Importação de vínculos gestor–colaborador — ADC-IMP-003

Prefixo `/administration/manager-assignment-imports`, permissão `VINCULOS_GESTOR_COLABORADOR.GERIR` em todas as rotas; CSRF nas escritas:

| Rota | Contrato |
| --- | --- |
| `POST /preview` | Binário XLSX, até 1 MB/1.000 linhas; Conta avaliadora, Colaborador e Início. Sem ciclo. |
| `GET /{id}?page=1` | Mesma projeção paginada das importações, páginas de 25 linhas. |
| `POST /{id}/confirm` | Sem corpo; revalidação e criação atômica. Retorna `{ created, existing }`. |
| `DELETE /{id}` | Descartar apenas prévia do próprio ator/família. Não remove vínculos. |

A linha da prévia acrescenta `managerAssignment: { manager, startsOn }`: nome fornecido da conta e data normalizada, sem login, IDs resolvidos, papel ou histórico. Campos existentes dos outros importadores permanecem compatíveis. Mesmos códigos `IMPORT_*`, prazo e limites de memória/taxa. Endpoints de cadastros não acessam tokens de vínculo e vice-versa; a proteção vale também para o mesmo ator com ambas as permissões. Confirmação com permissão revogada é negada antes do serviço, incluindo reenvios. Nomes duplicados/ambíguos, conta inelegível e sobreposição bloqueiam sem criação parcial ou concessão implícita.

Detalhes operacionais: [manutenção e vínculos](../operations/manutencao-cadastros-e-importacao-vinculos.md).

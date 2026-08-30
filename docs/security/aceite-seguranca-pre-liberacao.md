# Checklist de segurança e aceite pré-liberação

> Status: não aprovado. Esta é uma lista de evidências necessárias; não é certificação de OWASP ASVS, LGPD ou produção.

## Base já verificada localmente

- A API nega rotas por padrão, aplica CORS explícito, CSRF, cabeçalhos de segurança, erros sem detalhe interno e correlação de requisição.
- A fonte implementa identidade local, sessão/JWT, RBAC/ABAC por recurso, vínculos, auditoria e limites locais. Em 2026-08-29, `AVALIACAO_DEV` e `AVALIACAO_PROD` reconciliaram `V0001` a `V0013`.
- O cenário autenticado automatizado com massa exclusivamente fictícia passou em `AVALIACAO_DEV`: cobriu login, autorização por papel/recurso, refresh rotativo, logout, CSRF, feedback, exclusões administrativas restritas, indicadores, supressão de privacidade, CSV, rate limit e persistência SQL Server. Por decisão explícita, teste autenticado em `AVALIACAO_PROD` foi retirado do escopo deste encerramento técnico.
- A identidade SQL externa usada pela aplicação no alvo canônico passou pelo validador de mínimo privilégio, sem `sa`, `sysadmin`, papel de servidor/banco, DDL, `CONTROL`, `ALTER` ou acesso a outro banco; os dois `DELETE` necessários ficam restritos aos objetos administrativos autorizados. A conexão da aplicação exige criptografia com cadeia e nome do certificado validados, sem `trustServerCertificate=true`.
- O gate `scripts/verify-quality.ps1` inclui testes, lint/formatter, migrations, scanner heurístico de segredos, auditoria npm, geração de SBOM CycloneDX e verificação Java por OSV Scanner. A execução consolidada e o gate do release passaram em 2026-08-29; isso não equivale, sozinho, a aceite de liberação.

Essas evidências não comprovam aceite de negócio, proteção completa de dados pessoais, backup/restauração, desempenho com dados reais, teste assistivo manual ou os controles externos do proxy/Tunnel.

## Revisão técnica local — 2026-08-26

Esta revisão é um mapeamento temático dos controles ASVS aplicáveis à fonte e ao runtime local. Não é certificação ASVS, teste de intrusão, aceite LGPD nem autorização de liberação.

| Tema ASVS aplicável               | Evidência técnica verificada                                                                                                                                                                                                  | Limite da evidência                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Arquitetura, configuração e erros | Rotas negadas por padrão, configuração versionada desabilitada, Problem Details sem detalhes internos, correlação limitada e headers defensivos. HSTS, CSP e políticas defensivas passaram na API/SPA pública após o release. | HTTP→HTTPS ainda não redireciona; WAF/bot e monitoração são controles externos.              |
| Autenticação e senhas             | BCrypt custo 12, limite local de tentativas, bloqueio temporário, JWT curto com `iss`/`aud`/tempo/`jti`/`sid`, sessão persistida revalidada e refresh rotativo; fluxo autenticado passou em DEV com SQL Server.               | Não houve teste autenticado em `AVALIACAO_PROD`, retirado explicitamente do escopo técnico.  |
| Sessão e CSRF                     | Credenciais em cookies `HttpOnly`, `Secure` e `SameSite=Strict`; rotação, recuperação de CSRF, refresh e logout passaram no cenário autenticado de DEV.                                                                       | O comportamento de borda ainda depende da configuração e revalidação do Tunnel.              |
| Controle de acesso                | RBAC/ABAC, escopo por vínculo, dupla proteção por rota/caso de uso e segregação do Administrador foram exercitados com tentativas permitidas e negadas em DEV.                                                                | Carga real, matriz de pessoas e aceite RH continuam externos.                                |
| Dados, entradas e API             | DTOs validados, JDBC parametrizado, indicadores/CSV com supressão integral abaixo de cinco, API v1 e CORS explícito foram cobertos por testes e pelo cenário autenticado de DEV.                                              | Não substitui SAST independente, pentest ou teste de desempenho com dados aprovados.         |
| Banco e isolamento                | Identidade SQL dedicada de mínimo privilégio e TLS validado passaram no alvo canônico. RLS foi classificada como não aplicável à topologia inicial pela ADR-0018, sem substituir RBAC/ABAC.                                   | Firewall compartilhado da porta 1433, criptografia em repouso e backup continuam externos.   |
| Logs e segredos                   | Scanner local de segredos e configuração segura de logs existem; o front-end não armazena credenciais em `localStorage` ou `sessionStorage`.                                                                                  | Retenção, rotação, descarte, alertas e tratamento de logs anteriores continuam operacionais. |

O fechamento técnico não elimina as condições externas da tabela seguinte, especialmente backup/restauração, LGPD/RH, segundo administrador/custodiantes, Cloudflare, firewall e validação assistiva manual.

## Bloqueios de aceite

| Tema                              | Evidência exigida antes de liberar                                                                     | Situação                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Identidade                        | Login, JWT curto, renovação rotativa, logout/revogação e falhas                                        | Validado em DEV; segundo administrador e custodiantes permanecem externos                               |
| Autorização                       | Matriz, vínculos, escopo por recurso e tentativas indevidas                                            | Validado tecnicamente em DEV; carga/aceite real pendentes                                               |
| Auditoria e proteção contra abuso | Eventos duráveis sem segredos, origem confiável atrás do Tunnel, rate limit e bloqueio temporário      | Aplicação validada em DEV; controles de borda pendentes                                                 |
| Dados pessoais                    | Finalidade, minimização, acesso, exportação, responsáveis e revisão com RH/encarregado                 | Pendente de aceite RH/LGPD e carga autorizada                                                           |
| Banco e operação                  | Conta mínima, TLS, firewall, logs e backup/restauração                                                 | Conta, TLS e restauração técnica validados; política de backup, firewall e retenção permanecem externos |
| Administrador supremo             | Dois administradores ativos, custodiantes definidos e recuperação exercitada em ambiente não produtivo | Pendente                                                                                                |
| Aplicação e experiência           | Testes de contrato/integração e conferência de navegador, teclado, contraste, zoom e leitor de tela    | Automação técnica executada em DEV; conferência assistiva manual pendente                               |
| ASVS e desempenho                 | Itens ASVS aplicáveis revisados, carga/latência definida e evidências arquivadas                       | Pendente                                                                                                |
| Liberação                         | Aprovação de RH/Diretoria, responsável operacional, versão, plano de retorno e evidências do runbook   | Pendente                                                                                                |

## Regra de decisão

Nenhum item marcado como bloqueio pode ser tratado como concluído por documentação ou por um teste isolado. O aceite só poderá ser registrado quando houver evidência executada para o sistema efetivamente implementado e autorização explícita do responsável de negócio e operação.

Consulte também o [Runbook de pré-publicação](../operations/pre-publication-runbook.md) e a [fundação de segurança HTTP](fundacao-seguranca-http.md).

# Checklist de segurança e aceite pré-liberação

> Status: não aprovado. Esta é uma lista de evidências necessárias; não é certificação de OWASP ASVS, LGPD ou produção.

## Base já verificada localmente

- A API nega rotas por padrão, aplica CORS explícito, CSRF, cabeçalhos de segurança, erros sem detalhe interno e correlação de requisição.
- A fonte implementa identidade local, sessão/JWT, RBAC/ABAC por recurso, vínculos, auditoria e limiter local; o banco local dedicado está reconciliado de `V0001` a `V0007` e possui somente uma conta técnica de desenvolvimento, sem dado ou escopo de negócio.
- O gate `scripts/verify-quality.ps1` cobre testes locais, lint/formatter, revisão estática das migrations, scanner heurístico de segredos e auditoria npm. As validações SQL do runner passaram no banco local e a inicialização API/SPA/proxy respondeu CSRF `200` e rota protegida `401`; integração de repositórios, login interativo e navegador ainda permanecem pendentes.

Essas evidências de fonte não comprovam integração contra SQL Server, operação pública, proxy/Tunnel ou proteção completa de dados pessoais.

## Revisão técnica local — 2026-08-26

Esta revisão é um mapeamento temático dos controles ASVS aplicáveis à fonte e ao runtime local. Não é certificação ASVS, teste de intrusão, aceite LGPD nem autorização de liberação.

| Tema ASVS aplicável               | Evidência técnica verificada                                                                                                                                                                                        | Limite da evidência                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Arquitetura, configuração e erros | Rotas negadas por padrão, configuração versionada desabilitada, Problem Details sem detalhes internos, correlação limitada e headers defensivos. A rota protegida local retornou `401` com os headers esperados.    | Não valida proxy, Tunnel, HSTS público ou monitoramento.                                           |
| Autenticação e senhas             | BCrypt custo 12, limite local de tentativas, bloqueio temporário, JWT curto com `iss`/`aud`/tempo/`jti`/`sid`, sessão persistida revalidada e refresh rotativo.                                                     | A integração SQL Server e os fluxos reais de conta ainda exigem teste controlado.                  |
| Sessão e CSRF                     | Credenciais em cookies `HttpOnly`, `Secure` e `SameSite=Strict`; o cookie CSRF legível pela SPA passou a forçar `Path=/`, `Secure` e `SameSite=Strict`, com teste de regressão.                                     | A validade do comportamento através do proxy público depende da configuração autorizada do Tunnel. |
| Controle de acesso                | RBAC/ABAC, escopo por vínculo, dupla proteção por rota e caso de uso, segregação de administrador técnico e auditoria de negações estão presentes em fonte.                                                         | Requer matriz e tentativas indevidas contra SQL Server com dados de teste autorizados.             |
| Dados, entradas e API             | DTOs validados, JDBC parametrizado, filtros de indicadores com supressão de grupos pequenos, API v1, CORS explícito e verificação estática sem montagem dinâmica de SQL.                                            | Não substitui SAST independente, pentest ou teste de contrato/fim a fim.                           |
| Logs e segredos                   | Scanner local de segredos passou; a busca no novo log local não encontrou serialização de resposta CSRF/usuário nem níveis DEBUG/TRACE. O front-end não armazena credenciais em `localStorage` ou `sessionStorage`. | Política de acesso, retenção e tratamento de logs anteriores continua operacional.                 |

Permanece bloqueado o aceite de liberação pelos itens da tabela seguinte, especialmente backup/restauração, LGPD/RH, segredos e identidade de produção, recuperação de administrador supremo, Cloudflare/PM2 e desempenho.

## Bloqueios de aceite

| Tema                              | Evidência exigida antes de liberar                                                                                          | Situação                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Identidade                        | Login local, primeira credencial/redefinição, JWT curto, renovação rotativa, logout/revogação e testes de falha             | Implementado em fonte; pendente ativação/integr. SQL/produção |
| Autorização                       | Matriz de permissões, vínculo gestor-colaborador, escopo por recurso e testes de tentativa indevida                         | Implementado em fonte; pendente ativação/integr. SQL/produção |
| Auditoria e proteção contra abuso | Eventos duráveis sem segredos, origem confiável atrás do Tunnel, rate limit e bloqueio temporário                           | Implementado em fonte; pendente proxy/integr. SQL/produção    |
| Dados pessoais                    | Finalidade, minimização, acesso, exportação, responsáveis e revisão com RH/encarregado                                      | Pendente de regras e fluxos                                   |
| Banco e operação                  | Conta de aplicação de mínimo privilégio, TLS do SQL Server, firewall decidido, logs protegidos e backup/restauração testada | Pendente                                                      |
| Administrador supremo             | Dois administradores ativos, custodiantes definidos e recuperação exercitada em ambiente não produtivo                      | Pendente                                                      |
| Aplicação e experiência           | Testes de contrato, integração, navegador, teclado, contraste, responsividade e fluxos críticos                             | Pendente                                                      |
| ASVS e desempenho                 | Itens ASVS aplicáveis revisados, carga/latência definida e evidências arquivadas                                            | Pendente                                                      |
| Liberação                         | Aprovação de RH/Diretoria, responsável operacional, versão, plano de retorno e evidências do runbook                        | Pendente                                                      |

## Regra de decisão

Nenhum item marcado como bloqueio pode ser tratado como concluído por documentação ou por um teste isolado. O aceite só poderá ser registrado quando houver evidência executada para o sistema efetivamente implementado e autorização explícita do responsável de negócio e operação.

Consulte também o [Runbook de pré-publicação](../operations/pre-publication-runbook.md) e a [fundação de segurança HTTP](fundacao-seguranca-http.md).

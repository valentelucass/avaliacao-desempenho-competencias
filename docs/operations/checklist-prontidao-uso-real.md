# Checklist de prontidão para uso real

> Status: evidência técnica parcial e condições externas para uso real. Este checklist não autoriza carga de dados, alteração de infraestrutura, criação de conta, backup, restauração ou firewall.

## Uso

Preencha uma execução por vez, com responsável, data/hora, alvo e evidência protegida. Uma marcação só vale quando a evidência foi executada no alvo indicado. Dados pessoais, credenciais, tokens, comentários de avaliação e arquivos de backup não devem ser anexados a este documento nem ao Git.

## Identidade, dados e responsáveis

| Verificação                          | Evidência mínima                                                                      | Responsável    | Situação                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| Dois administradores supremos ativos | Confirmação autenticada de duas pessoas distintas, escopos e contatos de contingência | Operação/RH    | Pendente                                                               |
| Primeiro acesso e troca de senha     | Roteiro executado com contas aprovadas, sem registrar senhas                          | Operação       | Confirmado para a conta inicial; não substitui o segundo administrador |
| Recuperação por dois custodiantes    | Procedimento revisado, pessoas nomeadas e simulação aprovada                          | Operação/RH    | Pendente                                                               |
| Carga autorizada                     | Origem, minimização, responsável, destino e rollback da carga aprovados               | RH/encarregado | Pendente                                                               |
| Jornadas reais                       | Roteiro autenticado aprovado para RH, Diretoria, Gestor e Administrador técnico       | RH/QA          | Automação fictícia concluída em DEV; carga e aceite reais pendentes    |

## Banco, retenção e recuperação

| Verificação                | Evidência mínima                                                                             | Responsável        | Situação                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------- |
| Conta SQL da aplicação     | Identidade efetiva, mínimo privilégio e ausência de `sa` confirmados sem expor segredo       | DBA                | Concluído no alvo canônico em 2026-08-29                                  |
| TLS do SQL Server          | Cadeia validada pela aplicação; sem `trustServerCertificate=true` no alvo real               | DBA/infraestrutura | Concluído no alvo canônico em 2026-08-29                                  |
| Backup                     | Frequência, retenção, local restrito, proprietário e alerta documentados                     | DBA                | Pendente                                                                  |
| Restauração                | Restauração concluída em ambiente seguro, com horário, integridade e recuperação registrados | DBA                | Teste técnico concluído em 2026-08-29; repetir conforme a futura política |
| Criptografia em repouso    | Decisão para banco/backups, gestão de chaves e evidência no alvo                             | Segurança/DBA      | Pendente                                                                  |
| Aplicabilidade de RLS      | Decisão de arquitetura e reavaliação pelos gatilhos definidos                                | Segurança/DBA      | Não aplicável à topologia inicial; ADR-0018                               |
| Retenção de logs e sessões | Prazo, acesso, descarte e correlação definidos e aplicados                                   | Operação/segurança | Pendente                                                                  |

## Exposição, segurança e observabilidade

| Verificação          | Evidência mínima                                                                         | Responsável       | Situação                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| Porta SQL e firewall | SQL não acessível fora do escopo aprovado; regra revisada                                | Infraestrutura    | Pendente                                                     |
| Proxy e origem       | Host, CORS, cookies, CSRF, headers e HTTPS verificados no endereço final                 | Infraestrutura/QA | HTTPS, CORS e headers validados; HTTP→HTTPS externo pendente |
| Limite de abuso      | Rate limit e bloqueio de login testados com o proxy confiável definido                   | Segurança/QA      | Pendente                                                     |
| WAF/bot protection   | Decisão de infraestrutura aprovada e teste executado, se aplicável                       | Segurança         | Pendente                                                     |
| Logs e alertas       | Acesso restrito e observação de disponibilidade, erros, latência e falhas de autorização | Operação          | Pendente                                                     |
| Dependências         | Scanner de segredos, auditorias Java/JavaScript e SBOM executados no gate definido       | Engenharia        | Gate consolidado e gate do release concluídos em 2026-08-29  |

## Produto e privacidade

| Verificação           | Evidência mínima                                                                                   | Responsável    | Situação                                               |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| Indicadores e CSV     | Teste autenticado com ciclo aprovado, supressão integral abaixo de cinco e auditoria de exportação | RH/QA          | Concluído tecnicamente em DEV; aceite RH/LGPD pendente |
| Sessão e CSRF         | Login, renovação, logout, revogação e escritas protegidas testados no alvo                         | QA/segurança   | Concluído tecnicamente em DEV                          |
| Aceite RH/LGPD        | Finalidade, escopos, responsáveis, retenção e jornadas aprovados                                   | RH/encarregado | Pendente                                               |
| Acessibilidade manual | Teclado, foco, leitor de tela e zoom conferidos conforme roteiro próprio                           | QA             | Pendente                                               |

## Critério de encerramento

Não liberar uso real enquanto houver linha externa pendente que se aplique ao alvo. O teste autenticado em `AVALIACAO_PROD` foi retirado explicitamente do escopo técnico e não substitui carga autorizada, aceite RH/LGPD ou validações operacionais. Registrar a referência da evidência em local protegido e atualizar `STATES.md` somente com o que foi efetivamente executado.

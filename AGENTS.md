# Regras Operacionais para IAs — Avaliação de Desempenho e Competências

Você atua como Engenheiro(a) de Software Principal do projeto Avaliação de Desempenho e Competências. O sistema será uma aplicação interna para avaliações de colaboradores, com formulários responsivos, cálculo de desempenho, classificação por faixas e indicadores consolidados.

## 1. Leitura obrigatória, contexto e autorização

Antes de planejar, analisar ou alterar qualquer coisa, leia este AGENTS.md e o `STATES.md` da raiz. Se existir `../CONTEXTO_GLOBAL.md`, leia-o também; não presuma que ele exista.

Em caso de conflito entre instruções, priorize a proteção de dados pessoais, a integridade das avaliações, a segurança e a autorização explícita do usuário.

Perguntas, pesquisas, hipóteses ou protótipos não autorizam criar banco, schema, migration, usuário de SQL Server, credencial, conta, serviço de VM, integração externa, deploy ou alteração em produção.

Antes de qualquer ação externa, irreversível ou de produção, confirme alvo, impacto, recuperação e autorização. Não exponha segredos, tokens, senhas, dados pessoais ou avaliações em respostas, logs, testes ou documentação.

Preserve alterações preexistentes do usuário. Nunca descarte, sobrescreva, mova ou limpe arquivos materialmente sem verificar o alvo e receber autorização quando necessário.

Depois de toda alteração de código, contrato, banco, operação ou decisão relevante, atualize o `STATES.md` com o que realmente foi concluído, a evidência, os riscos e as pendências.

## 2. Produto e escopo confirmado

O produto é um sistema web interno para gestores realizarem avaliações de desempenho de colaboradores em celular ou computador.

O sistema deve armazenar respostas internamente, calcular o resultado no servidor e oferecer indicadores por competência, filial, área, gestor, colaborador e ciclo de avaliação.

Tecnologias confirmadas: React + TypeScript no front-end, Java no back-end, Microsoft SQL Server no banco de dados e execução direta em uma máquina virtual interna.

Não usar Docker como requisito de desenvolvimento, teste, deploy ou operação sem pedido explícito do usuário.

O projeto começa como monólito modular. Não introduza microserviços, filas, caches distribuídos, IAM externo, aplicativo nativo ou integrações com ERP/RH/AD sem escopo e autorização explícitos.

A versão inicial não pressupõe envio de e-mails, PDI completo, SSO, exportação irrestrita, integração com folha ou publicação externa.

## 3. Arquitetura-alvo

O back-end deve ser um monólito modular orientado a casos de uso e fronteiras claras. Módulos iniciais: identidade-acesso, cadastros, ciclos-avaliacao, avaliacoes, indicadores, auditoria e relatorios.

Organize o Java em camadas claras: api (HTTP/DTOs), application (casos de uso), domain (regras), infrastructure (SQL Server, segurança, arquivos e observabilidade). O domínio não depende de Spring, HTTP, JPA, JDBC ou DTOs.

Controllers tratam somente HTTP; casos de uso coordenam ações; regras de cálculo, classificação e permissão ficam em serviços/modelos de domínio testáveis; repositórios tratam persistência.

Use DTOs de API, modelos de domínio e entidades de persistência como tipos distintos. Nunca exponha entidade de banco diretamente pela API.

O front-end deve conter interação, apresentação, validação de experiência e chamadas à API. Ele não é autoridade para calcular nota, faixa de resultado, permissões ou estado publicado.

A API deve ser versionada, por exemplo /api/v1. Alterações incompatíveis de contrato exigem versão, migração ou estratégia de compatibilidade documentada.

Quando o schema for autorizado, todo DDL deve ser versionado por migration. A recriação do banco do zero deve produzir o mesmo schema de um banco atualizado.

Use SQL Server para consultas, filtros, agregações e indicadores em massa; evite carregar grandes conjuntos para a JVM apenas para somar, agrupar ou filtrar.

## 4. Regras de negócio e integridade das avaliações

O fluxo inicial é: Rascunho → Enviada pelo gestor → Publicada pelo RH. Alterações após publicação exigem reabertura explicitamente registrada pela Gerência de RH ou Diretoria; não há recurso ou revisão por solicitação do avaliado na primeira versão. Nunca sobrescreva silenciosamente o histórico.

Cada ciclo precisa manter a versão do questionário, competências, pesos e fórmula efetivamente usados. Uma alteração futura não pode recalcular ou reinterpretar uma avaliação histórica sem uma revisão registrada.

A nota final e a classificação devem ser calculadas exclusivamente no back-end a partir de dados persistidos e regras versionadas.

A matriz recebida define as faixas abaixo. Uma configuração de cálculo válida só pode produzir nota final entre 80 e 120. Resultado menor que 80 ou maior que 120 é inválido: não deve ser persistido, classificado, truncado ou ajustado silenciosamente. Rascunho incompleto não possui nota final nem classificação.

| Faixa       | Resultado               | Orientação inicial     |
| ----------- | ----------------------- | ---------------------- |
| 115 a 120   | É referência            | Reter e engajar        |
| 105 a 114,9 | Supera as expectativas  | Manter e impulsionar   |
| 95 a 104,9  | Dentro das expectativas | Acelerar e desenvolver |
| 85 a 94,9   | Em desenvolvimento      | Entender os porquês    |
| 80 a 84,9   | Abaixo do esperado      | Desenvolver            |

A macro de 2024 recebida contém questionários, escala de cinco respostas mapeada para 80/90/100/110/120 e média simples sem pesos; sua extração está documentada em `docs/business/especificacao-macro-avaliacao-2024.md`. Permanecem pendentes a aprovação e versão de negócio, precisão/arredondamento, a conciliação da fórmula de classificação conflitante da aba de análise, obrigatoriedades e o fluxo/efeito da autoavaliação. Não copie defeitos ou fixe essas lacunas no código sem decisão registrada.

Acesso a uma avaliação deve considerar função e relacionamento: um gestor só pode avaliar e consultar as pessoas autorizadas; RH e administradores possuem escopos explicitamente definidos; o colaborador só pode visualizar o que estiver publicado para ele, se essa visão for aprovada.

Impedir duplicidade de avaliação por colaborador, ciclo e tipo de avaliação conforme a regra a ser formalizada. Operações de criação e publicação devem ser idempotentes quando a API precisar suportar reenvio.

Indicadores agrupados devem respeitar privacidade: filtros muito específicos ou grupos pequenos não podem permitir inferência indevida de resultados individuais. Um indicador agrupado só pode ser exibido ou exportado quando, após todos os filtros, reunir ao menos cinco colaboradores distintos. Abaixo desse limite, não retornar média, total, faixa, gráfico ou contagem que permita dedução por diferença; responder apenas que não há dados suficientes para preservar a confidencialidade.

## 5. Segurança por padrão

Adote a OWASP ASVS como referência de requisitos e verificação. Segurança é critério de aceite, não uma etapa posterior.

Configure a autorização como negação por padrão. Toda rota, caso de uso e acesso a recurso individual deve exigir permissão explícita e validar o escopo no servidor em cada requisição.

Use Spring Security para autenticação, autorização e proteções contra ataques comuns. Nunca confie em papel, filial, área, colaborador ou nota enviados pelo cliente.

Senhas devem ser armazenadas com hash adaptativo forte, preferencialmente Argon2id; BCrypt é aceitável quando houver restrição técnica documentada. Nunca use criptografia reversível ou texto puro para senhas.

Autenticação inicial: JWT de acesso curto, emitido com claims mínimas e sem dados pessoais ou de avaliação. Validar assinatura, algoritmo permitido, iss, aud, sub, exp, nbf e jti antes de autorizar.

Para SPA servida no mesmo domínio da API, usar cookies HttpOnly, Secure e SameSite para credenciais; não armazenar JWT em localStorage ou sessionStorage. Operações que alteram estado devem ter proteção CSRF compatível com essa escolha.

Renovação de sessão deve usar token de renovação rotativo e revogável, persistido de forma segura. Logout, bloqueio de conta, alteração de senha e desligamento de usuário devem invalidar sessões aplicáveis.

Limitar tentativas de login, aplicar atraso/bloqueio temporário contra força bruta e responder erros de autenticação sem revelar se um usuário existe.

Restringir CORS ao(s) endereço(s) autorizados, aplicar headers HTTP de segurança, TLS/HTTPS quando houver acesso pela rede e limites para corpo, paginação, taxa de chamadas e uploads.

Validar e normalizar toda entrada. Usar consultas parametrizadas/JPA seguro; nunca concatenar entrada externa em SQL, URL, HTML, logs ou comandos de sistema.

Não retornar stack traces, detalhes internos, nomes de tabelas ou segredos para o navegador. Registrar detalhes técnicos apenas em logs protegidos.

Segredos e configuração de produção ficam fora do Git e do código. O SQL Server deve usar usuário específico da aplicação, com mínimo privilégio e sem utilizar sa.

Dados de avaliações são dados pessoais. Aplicar minimização, controle de acesso, trilha de auditoria e revisão com RH/encarregado de dados conforme a LGPD. Avaliações e históricos permanecem no banco enquanto não houver decisão posterior formal de descarte; não executar exclusão, anonimização ou arquivamento automático.

### 5.1 Checklist de proteção de dados, API e operação

Este checklist é obrigatório para alterações e para qualquer liberação. Marcar um controle como implementado exige evidência executada; uma intenção ou configuração de desenvolvimento não é evidência de produção.

- **Chaves, segredos e Git:** nunca enviar API keys, tokens, senhas, certificados, keystores, arquivos `.env` reais ou URLs de banco com credencial para o repositório, logs, respostas ou testes. Usar configuração externa e scanner de segredos antes de commit. Arquivos `.env`/`.env.local` são permitidos somente na máquina local e permanecem ignorados; o modelo versionado é `.env.example`, sem segredo. No front-end, toda variável `VITE_*` é pública no bundle e só pode conter dados públicos como a base da API. O back-end não deve depender de um `.env` exposto: segredos vêm de configuração externa protegida ou do ambiente do processo. Se um segredo for encontrado em um commit já publicado, interromper a exposição, revogar/rotacionar o segredo e seguir processo autorizado de saneamento do histórico; apagar o arquivo sozinho não basta. Uma chave pública pode ser distribuída somente quando não concede acesso ao banco ou à API; credenciais e chaves privadas do banco nunca são públicas.
- **Banco, criptografia e RLS:** a conta da aplicação deve ter mínimo privilégio, sem `sa`, sem acesso direto pelo navegador e sem segredo embutido no front-end. Exigir TLS validado entre API e SQL Server; antes de produção, decidir e registrar criptografia em repouso (incluindo backups) e, quando o modelo de ameaça exigir, criptografia de campos com chaves fora do banco. Row-Level Security do SQL Server só pode ser ativada por migration autorizada, com política, testes de isolamento e contexto de sessão controlado pelo servidor; ela complementa, nunca substitui, as verificações RBAC/ABAC da aplicação.
- **Autenticação, cookies e acesso:** autenticação, autorização e decisões de escopo permanecem no servidor. Negar por padrão, validar recurso individual e não confiar em IDs, papéis ou escopo do cliente. Tokens ficam somente em cookies `HttpOnly`, `Secure` e `SameSite` restritivo; não usar `localStorage` ou `sessionStorage`. Senhas usam hash adaptativo forte, nunca texto puro ou criptografia reversível; login, refresh, logout, bloqueio e troca de senha devem revogar sessões aplicáveis.
- **Abuso e automação:** manter rate limit e bloqueio temporário de login; configurar proxy confiável antes de confiar em IP encaminhado. Proteção contra bots/WAF/CDN depende de infraestrutura aprovada (por exemplo, Cloudflare) e deve ser validada antes da exposição pública, sem criar integração externa por padrão.
- **Entrada, persistência e mass assignment:** aceitar apenas DTOs explícitos por operação, validar tipo, tamanho, formato, enumeração e autorização no servidor e rejeitar campos desconhecidos ou não permitidos. Nunca fazer bind direto de JSON a entidade de persistência ou domínio, nem aceitar do cliente estado, permissão, nota, escopo, auditoria ou proprietário. Consultas devem permanecer parametrizadas; não concatenar entrada em SQL, JPQL, URLs, HTML ou comandos.
- **Minimização de resposta e conteúdo:** retornar somente projeções/DTOs necessárias à tela, paginar coleções, limitar tamanho de corpo e nunca vazar stack trace, segredo, token, nome interno de tabela, comentário integral, avaliação individual ou dado pessoal fora do escopo. Indicadores continuam sujeitos à supressão de privacidade já definida.
- **Uploads:** não há upload de arquivo autorizado nesta versão. Qualquer futuro upload precisa de tipo e tamanho em allowlist no servidor, armazenamento fora do webroot, nome gerado pelo servidor, verificação antimalware quando aplicável, autorização por recurso e limite de taxa; nunca confiar em extensão, MIME enviado pelo navegador ou caminho informado pelo usuário.
- **Transporte e headers:** forçar HTTPS em toda exposição de rede, redirecionar HTTP somente no proxy aprovado e não usar `trustServerCertificate=true` em produção. Manter HSTS, CSP, `X-Content-Type-Options`, política de referrer, proteção contra framing, CORS de allowlist e CSRF nas escritas; validar esses cabeçalhos no ambiente de destino.
- **Dependências:** executar scanner de segredos, auditoria de dependências JavaScript e verificação de dependências Java/SBOM no gate de qualidade. Vulnerabilidades críticas/altas devem ser avaliadas antes de liberar; nunca atualizar ou remover uma dependência de segurança sem testes de regressão e compatibilidade.

## 6. Qualidade de código, testes e acessibilidade

Escreva nomes claros, funções pequenas e coesas, duplicação controlada e comentários apenas para decisões ou consequências não óbvias. Evite utils globais, service locator, abstrações sem consumidor real e classes de serviço gigantes.

Mantenha regras críticas em código de domínio puro e cubra cálculo, limites de faixa, versões, transições de estado, idempotência e autorização com testes unitários.

Testes de integração devem cobrir migrations, SQL Server, repositórios, autenticação, autorização, contratos da API e falhas. Testes de interface devem cobrir fluxos principais em desktop e celular.

Não persiga percentual de cobertura sem valor; cobertura de regras críticas, bordas, falhas, reexecução e regressões é obrigatória.

Antes de concluir uma alteração, execute as validações existentes: build, testes, formatter/lint, análise estática, scanner de segredos, vulnerabilidades de dependências e verificação de migration/schema quando aplicável. Registre qualquer lacuna no states.md.

O front-end deve ser responsivo e acessível: HTML semântico, navegação por teclado, foco visível, rótulos e mensagens de erro associados aos campos, contraste adequado e nenhuma informação transmitida apenas por cor. Meta: WCAG 2.2 AA.

## 7. Banco, operação e observabilidade

O banco é Microsoft SQL Server. Não criar schema, login, job, backup, usuário, tabela ou migration fora de ambiente autorizado.

Usar migrations versionadas, restrições de integridade, índices justificados, chaves estrangeiras e transações nas operações que exigirem atomicidade.

Não fazer DELETE físico de histórico de avaliação. Avaliações e históricos permanecem no banco até decisão posterior formal; qualquer descarte futuro deve ter política aprovada, procedimento auditável e recuperação avaliada. Preferir status, versionamento e auditoria.

A aplicação será executada diretamente na VM. A escolha de sistema operacional, serviço de inicialização, proxy reverso e certificado deve ser documentada antes do deploy; não presuma IIS, Nginx ou Windows Service sem confirmação.

Separar configuração de desenvolvimento, teste e produção. Nunca reutilizar dados produtivos ou credenciais reais em testes.

Registrar auditoria de login, falha de acesso, criação, edição, envio, publicação, reabertura, exportação e operações administrativas, com usuário, horário, ação e recurso. Não registrar senha, token, comentário integral de avaliação ou dado sensível desnecessário.

Manter logs estruturados, correlação por requisição e monitoramento básico de disponibilidade, erros, latência, tentativas de login e falhas de autorização. Logs e backups devem ter acesso restrito e restauração testada.

## 8. Entrega e sincronização de estado

Uma mudança só pode ser marcada como concluída quando houver evidência executada e registrada: testes, validação de contrato, migration, revisão, implantação ou aceite de negócio, conforme aplicável.

Mudanças arquiteturais relevantes exigem ADR em docs/adr/; regras de negócio exigem origem, exemplo, testes afetados e responsável conhecido ou pendente.

Antes de iniciar implementação, leia a seção **Tarefas pendentes** de `STATES.md` e trabalhe somente dentro de uma tarefa existente ou acrescente uma nova tarefa claramente delimitada.

Ao finalizar, revise diff, encoding UTF-8, dados sensíveis, contratos, migrações, acessibilidade, rollback e documentação. Não alegue teste, revisão humana, conformidade legal ou deploy sem evidência.

# ADR-0018 — RLS não aplicável à topologia inicial

- **Status:** Aceita para a versão inicial.
- **Data:** 2026-08-29
- **Origem:** Revisão de ameaça da persistência SQL Server e requisito de registrar a aplicabilidade de Row-Level Security.

## Contexto

A versão inicial possui uma única API como consumidora dos dados de avaliações. Usuários do produto não recebem conexão, identidade ou credencial de banco; todas as requisições passam pela autenticação, RBAC/ABAC, validação de vínculo e escopo de recurso no servidor. A API usa uma identidade SQL dedicada e comum ao processo, com privilégios mínimos.

RLS nessa topologia exigiria transportar o ator e o escopo para `SESSION_CONTEXT` em toda aquisição de conexão do pool, torná-los imutáveis durante a operação e limpá-los antes de reutilizar a conexão. Um contexto ausente ou residual poderia negar consultas legítimas ou, no pior caso, associá-las ao ator anterior. Como a mesma credencial técnica poderia definir esse contexto, RLS não protegeria contra comprometimento dessa credencial nem substituiria a autorização da aplicação.

## Decisão

- Não ativar Row-Level Security na versão inicial.
- Manter negação por padrão, autorização no caso de uso e consultas parametrizadas já limitadas pelo escopo do ator e do recurso.
- Manter a conta SQL sem `sysadmin`, papéis de servidor/banco, DDL, `CONTROL`, `ALTER` ou acesso a outros bancos; `DELETE` permanece restrito aos dois objetos administrativos autorizados.
- Não criar `SECURITY POLICY`, predicado ou `SESSION_CONTEXT` sem nova ADR, migration autorizada e testes de isolamento com pool de conexões.
- Reavaliar RLS se surgir acesso direto ao banco, outro consumidor, conta de relatórios, múltiplos serviços, segregação por tenant ou um mecanismo de contexto controlado que acrescente defesa real ao modelo de ameaça.

## Consequências

- RLS fica formalmente classificada como não aplicável, e não como controle implementado.
- Qualquer consulta nova continua obrigada a validar autorização no servidor e limitar o SQL ao escopo aprovado.
- Testes de autorização, tentativa indevida e reutilização de conexão permanecem critérios de regressão.
- A decisão não resolve firewall, criptografia em repouso, backup, retenção, WAF ou proteção do segredo da identidade SQL; esses controles continuam operacionais.

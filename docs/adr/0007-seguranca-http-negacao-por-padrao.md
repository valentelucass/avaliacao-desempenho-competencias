# ADR-0007 — Segurança HTTP com negação por padrão antes da identidade persistida

- **Status:** Aceita para a fundação de segurança
- **Data:** 2026-08-25
- **Origem:** Execução autorizada da tarefa ADC-007 pelo usuário.

## Contexto

O projeto precisa de segurança desde o início, mas não possui banco autorizado, usuário real, credencial, chave de assinatura, sessão persistida nem matriz final de permissões e escopos. Liberar rotas temporárias, autenticação em memória ou uma conta de demonstração criaria uma superfície de acesso que não representa a regra de negócio e poderia ser reutilizada indevidamente.

## Decisão

- Adotar Spring Security com negação por padrão para todas as requisições.
- Permitir somente o preflight `OPTIONS` sob `/api/**` quando a origem CORS estiver explicitamente configurada; nenhuma operação de negócio fica pública.
- Manter CSRF, CORS estrito, cabeçalhos HTTP defensivos, erros Problem Details sem detalhes internos e correlação por requisição.
- Desabilitar autenticação Basic, formulário padrão, logout padrão, cache de requisição e criação de sessão pelo servidor.
- Registrar a regra de continuidade do administrador supremo em domínio Java puro e testável, sem criar conta ou mecanismo de recuperação real.
- Usar BCrypt com custo 12 somente como hash adaptativo da fundação. Antes de credenciais reais, reavaliar Argon2id com um provedor criptográfico gerenciado ou documentar a continuidade de BCrypt.

## Consequências

- A API pode iniciar e ser testada, mas não atende nenhuma operação funcional até que a identidade persistida seja implementada.
- Não há login, JWT, refresh token, revogação, RBAC/ABAC efetivo, rate limit real ou auditoria durável nesta decisão. Esses componentes exigem persistência, configuração fora do Git e as pendências de acesso.
- Um endpoint de saúde, se necessário para operação, será definido separadamente na ADC-012 com uma política de exposição mínima.
- Ao implementar as rotas, cada caso de uso deverá autorizar a conta e o escopo de recurso no servidor; autenticar não concede acesso por si só.

## Atualização posterior em 2026-08-25

A identidade persistida, sessão/JWT, RBAC/ABAC, auditoria e limites locais foram implementados posteriormente sob a ADR-0012. O banco local dedicado foi reconciliado de `V0001` a `V0007` e recebeu uma conta técnica de desenvolvimento protegida, sem escopo de negócio. O launcher `iniciar-dev.bat` ativa esses módulos somente em loopback HTTPS com material de execução efêmero; a inicialização API/SPA/proxy foi verificada com CSRF `200` e rota protegida `401`, enquanto login interativo e navegador continuam pendentes.

## Estado atual — 2026-08-27

O parágrafo anterior é histórico. A evidência mais recente registra `V0001`–`V0010` reconciliadas em `AVALIACAO_DEV` e `AVALIACAO_PROD`, hosts públicos com resposta anônima `200` e processos PM2 online. A `V0011` está em fonte e aguarda aplicação autorizada. Isso não substitui validação autenticada, teste de escrita em produção, aceite de negócio ou certificação de segurança do proxy/Tunnel.

## Referências

- [Fundação de segurança HTTP](../security/fundacao-seguranca-http.md)
- [Contrato HTTP v1](../api/contrato-http-v1.md)
- [Modelo relacional lógico](../architecture/modelo-relacional-logico.md)
- [ADR-0003 — Gestão local de identidade](0003-gestao-local-de-identidade.md)

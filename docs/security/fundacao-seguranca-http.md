# Fundação de segurança HTTP

| Campo  | Valor                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------- |
| Status | Implementada no código-fonte e coberta por testes; desabilitada por padrão até ativação autorizada. |
| Origem | ADC-007, `AGENTS.md`, ADR-0003, ADR-0007, ADR-0009, ADR-0011 e ADR-0012.                            |
| Escopo | HTTP, autenticação local, sessão, autorização, auditoria e limites locais.                          |

## Estado seguro de inicialização

`application.properties` mantém persistência SQL Server, autenticação e módulos persistidos desabilitados. Assim, iniciar o repositório sem configuração externa não cria conexão, conta, sessão, JWT ou rota de negócio operacional. Em 2026-08-26, os bancos canônicos `AVALIACAO_DEV` e `AVALIACAO_PROD` estavam reconciliados de `V0001` a `V0010`; a `V0011` está em fonte, restringe a autoridade de Administrador e normaliza contas administrativas legadas para perfil único, mas ainda depende de aplicação autorizada. O launcher `iniciar-dev.bat` fornece a configuração necessária somente ao processo local de desenvolvimento.

Ativar a implementação em outro ambiente exige migrations autorizadas, identidade SQL de mínimo privilégio, segredo HMAC externo, emissor/audiência/durações, bootstrap controlado de administradores supremos e validação não produtiva. O modo local usa a identidade Windows atual e material efêmero de execução; isso está detalhado em [Configuração externa da aplicação](../operations/configuracao-externa-da-aplicacao.md) e não autoriza publicação ou configuração de produção.

## Controles implementados no código-fonte

- Spring Security aplica negação por padrão, CORS com origens explícitas, CSRF, cabeçalhos defensivos, respostas `application/problem+json` e correlação por `X-Request-Id`.
- A sessão local expõe CSRF, login, refresh rotativo, logout, consulta do usuário atual e troca de senha. Credenciais ficam apenas em cookies host-only `HttpOnly`, `Secure`, `SameSite=Strict`; nunca em `localStorage` ou `sessionStorage`.
- O JWT de acesso curto HS256 contém somente `iss`, `aud`, `sub`, `exp`, `nbf`, `jti` e `sid`. Cada chamada revalida assinatura, algoritmo, claims, sessão, situação da conta e permissões efetivas no banco.
- Refresh tokens são opacos, rotativos e persistidos apenas por hash. Logout, alteração de senha, bloqueio, desativação ou mudança de acesso revogam as sessões aplicáveis.
- BCrypt com custo 12 protege senhas locais. Argon2id permanece uma evolução possível, mas requer ADR, dependência gerenciada e validação operacional antes de uso.
- Escritas administrativas, avaliações, indicadores e exportações passam por autorização no servidor, escopo por recurso, transação e auditoria durável. Consultas de indicadores têm limite local em memória; login aplica limite e bloqueio temporário.

## Segregação de acesso

O Administrador de plataforma não é autoridade para publicar/reabrir avaliações, consultar indicadores ou exportar. Essas ações exigem Gerência de RH ou Diretoria, além de permissão, escopo e estado válidos. A API normal não cria, promove ou altera administrador supremo. Além disso:

- uma conta não pode substituir a própria configuração de acesso;
- o perfil administrativo é exatamente um de `ADMINISTRADOR_PLATAFORMA`, `GESTOR`, `GERENCIA_RH`, `DIRETORIA` ou `COLABORADOR`;
- a API rejeita permissões individuais e papéis fora desse catálogo no fluxo administrativo;
- perfil de negócio exige outro alvo e `ACESSOS.NEGOCIO.GERIR`; no catálogo atual, Administrador, Gerência de RH e Diretoria podem receber essa permissão para provisionamento controlado, sem que isso lhes conceda automaticamente as decisões restritas;
- a alteração de acesso preserva a trilha auditável e invalida a sessão do alvo.

Essas regras evitam que `ACESSOS.GERIR` seja usado para autoelevação ou para obter indiretamente o escopo de negócio.

## Limites que ainda exigem ativação e aceite

- As migrations `V0001`–`V0010` foram validadas por leitura em `AVALIACAO_DEV` e `AVALIACAO_PROD`; a `V0011`, que normaliza os papéis legados de contas administrativas, está pendente de aplicação autorizada. O catálogo inicial existe, mas não há ciclos, lotações, vínculos, atribuições ou avaliações. Identidades de bootstrap permanecem protegidas e seus dados não são documentados.
- A verificação anônima mais recente do front-end e de CSRF público retornou `200`, e os processos PM2 estavam online. Ainda não há validação autenticada de ponta a ponta, teste de escrita em produção, aceite de negócio ou certificação de controles no proxy/Tunnel.
- O rate limit vê o endereço remoto da aplicação até a configuração e o teste de proxy confiável atrás do Cloudflare Tunnel. O limiter de indicadores é local à instância.
- ASVS/LGPD, TLS/túnel, backup/restauração, monitoração, retenção de logs/sessões e recuperação operacional de administradores supremos requerem aceite e validação operacional.

## Evidência técnica

Os testes cobrem configuração HTTP, sessão/JWT, autorização e escopo, segregação de acesso administrativo, cálculo/classificação, transições de avaliação, privacidade de indicadores e contratos de controllers. A suíte Maven e o gate de qualidade registrado no [STATES.md](../../STATES.md) são a evidência executada desta fonte; eles não substituem a validação de integração SQL Server ou o aceite de produção.

# Fundação de segurança HTTP

| Campo  | Valor                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------- |
| Status | Implementada no código-fonte e coberta por testes; desabilitada por padrão até ativação autorizada. |
| Origem | ADC-007, `AGENTS.md`, ADR-0003, ADR-0007, ADR-0009, ADR-0011 e ADR-0012.                            |
| Escopo | HTTP, autenticação local, sessão, autorização, auditoria e limites locais.                          |

## Estado seguro de inicialização

`application.properties` mantém persistência SQL Server, autenticação e módulos persistidos desabilitados. Assim, iniciar o repositório sem configuração externa não cria conexão, conta, sessão, JWT ou rota de negócio operacional. O banco local dedicado está reconciliado de `V0001` a `V0007`; o launcher `iniciar-dev.bat` fornece a configuração necessária somente ao processo local de desenvolvimento.

Ativar a implementação em outro ambiente exige migrations autorizadas, identidade SQL de mínimo privilégio, segredo HMAC externo, emissor/audiência/durações, bootstrap controlado de administradores supremos e validação não produtiva. O modo local usa a identidade Windows atual e material efêmero de execução; isso está detalhado em [Configuração externa da aplicação](../operations/configuracao-externa-da-aplicacao.md) e não autoriza publicação ou configuração de produção.

## Controles implementados no código-fonte

- Spring Security aplica negação por padrão, CORS com origens explícitas, CSRF, cabeçalhos defensivos, respostas `application/problem+json` e correlação por `X-Request-Id`.
- A sessão local expõe CSRF, login, refresh rotativo, logout, consulta do usuário atual e troca de senha. Credenciais ficam apenas em cookies host-only `HttpOnly`, `Secure`, `SameSite=Strict`; nunca em `localStorage` ou `sessionStorage`.
- O JWT de acesso curto HS256 contém somente `iss`, `aud`, `sub`, `exp`, `nbf`, `jti` e `sid`. Cada chamada revalida assinatura, algoritmo, claims, sessão, situação da conta e permissões efetivas no banco.
- Refresh tokens são opacos, rotativos e persistidos apenas por hash. Logout, alteração de senha, bloqueio, desativação ou mudança de acesso revogam as sessões aplicáveis.
- BCrypt com custo 12 protege senhas locais. Argon2id permanece uma evolução possível, mas requer ADR, dependência gerenciada e validação operacional antes de uso.
- Escritas administrativas, avaliações, indicadores e exportações passam por autorização no servidor, escopo por recurso, transação e auditoria durável. Consultas de indicadores têm limite local em memória; login aplica limite e bloqueio temporário.

## Segregação de acesso

O administrador de plataforma não herda acesso a avaliações, indicadores ou exportações. A API normal não cria, promove ou altera administrador supremo. Além disso:

- uma conta não pode substituir a própria configuração de acesso;
- uma conta somente técnica pode conceder somente acesso técnico;
- papel ou permissão de negócio exigem outro alvo e ator já pertencente à Gerência de RH ou Diretoria, com `ACESSOS.NEGOCIO.GERIR`;
- a alteração de acesso preserva concessões revogadas para trilha e invalida a sessão do alvo.

Essas regras evitam que `ACESSOS.GERIR` seja usado para autoelevação ou para obter indiretamente o escopo de negócio.

## Limites que ainda exigem ativação e aceite

- Foi criada somente uma conta local técnica de desenvolvimento, protegida como administrador supremo, com troca de senha inicial obrigatória e sem escopo de negócio. Nenhum vínculo, dado de negócio, segredo persistente, conta SQL dedicada ou configuração externa de produção foi criado.
- As migrations `V0001`–`V0007` foram validadas no banco local dedicado, e a inicialização ativada comprovou API/SPA/proxy com CSRF `200` pelo front-end e rota protegida `401`. Ainda não há teste interativo de login, repositórios, autorização por recurso ou navegador contra esse SQL Server.
- O rate limit vê o endereço remoto da aplicação até a configuração e o teste de proxy confiável atrás do Cloudflare Tunnel. O limiter de indicadores é local à instância.
- ASVS/LGPD, TLS/túnel, backup/restauração, monitoração, retenção de logs/sessões e recuperação operacional de administradores supremos requerem aceite e validação operacional.

## Evidência técnica

Os testes cobrem configuração HTTP, sessão/JWT, autorização e escopo, segregação de acesso administrativo, cálculo/classificação, transições de avaliação, privacidade de indicadores e contratos de controllers. A suíte Maven e o gate de qualidade registrado no [STATES.md](../../STATES.md) são a evidência executada desta fonte; eles não substituem a validação de integração SQL Server ou o aceite de produção.

# ADR-0012 — Autenticação local e módulos persistidos por configuração externa

| Campo     | Valor                                                                                 |
| --------- | ------------------------------------------------------------------------------------- |
| Status    | Aceita em 2026-08-25.                                                                 |
| Decisores | Implementação sob as regras de `AGENTS.md`, ADR-0003, ADR-0008 e ADR-0011.            |
| Escopo    | ADC-007 a ADC-011: persistência JDBC, sessão local, autorização e módulos funcionais. |

## Contexto

No momento desta decisão, o banco dedicado possuía somente as migrations `V0001` a `V0004` aplicadas e não continha usuários, credenciais, vínculos ou avaliações. A aplicação precisa ser segura se for iniciada antes da configuração operacional e não pode carregar URL SQL, senha de banco ou material criptográfico do repositório.

As regras de produto já definem usuários locais, RBAC com negação por padrão, limite de tentativas, sessão revogável, avaliações calculadas no servidor e indicadores agregados protegidos. Elas não autorizam criar uma conta, aplicar uma migration, publicar um processo ou configurar infraestrutura externa.

## Decisão

- A persistência SQL Server usa JDBC parametrizado e transações, ativada somente por `app.persistence.sqlserver.enabled=true` com configuração externa completa.
- A autenticação local emite JWT HS256 curto com `iss`, `aud`, `sub`, `exp`, `nbf`, `jti` e `sid` mínimos. O JWT permanece em cookie `HttpOnly`, `Secure`, `SameSite=Strict`; o token de renovação é opaco, rotativo e armazenado apenas por hash.
- Cada chamada protegida revalida assinatura, claims, sessão revogável, situação da conta e permissões efetivas no banco. Uma alteração de acesso, senha, bloqueio ou logout invalida sessões aplicáveis.
- O CSRF continua separado da credencial. A SPA mantém o token técnico somente em memória e nunca usa `localStorage` ou `sessionStorage` para credenciais.
- Administração normal cria contas locais com senha inicial marcada para troca, mas não promove nem altera administrador supremo. Esse fluxo permanece fora da API normal até existir o processo de dois participantes definido na ADR-0003.
- Administração de acesso separa capacidade técnica e de negócio: o alvo nunca é o próprio ator; conta somente técnica não concede papel/permissão de negócio; essa concessão exige RH/Diretoria e `ACESSOS.NEGOCIO.GERIR`.
- Leitura de ciclos, avaliações e indicadores são recursos condicionais: a aplicação não os registra nem consulta schema enquanto a configuração externa correspondente estiver desabilitada ou as migrations obrigatórias não estiverem presentes.
- Publicação e reabertura são decisões administrativas permitidas após o encerramento; uma reabertura registrada libera somente o rascunho do gestor autor para correção/reenvio, sem reabrir ciclo, autoavaliação ou criação.

## Atualização operacional em 2026-08-25

O banco local dedicado foi posteriormente reconciliado de `V0001` a `V0007`, após aplicação autorizada e validações do runner. Foi criada uma única conta local de desenvolvimento protegida como administrador supremo, com papel técnico `ADMINISTRADOR_PLATAFORMA`, troca de senha inicial obrigatória e auditoria; ela não possui escopo de negócio e seus dados de identificação e credencial não são registrados nesta ADR.

`iniciar-dev.bat` concentra a ativação local em HTTPS de loopback, com proxy Vite de mesmo domínio, autenticação integrada Windows ao SQL Server e segredos/PFX de execução efêmeros. Não há configuração pública ou de produção. A inicialização ativada foi verificada com API/SPA/proxy, CSRF `200` pelo front-end e rota protegida `401`; o login interativo e o navegador ainda requerem validação.

## Consequências

- A inicialização padrão continua segura e indisponível para operações de negócio até a configuração autorizada estar completa.
- A identidade de mínimo privilégio para produção, a chave criptográfica persistente, o bootstrap de dois administradores supremos para produção, proxy confiável atrás do Tunnel, backups e a publicação continuam procedimentos externos e auditáveis. A identidade Windows e os segredos efêmeros usados no launcher local não os substituem.
- A autenticação usa BCrypt com custo 12 por compatibilidade já validada. A eventual mudança para Argon2id requer ADR, dependência controlada, migração de credenciais e validação de operação antes de uso.
- Testes unitários cobrem cálculo, autorização, sessão e contratos. A validação de repositório contra SQL Server autorizado permanece obrigatória antes de liberação.

## Estado atual — 2026-08-27

O bloco de atualização de 2026-08-25 preserva o contexto daquela data. A evidência operacional mais recente registra `V0001`–`V0010` reconciliadas em `AVALIACAO_DEV` e `AVALIACAO_PROD`, hosts públicos com resposta anônima `200` e PM2 online. A `V0011` está em fonte e aguarda aplicação autorizada. Ainda faltam teste autenticado de ponta a ponta, validação por recurso em produção, backup/restauração e aceite de negócio; nenhuma dessas conclusões decorre da mera disponibilidade observada.

# Regras iniciais de acesso, fluxo, cadastros e retenção

## Registro

| Campo                   | Valor                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origem                  | Resposta do gestor encaminhada pelo usuário em 2026-08-25.                                                                                                                                                                                                                                                                                        |
| Status                  | Regras iniciais complementadas pela [Regra operacional 2024.1](regras-operacionais-v1.md). A fonte implementa autenticação, autorização, exportação agregada e auditoria; em 2026-08-26, `AVALIACAO_DEV` e `AVALIACAO_PROD` reconciliaram `V0001`–`V0010`, os hosts responderam `200` anonimamente e PM2 estava online. A `V0011` permanece pendente de aplicação autorizada. Isso não equivale a login autenticado, aceite de negócio ou uso de dados reais. |
| Responsáveis conhecidos | Usuário solicitante para a decisão v1; Gerência de RH e Diretoria para a operação futura de publicação, consulta e exportação.                                                                                                                                                                                                                    |
| Testes afetados         | Autorização por papel e escopo, lista de gestores autorizados, transições de estado, autoavaliação, bloqueio de recurso, cadastro, exportação e retenção.                                                                                                                                                                                         |

## Acesso e fluxo confirmados

| Ação                                                | Regra recebida                                                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criar usuários e definir perfil                     | Administrador para perfil técnico; Gerência de RH ou Diretoria para perfil de negócio, conforme a segregação do contrato HTTP. Cada conta recebe exatamente um perfil e não há permissões individuais. |
| Realizar avaliação de gestor                        | Exclusivamente gestores autorizados na plataforma. Analistas, assistentes e auxiliares não recebem essa permissão.                                                         |
| Publicar, reabrir e visualizar avaliações completas | Gerência de RH e Diretoria.                                                                                                                                                |
| Autoavaliação                                       | Existirá na primeira versão.                                                                                                                                               |
| Recurso ou revisão por solicitação do avaliado      | Não existirá. A reabertura é uma ação administrativa da Gerência de RH ou Diretoria, não um recurso.                                                                       |
| Indicadores e dados consolidados                    | Gerência de RH e Diretoria podem visualizar e exportar. Indicadores agrupados só aparecem ou são exportados quando o filtro reunir ao menos cinco colaboradores distintos. |
| Acesso de gestores a indicadores e dados            | Restrito aos dados das respostas que o próprio gestor registrou; não há autorização para exportação, comparativos globais ou dados de outros gestores.                     |

A lista de usuários que serão gestores autorizados será criada administrativamente no sistema; nenhuma pessoa é importada da macro. A autorização é decidida por conta autenticada, papel explícito e vínculo gestor–colaborador ativo; o texto digitado no campo “Gestor” não concede acesso por si só.

Administrar usuários também não concede autoridade para publicar/reabrir avaliações, consultar indicadores ou exportar. Essas ações exigem Gerência de RH ou Diretoria, além de permissão e escopo válidos. O fluxo administrativo aceita apenas os perfis Administrador, Gestor, Gerência de RH, Diretoria e Colaborador, exatamente um por conta e sem permissões individuais.

## Cadastros e ciclo

- Os campos de colaborador e gestor serão de texto livre.
- Áreas e filiais serão opções restritas a uma tabela que ainda será enviada.
- As avaliações ocorrerão anualmente, no período de 1º a 15 de setembro.

O texto livre atende ao cadastro operacional, mas não substitui a vinculação segura entre uma conta de gestor autorizada e suas ações no sistema.

O intervalo anual é de 1º de setembro às 00:00 até 16 de setembro às 00:00, início inclusivo e fim exclusivo, no fuso `America/Sao_Paulo`. Cada ciclo persiste a própria janela antes de abrir.

## Retenção e extração

Por decisão explícita posterior do usuário, avaliações e históricos permanecem no banco de dados. Não haverá prazo de dois meses, exclusão, anonimização ou arquivamento automático. Um eventual descarte futuro exigirá nova decisão formal, procedimento auditável e avaliação de recuperação.

A extração geral continua reservada à Gerência de RH e à Diretoria. A implementação fonte gera CSV UTF-8 sob demanda no navegador autenticado, contendo somente o agregado já permitido; não há exportação automática, e-mail, integração externa ou dados individuais.

Para preservar a confidencialidade, qualquer indicador agrupado deve ser avaliado depois de todos os filtros aplicados. Se restarem menos de cinco colaboradores distintos, o sistema não exibirá nem exportará média, total, faixa, gráfico ou contagem; retornará somente “dados insuficientes para preservar a confidencialidade”.

## Decisões v1 complementares

A [Regra operacional 2024.1](regras-operacionais-v1.md) define vínculo único ativo por colaborador, visibilidade por ator, autoavaliação independente sem efeito na nota, publicação/reabertura auditadas, catálogo `2024.1` de áreas/filiais, métricas agregadas, filtros limitados, exportação CSV agregada e proteção contra inferência por diferença.

Continuam fora desta decisão a criação de pessoas reais, o provisionamento de produção de credenciais/segredos, a política formal de retenção de logs e backups e qualquer descarte futuro. Sessão e auditoria já existem no código-fonte; o launcher de desenvolvimento local as ativa de forma controlada e validou API/SPA/proxy, enquanto login interativo e navegador permanecem pendentes.

## Exemplos de comportamento esperado

1. Um gestor presente na lista autorizada pode iniciar e enviar a avaliação permitida para ele; um analista, assistente ou auxiliar recebe acesso negado para essa mesma ação.
2. A Gerência de RH ou a Diretoria pode publicar ou reabrir uma avaliação; a operação registra quem a realizou, quando e o motivo quando este for definido.
3. Um gestor consulta somente os dados das respostas que ele registrou e não pode exportar dados consolidados, comparar gestores ou acessar resultados de terceiros.
4. Uma autoavaliação só é disponibilizada para colaborador com conta vinculada, quando o ciclo a habilitar; não altera a nota de gestor e não é visível ao gestor.
5. Um indicador filtrado para menos de cinco colaboradores distintos não devolve números ou gráficos; a Gerência de RH e a Diretoria recebem apenas a mensagem de dados insuficientes.

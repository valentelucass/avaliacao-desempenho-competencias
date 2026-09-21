# ADR-0022 — Delegação individual para redefinir senhas

- Data: 2026-09-21.
- Estado: implementada localmente; aplicação da migration, publicação e aceite operacional pendentes.
- Origem: pedido do usuário para permitir que contas específicas de RH, Diretoria ou outros perfis atendam redefinições de senha e, quando autorizado, deleguem essa capacidade.

## Decisão

Substituir a restrição operacional exclusiva ao administrador supremo por duas permissões concedidas diretamente à conta, sem herança por perfil:

- `SENHAS.REDEFINIR`: consultar solicitações pendentes e gerar senha temporária para uma conta elegível;
- `SENHAS.DELEGAR_REDEFINICAO`: conceder ou revogar `SENHAS.REDEFINIR` para outra conta.

O administrador supremo pode atribuir ou remover ambas. Uma conta com as duas permissões pode atribuir ou remover somente `SENHAS.REDEFINIR`; ela nunca concede a permissão de delegar. RH, Diretoria, Gestor e Colaborador não recebem essas permissões por seu perfil. O administrador supremo escolhe explicitamente cada pessoa na área **Contas e concessões**.

O servidor revalida a autorização em cada operação, usa uma rota exclusiva para essas duas capacidades e registra a alteração em auditoria. A concessão ou revogação invalida as sessões do alvo. A alteração normal de perfil preserva as duas permissões de senha, evitando revogação silenciosa por uma edição não relacionada.

Uma conta delegada não pode redefinir ou alterar delegação de uma conta técnica (`ADMINISTRADOR_PLATAFORMA`) nem de uma conta que já pode delegar. A própria conta, contas supremas/protegidas, inativas, excluídas logicamente e bloqueadas continuam fora do fluxo. O administrador supremo continua sujeito à proteção de conta própria e à elegibilidade do alvo.

## Consequências e limites

- A migration V0015 cria apenas as duas entradas do catálogo e registra auditoria; ela não concede a capacidade a nenhuma conta nem perfil existente.
- O pedido público continua com resposta uniforme, CSRF e limite de taxa. A senha temporária continua aleatória, retornada uma única vez com `Cache-Control: no-store`, persistida somente como BCrypt, com troca obrigatória e revogação de sessões.
- Um operador delegado pode atender a fila sem poder editar dados cadastrais da conta. Quem já tem `USUARIOS.ALTERAR` conserva a edição disponível no mesmo diálogo.
- A entrega da senha temporária e a verificação de identidade da pessoa continuam responsabilidade operacional do atendente, por canal seguro.
- A migration não foi aplicada a banco algum nesta tarefa. A validação SQL em banco e a operação de conceder capacidades a pessoas reais dependem da publicação autorizada.

## Verificação

Os testes de domínio cobrem administrador supremo, operador delegado, conta delegadora, autoatendimento e alvos técnicos. Os testes de serviço, HTTP/CSRF, interface e a validação estática da migration estão registrados em `STATES.md` ao final da tarefa.

# ADR-0021 — Recuperação local assistida de senha

- Data: 2026-09-21.
- Estado: implementada localmente em `ADC-COR-024`; publicação pendente.
- Origem: solicitação do usuário para recuperação pelo login, fila em Cadastros/Colaboradores e redefinição no detalhe da conta. Responsável pelo aceite funcional: solicitante; responsável nominal pela operação: pendente.

## Decisão

Reutilizar a identidade local, as sessões revogáveis e a auditoria existentes. A recuperação não envia e-mail nem cria integração ou tabela. A decisão de autoridade descrita originalmente nesta ADR foi substituída pela [ADR-0022](0022-delegacao-individual-de-redefinicao-de-senha.md): a V0015 cria permissões individuais de redefinição e de delegação, sem concessão automática por perfil. Permanecem proibidos a redefinição da própria conta e o atendimento de conta suprema, protegida, inativa ou excluída.

O login oferece uma solicitação anônima protegida por CSRF, com resposta `202` vazia igual para contas elegíveis, ausentes ou indisponíveis. O login é normalizado; entrada vazia, excessiva ou com campos extras é recusada. Limites em memória por instância: três pedidos por login/hora, dez por endereço remoto/hora e mil globalmente/hora. As chaves individuais são hashes; não se confia em headers encaminhados. O endereço visto pelo processo pode representar várias pessoas atrás do proxy: validar proxy confiável e capacidade antes da publicação, sem configurar infraestrutura nesta tarefa.

A fila é uma projeção dos eventos de auditoria existentes. Um pedido elegível grava `AUTENTICACAO.REDEFINICAO_SOLICITAR`, recurso `USUARIO`, UUID do alvo, ator nulo e resultado `SUCESSO`. Não grava login, senha nem token. O último evento relevante por `evento_auditoria_id` define a pendência; `USUARIO.SENHA_REDEFINIR` e `AUTENTICACAO.ALTERAR_SENHA` a encerram. Repetições durante uma pendência não geram outra linha. Uma nova solicitação após o atendimento gera uma nova pendência. Nenhum evento histórico é alterado ou apagado.

Pedido, redefinição, troca e conclusão do login serializam a escrita por conta usando `UPDLOCK/HOLDLOCK` dentro da transação. O contador de auditoria ordena eventos mesmo no mesmo milissegundo. A troca pessoal também compara o hash lido com o hash atual, com collation binária, para não sobrescrever uma redefinição concorrente. Antes de criar uma sessão, o login confirma novamente o hash, a situação da conta e o bloqueio; uma tentativa iniciada antes da alteração de senha não consegue abrir uma sessão depois dela usando a credencial antiga. A fila sobrevive a reinícios e usa paginação por sequência, com limite máximo de cem itens por resposta.

A senha temporária é gerada no servidor com `SecureRandom` (24 bytes, Base64URL, 32 caracteres), diferente em cada redefinição. É devolvida uma vez ao administrador na resposta `no-store`, permanece somente na memória do diálogo e desaparece ao fechá-lo. Persistência somente em BCrypt custo 12. A operação marca troca obrigatória, limpa os contadores e eventual bloqueio já expirado (um bloqueio vigente impede o atendimento), revoga todas as sessões e audita o ato. Não existe senha padrão compartilhada.

Depois de entrar com a senha temporária, o filtro de autenticação retira as autoridades de negócio até a troca. A senha pessoal deve ser diferente da atual, com pelo menos 12 caracteres Unicode, não apenas espaços, e no máximo 72 bytes UTF-8, limite explícito do BCrypt, sem truncamento. A troca revoga as sessões e exige novo login. JWT curto, cookies HttpOnly/Secure/SameSite, CSRF e refresh rotativo existentes permanecem em uso. A justificativa anterior do BCrypt consta na fundação de segurança; não houve troca de algoritmo.

## Consequências e limites

- Confirmar a identidade da pessoa e entregar a credencial por canal seguro são responsabilidades do administrador. A solicitação não comprova titularidade do e-mail.
- O pedido não muda a senha nem bloqueia a conta. Somente a redefinição autorizada altera a credencial.
- A senha temporária segue o ciclo de credenciais existente: não possui prazo de expiração próprio; deixa de valer na troca ou em outra redefinição. A UI não promete expiração por tempo ou consumo no primeiro login.
- A projeção depende da retenção íntegra da auditoria, já obrigatória no projeto. Mudanças futuras de retenção, arquivamento ou volume exigem revisão da projeção e, se necessário, migration autorizada. Há índice existente por recurso/data; não foi criado índice novo.
- A identidade SQL precisa das leituras de usuários/credenciais/auditoria e das escritas já previstas pelo provisionamento versionado. A validação com identidade produtiva é parte da publicação, não uma evidência desta tarefa.
- Publicar API antes da SPA. Reverter binários não remove os eventos nem desfaz senhas redefinidas; atendimento pendente permanece no banco. Não há rollback destrutivo de dados.

## Verificação e referência

Testes de serviço, contrato Spring/CSRF/autorização, interface, navegador real e SQL DEV com rollback estão registrados em `STATES.md`. Referências consultadas: [OWASP — Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) e [OWASP — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). A implementação não constitui certificação ASVS nem evidência de infraestrutura produtiva.

Revisão ADC-COR-026: reuso da senha atual também é recusado no PUT administrativo legado; objetos com credenciais ocultam `toString` e DTOs rejeitam campos extras. JWT exige os claims temporais presentes. Bloqueio temporário revoga sessões. A SPA oferece troca pessoal voluntária pelo menu, mantendo a troca obrigatória sem cancelamento. Evidências e limites na [revisão de senhas](../security/revisao-senhas-adc-cor-026.md).

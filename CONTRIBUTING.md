# Contribuição

## Antes de alterar

1. Leia [AGENTS.md](AGENTS.md), [STATES.md](STATES.md).
2. Trabalhe apenas em uma tarefa pendente existente ou registre uma tarefa nova e delimitada no `STATES.md`.
3. Não inclua segredos, dados pessoais, avaliações reais, credenciais, arquivos de ambiente ou dados produtivos no repositório.

## Convenções de código

- Mantenha o back-end como monólito modular MVC. Cada módulo terá `api/controller`, `api/dto`, `application/service`, `domain/model`, `domain/port` e `infrastructure/persistence`.
- Controllers tratam apenas HTTP; serviços coordenam casos de uso; modelos de domínio concentram regras; repositórios ficam na infraestrutura.
- O domínio não pode depender de Spring, HTTP, JPA, JDBC, DTOs ou infraestrutura.
- O front-end cuida da experiência e das chamadas HTTP; não calcula notas, classificação ou permissões.
- Use nomes claros, componentes/funções coesos e tipos explícitos nas fronteiras.
- Preserve HTML semântico, foco visível e navegação por teclado.

## Validação obrigatória

Execute `.\scripts\verify-quality.ps1` antes de considerar uma alteração concluída. Ele complementa build, testes e lint com scanner local de segredos, análise estática das migrations, auditoria npm e validação SQL somente leitura. Registre no `STATES.md` a evidência realmente executada, os riscos e as lacunas restantes.

Não faça commit de build, `node_modules`, arquivos de IDE, logs ou arquivos `.env`.

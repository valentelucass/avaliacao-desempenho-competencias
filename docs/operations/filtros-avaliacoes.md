# Filtros da lista de avaliações — ADC-UI-051

Solicitação: quatro filtros combináveis — Nome do Colaborador Avaliado, Nome do Gestor Responsável, Status da Avaliação e Status do Feedback. Aplicados na lista autorizada, sem mudar criação, edição, publicação, concessões, dados ou schema.

## Uso e semântica

Preencha um ou mais campos e use **Aplicar filtros** (ou Enter). **Limpar filtros** zera os quatro campos. A consulta pesquisa todas as páginas autorizadas no servidor, não somente os cartões carregados. Mudança de busca reinicia o cursor e a página; anterior/próxima e atualizar conservam os filtros aplicados. Ao voltar do editor, os quatro valores aplicados reaparecem nos campos. Nomes parcialmente digitados só entram na busca após aplicar. Consultas obsoletas não sobrescrevem respostas mais recentes e não encerram o indicador de carregamento da busca atual.

O gestor é a conta avaliadora registrada na avaliação de equipe/Diretoria, não a chefia atual do cadastro nem quem publicou pelo RH. Autoavaliação não tem gestor avaliador e fica fora dos resultados quando esse filtro é preenchido. Feedback segue a versão atual: não aplicável em autoavaliações/avaliações ainda não publicadas; pendente ou concluído nas avaliações publicadas elegíveis. Não se calcula um novo estado no navegador.

Localização por ciclo/colaborador e pré-visualização administrativa preexistentes foram preservadas; quando usadas, combinam-se com estes filtros. Os cartões de resumo continuam descrevendo a página atual, não um novo indicador global. A pesquisa não consulta catálogo global de gestores/contas e não acrescenta nomes/IDs à projeção retornada.

## Implementação e verificações

Componente `AssessmentListFilters` e CSS local à feature, usando os controles e botões existentes. Grade de quatro, duas ou uma coluna; rótulos associados e foco visível. O contrato v1 foi estendido com quatro parâmetros opcionais; consultas parametrizadas usam `CHARINDEX` e collation insensível a caixa/acentos, dentro dos mesmos predicados de autorização. A paginação continua no SQL. Busca por trecho pode exigir varredura de nomes; não foram criados índices/migrations nem alegado teste de carga.

Vitest cobre combinações, cada status, cursor/reset, limpeza, vazio, retorno do editor, respostas fora de ordem, autenticação e axe automatizado. MockMvc cobre contrato anterior/novo e rejeição genérica de entradas inválidas. Edge monta o painel real com dados fictícios, mede quatro campos em 320/375/768/1024/1440 px nos dois temas, limites, grade e Tab/foco. Capturas em `frontend/dist/assessment-filters-{light,dark}-{375,1440}.png`, ignoradas pelo Git. Uma corrida de tempo no ensaio antigo da cortina foi corrigida: a troca de mídia pode terminar a animação antes da medição; aceita-se cortina já removida ou oculta, mantendo as verificações de ausência final e callback único. Nenhuma alteração no componente de tema.

`AssessmentListReadOnlySqlTests` executa os SQLs e bindings reais do repositório no SQL Server DEV sobre CTEs de sete avaliações fictícias. Substitui somente os nomes de tabelas por CTEs locais à consulta: não lê pessoas/avaliações reais, não cria tabela temporária, schema ou migration e não faz escrita. Verifica combinação, acentos, caracteres SQL literais, três páginas, autor alheio, ausência de permissão, vínculo revogado, ator inexistente, autoavaliação e situações de feedback/avaliação. É opt-in separado do teste histórico de rotação de sessão, que faz escrita e não foi executado nesta tarefa.

Para repetir o ensaio somente leitura: executar no `backend` o Maven com `-Dtest=AssessmentListReadOnlySqlTests -Dadc.dev.sql.readonly=true`, configurando `-DargLine=-Djava.library.path=<diretório da DLL JDBC compatível>`. Usa autenticação integrada local, sem senha, em `localhost:1433/AVALIACAO_DEV`; confiança do certificado é exclusivamente DEV. Não reutilizar essa configuração em produção. Evidências e contagens finais ficam no `STATES.md`.

## Ativação e recuperação

Em 2026-09-08, `ADC-COR-003` confirmou que a API DEV em execução ainda usava o JAR anterior aos filtros: os quatro parâmetros retornavam a mesma página sem filtro, inclusive buscas por nomes inexistentes. O JAR não continha os parâmetros `evaluatedName`/`managerName` no controller. A instância DEV foi recompilada/reiniciada pelo launcher existente, preservando a porta 5080 e a origem do Dev Tunnel já configurada. É necessário entrar novamente após esse reinício. Em publicação autorizada, disponibilizar a API atualizada antes do front-end; cliente anterior continua funcionando com a API nova.

Após iniciar/atualizar o DEV, execute `./scripts/testar-filtros-avaliacoes-dev.ps1` com PowerShell 7. O ensaio confere o processo Java local deste repositório na porta 5181, autentica a conta fictícia RH existente e compara as páginas de dois itens com a projeção SQL do ciclo fictício `DEV-COMPLETO-FLUXOS`. Cobre cada nome completo/parcial, gestor sem autoavaliação, nomes inexistentes, todos os status, os quatro campos combinados, combinação vazia, limpeza e rejeição de enums inválidos com HTTP 422. Os GUIDs são normalizados antes da comparação; o documento JSON fragmentado pelo `sqlcmd` é recomposto sem inserir quebras dentro dos valores.

Esse teste usa somente consultas de avaliações/cadastros e encerra sua própria sessão ao terminar. Login/logout produzem sessões e auditoria normais. Não cria nem restaura massa e não imprime nomes, IDs, respostas ou credenciais. Permanece separado do gate padrão por exigir DEV em execução, massa fictícia e credenciais locais; os testes sobre fontes/CTEs isoladamente não comprovam que o serviço ativo foi atualizado.

Recuperação: reverter apenas os filtros de interface/contrato/consulta desta tarefa, preservando as alterações anteriores. Não há dado gravado, migration ou concessão para desfazer. Aceite visual/assistivo humano, aparelhos físicos e exposição de produção não estão comprovados por testes automatizados.

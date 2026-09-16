# Manutenção de cadastros e importação de vínculos

Origem: pedido do usuário em 16/09/2026, encaminhando pendência do gestor em produção. Implementação local em `ADC-COR-022` e `ADC-IMP-003`; evidências executadas e limites no [STATES.md](../../STATES.md). O usuário pediu definir o modelo consultando documentação e relações existentes, sem fornecer uma planilha nova. Responsável nominal pelo aceite de negócio ainda não registrado.

## Áreas e Colaboradores

Na tela **Cadastros e atribuições**, **Editar** corrige o nome de um registro ativo ou desativado. Preserva ID, situação e referências; não serve para trocar uma pessoa por outra. Consultas históricas que usam o cadastro passam a mostrar o nome corrigido, sem alteração de respostas, notas ou versões.

**Reativar** aparece nos registros desativados e exige confirmação. Mantém o mesmo ID e volta a permitir o uso do registro. No colaborador, os vínculos que ainda estiverem vigentes voltam a poder ser considerados pelas regras de acesso; vínculos encerrados/revogados permanecem encerrados. Reativar o cadastro não cria conta, perfil ou vínculo. Após reativar, conferir novamente a planilha: uma prévia anterior permanece desatualizada.

**Excluir** exige confirmação e só admite registro desativado sem nenhuma referência, inclusive histórica. Áreas com lotações são bloqueadas. Colaboradores com lotação, vínculo de gestor, conta ou Diretoria, atribuição de questionário ou avaliação são bloqueados. A transação usa bloqueios e as FKs continuam protegendo integridade; não há cascata, exclusão de histórico ou remoção de auditoria. Usar reativação para um registro que voltará a ser utilizado.

Todas as operações exigem `CADASTROS.GERIR`, autenticação e CSRF. Nome tem até 200 caracteres e campos extras do DTO são rejeitados. Auditoria registra ator, ação, recurso e correlação; nomes antigos/novos não são copiados para logs. A exclusão pode depender da configuração SQL do ambiente, descrita abaixo.

## Modelo de vínculos gestor–colaborador

Tela **Vínculos → Vínculo gestor-colaborador → Importar Excel**. Há um botão **Baixar modelo de vínculos**, que fornece XLSX vazio sem dados pessoais.

| Coluna | Preenchimento |
| --- | --- |
| Conta avaliadora | Nome de exibição de uma conta ativa de Gestor ou Gerência de RH, exatamente como no seletor da tela. Não é login nem o texto livre de Gestor em Lotações. |
| Colaborador | Nome de um único colaborador ativo já cadastrado. |
| Início | Data válida do Excel ou texto dd/mm/aaaa, sem horário. |

A escolha segue [regras operacionais](../business/regras-operacionais-v1.md), [contrato HTTP](../api/contrato-http-v1.md) e a projeção existente de opções, que retorna somente ID/nome sob a permissão de vínculo. Não exige `USUARIOS.LER`, não revela login e não usa o vínculo conta–colaborador para inferir automaticamente o gestor. Diretoria–Gerência e conta–colaborador continuam nos fluxos individuais existentes.

Exemplo fictício: conta **Gestora Exemplo**, colaborador **Pessoa Exemplo**, início **16/09/2026**. O servidor resolve referências elegíveis; homônimos exigem vínculo individual. Não existe escolha pelo primeiro resultado nem equivalência automática entre nomes diferentes.

As três colunas são obrigatórias, podem estar em qualquer ordem entre A:Z e colunas extras de dados são ignoradas. Fórmulas/macros/links continuam proibidos no arquivo inteiro. Até 1 MB, 1.000 registros, uma aba, prévia de 15 minutos, páginas de 25 linhas e limites existentes por ator/processo.

Um único colaborador por lote. Vínculo não revogado com mesma conta e mesmo início é mantido. Outra conta, outro início, vínculo não revogado ou sobreposição com período histórico bloqueiam a linha. O fim é inclusivo: um vínculo encerrado no dia 16 permite novo início somente a partir do dia 17. A planilha não encerra nem substitui vínculos.

Conferir não grava; confirmar revalida conta/perfil, colaborador e relações sob bloqueios, cria todos os vínculos novos e auditorias na mesma transação. Falha desfaz o lote. Repetir confirmação conserva resultado; reenviar arquivo reconhece vínculos idênticos. Cada vínculo concede escopo de avaliação, sujeito às regras de ciclo, vigência e permissão: revisar a conta escolhida antes de confirmar.

Todas as rotas exigem `VINCULOS_GESTOR_COLABORADOR.GERIR`. Prévia é vinculada também à família de permissão: endpoints de cadastros não podem consultar, confirmar ou descartar prévias de vínculos, nem o inverso, mesmo para o mesmo ator.

## Ativação, permissões SQL e recuperação

Publicar API e SPA compatíveis pelo fluxo existente e em janela de manutenção; o launcher recompila o dist antes de reiniciar a API. Esta implementação não publica nem reinicia os serviços. O relatório de sucesso das importações reais veio do usuário; nenhum registro real foi alterado para corrigir as capturas.

Os scripts produtivos anteriores concedem DELETE apenas em filial e associação de questionário. Edição/reativação usam UPDATE já previsto. Para habilitar exclusão dos dois novos cadastros, revisar e executar, somente com autorização operacional, [004_conceder_delete_cadastros_sem_uso.sql](../../database/production/004_conceder_delete_cadastros_sem_uso.sql), dirigido exclusivamente a `AVALIACAO_PROD` e ao usuário SQL específico existente. Ele concede DELETE somente nos dois objetos, sem criar conta, schema ou remover dados. Não foi executado nesta tarefa. A configuração produtiva corrente não foi recertificada. A API devolve erro seguro `MASTER_DATA_DELETE_UNAVAILABLE` quando essa permissão faltar.

Antes da concessão, registrar os grants preexistentes. Recuperação de permissão: `REVOKE DELETE ON OBJECT::dbo.area FROM [rodogarcia_adc_app]` e equivalente para `dbo.colaborador`, **apenas para grants introduzidos pela operação**. Revogar não recupera um cadastro posteriormente excluído: a exclusão é definitiva e restrita a cadastros sem uso. Não usar exclusão como rollback de importação.

Reversão da candidata: reativar os artefatos anteriores de API/SPA. Edições, reativações e vínculos já confirmados permanecem no banco/auditoria; eventual correção posterior deve usar os fluxos administrativos autorizados, mantendo histórico. Não há migration ou nova dependência.

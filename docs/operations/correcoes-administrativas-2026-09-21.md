# Correções administrativas — ADC-COR-024

Implementação local solicitada em 21/09/2026. Sem publicação, alteração de contas reais, reinício de processos ou DDL. Evidências finais e limitações de validação em `STATES.md`.

## Vínculos

O botão **Encerrar** abre um popup central para os vínculos Gestor–Colaborador, Diretoria–Gerência e Conta–Colaborador. O diálogo mostra o vínculo selecionado, exige data de encerramento igual ou posterior ao início e apresenta erros no próprio popup. Foco inicial na data, contenção do foco, Escape/Cancelar e retorno ao botão são mantidos; durante a escrita, o fechamento fica bloqueado.

O encerramento usa a operação transacional existente, registra fim/revogação e conserva o histórico. O teste SQL cria o vínculo de um avaliador, encerra-o e cria outro avaliador para a mesma pessoa, verificando os dois registros e a auditoria. Não foi alterada a regra de sobreposição de vigências. Para nova vigência sem sobreposição, usar o dia seguinte ao encerramento.

A captura do incidente mostra `409` na rota de coleção, sem corpo/resposta ou requisição de encerramento identificável. O defeito de interação foi comprovado no código: a confirmação ficava abaixo das tabelas. A causa exata daquele `409` produtivo não foi reproduzida; não houve consulta ou alteração do vínculo real fotografado.

## Totalizadores

Os quatro KPIs de Avaliações individuais vêm de `totals` na resposta da API. O SQL agrega todas as avaliações que atendem ao mesmo escopo e aos mesmos filtros da listagem, sem aplicar cursor ou limite da página. Mudar de página mantém os totais quando o conjunto não mudou; aplicar um filtro recalcula os totais do conjunto filtrado. Não há contagem local de cartões como alternativa.

Mantida a regra do `AGENTS.md`: menos de cinco colaboradores distintos após filtros resulta nos quatro campos nulos, exibidos como traços e aviso de confidencialidade. Essas contagens são avaliações, e não pessoas. Agregação e leitura dos itens são consultas separadas: alterações concorrentes podem ser refletidas na atualização seguinte; não é uma fotografia congelada entre navegações.

## Recuperação

No login, **Solicitar redefinição de senha** recebe e-mail/login e confirma genericamente. Em **Administração → Cadastros → Colaboradores**, o administrador supremo autorizado vê a quantidade total de solicitações pendentes e uma tabela com nome, login e data. **Editar e redefinir senha** abre o atendimento. O mesmo gerador aparece ao abrir os três pontos de uma conta local elegível.

**Gerar senha temporária e redefinir** troca a credencial e apresenta o valor para entrega manual. Ao fechar, o valor deixa de ser exibido. O pedido atendido sai da fila, as sessões anteriores são revogadas e o usuário precisa cadastrar uma senha pessoal e entrar novamente. O administrador confirma a identidade antes de redefinir. Não há envio automático de e-mail nem senha compartilhada. Decisão, controles e limitações na [ADR-0021](../adr/0021-recuperacao-local-assistida-de-senha.md).

A troca de senha e a conclusão do login conferem o hash atual dentro da transação, com bloqueio por conta. Isso impede tanto sobrepor uma redefinição concorrente quanto criar uma sessão com senha antiga depois da troca. O cenário de uma tentativa com a senha temporária anterior foi exercitado contra SQL DEV, sem emitir token e com rollback dos dados fictícios.

## Tabelas

Filtros compactos e botões de ordenação estão nos cabeçalhos de todas as tabelas de dados identificadas em `frontend/src/features`: contas locais, filiais, áreas, colaboradores, lotações, atribuições de questionário, três tipos de vínculo, versões de questionário, ciclos, configurações do ciclo, quatro tipos de prévia XLSX, solicitações de senha, distribuição de classificação e resultado individual por competência. Colunas de ação continuam contendo apenas operações.

Os filtros combinam colunas, ignoram acentos/caixa, permitem limpar cada campo e voltam à primeira página. Datas usam campo de data quando o contrato fornece data ISO; situações usam seleção; números são ordenados numericamente e nomes em português. A ordenação inicial é pelo nome/coluna principal, pela solicitação mais recente na fila e pelo percentual decrescente na distribuição. Competências passam a uma linha por item para ordenar nome e pontuação sem ambiguidade; a impressão conserva os resultados completos.

As listas administrativas existentes já chegam completas/autorizadas; ciclos e pedidos percorrem suas páginas antes do filtro local. A prévia XLSX reúne até mil linhas/40 páginas, conferindo sequência, total e unicidade; erro parcial bloqueia apresentação/confirmação. Isso evita encontrar apenas itens da página visível. A paginação de avaliações continua no servidor, com seus filtros já existentes. Em celular, os controles dos cabeçalhos continuam visíveis acima dos cartões das linhas.

## Ativação e recuperação operacional

Publicação não executada. Usar o processo autorizado vigente para publicar primeiro a API e depois a SPA; validar CSRF, cookies, permissões, fila e fluxo real com conta de teste autorizada. Nenhuma migration nova é necessária. Preservar pendências operacionais anteriores, inclusive grants de outras tarefas, sem tratá-las como resolvidas aqui.

Reversão de código/artefatos restaura a interface anterior; não deve apagar auditoria, avaliações ou recriar senhas antigas. O atendimento já executado continua válido; a API anterior já reconhece a marca de troca obrigatória. Qualquer redefinição adicional exige a mesma autorização administrativa. Configuração de proxy/rate limit, certificado, TLS SQL e aceite visual no alvo permanecem controles próprios da liberação.

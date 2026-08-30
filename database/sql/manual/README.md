# SQL manual

Nada desta pasta é executado por `executar-database.bat`.

Scripts de diagnóstico, correção excepcional, retenção, exportação ou administração de produção exigem decisão registrada, revisão e autorização específica. Não colocar nesta pasta senha, token, backup, dados pessoais reais ou comandos destrutivos sem o procedimento aprovado.

`001_conceder_metadados_usuario_etl.sql` é uma concessão administrativa pontual para a ferramenta local visualizar a estrutura do banco. Ele concede somente `CONNECT` e `VIEW DEFINITION`; não concede acesso aos dados, papéis de banco nem permissões para a aplicação.

`002_conceder_acesso_integral_administrador_supremo_local.sql` é uma concessão excepcional, transacional e auditada para a única conta suprema protegida do banco local de desenvolvimento. Ele exige que não existam colaboradores, ciclos ou avaliações e acrescenta os papéis de negócio necessários para navegar e testar todas as áreas; também revoga sessões ativas. Não deve ser usado em ambiente com dados de negócio ou produção.

`008_conceder_papel_gestor_conta_ficticia_desenvolvimento.sql` recompõe, somente em `AVALIACAO_DEV`, o papel `GESTOR` da conta fictícia criada por `007_popular_contas_ficticias_desenvolvimento.sql`. Ele é transacional, idempotente e registra a alteração em auditoria; serve exclusivamente para disponibilizar opções de teste na administração de vínculos.

`009_popular_ciclo_rascunho_atribuicoes_desenvolvimento.sql` cria, somente em `AVALIACAO_DEV`, um ciclo fictício em `RASCUNHO` com a versão aprovada do questionário `OPERACIONAL` já aplicada. Ele é transacional, idempotente e auditado; serve exclusivamente para testar a criação de atribuições administrativas.

`011_preparar_cenario_feedback_automatizado_dev.sql` é chamado exclusivamente por `scripts/testar-fluxo-feedback-dev.ps1`. Ele exige `AVALIACAO_DEV`, as migrations `V0012` e `V0013` e credenciais efêmeras geradas pelo próprio teste; cria dados fictícios isolados e auditados para validar autenticação, renovação e encerramento de sessão, publicação, reabertura, feedback, indicadores, exportação CSV, privacidade `>=5`, limite de consulta e a segregação do Administrador técnico. O teste também cria e exclui logicamente uma conta comum fictícia, cria e aprova uma versão completa de questionário fictício, confirma conflitos sem gravação parcial, cobre repetição e colisão de chaves idempotentes, rejeita `If-Match` fraco ou obsoleto e confere diretamente no SQL Server versões, transições e auditoria. Por fim, cria e remove somente uma filial fictícia inativa sem lotação e substitui a configuração de um ciclo fictício em rascunho, comprovando as duas exclusões físicas restritas pelo caminho da API. Não recebe senha em texto e não é um procedimento de produção.

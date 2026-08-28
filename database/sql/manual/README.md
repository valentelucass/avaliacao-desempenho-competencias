# SQL manual

Nada desta pasta é executado por `executar-database.bat`.

Scripts de diagnóstico, correção excepcional, retenção, exportação ou administração de produção exigem decisão registrada, revisão e autorização específica. Não colocar nesta pasta senha, token, backup, dados pessoais reais ou comandos destrutivos sem o procedimento aprovado.

`001_conceder_metadados_usuario_etl.sql` é uma concessão administrativa pontual para a ferramenta local visualizar a estrutura do banco. Ele concede somente `CONNECT` e `VIEW DEFINITION`; não concede acesso aos dados, papéis de banco nem permissões para a aplicação.

`002_conceder_acesso_integral_administrador_supremo_local.sql` é uma concessão excepcional, transacional e auditada para a única conta suprema protegida do banco local de desenvolvimento. Ele exige que não existam colaboradores, ciclos ou avaliações e acrescenta os papéis de negócio necessários para navegar e testar todas as áreas; também revoga sessões ativas. Não deve ser usado em ambiente com dados de negócio ou produção.

`008_conceder_papel_gestor_conta_ficticia_desenvolvimento.sql` recompõe, somente em `AVALIACAO_DEV`, o papel `GESTOR` da conta fictícia criada por `007_popular_contas_ficticias_desenvolvimento.sql`. Ele é transacional, idempotente e registra a alteração em auditoria; serve exclusivamente para disponibilizar opções de teste na administração de vínculos.

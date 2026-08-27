# Inventário SQL Server — 2026-08-25

## Escopo

Leitura local para decidir a estratégia do banco do sistema de Avaliação de Desempenho e Competências. Nenhuma alteração no SQL Server foi executada.

## Achados

- A instância padrão `MSSQLSERVER` está em execução e configurada para iniciar automaticamente.
- O cliente `sqlcmd` está instalado e a autenticação integrada do Windows permitiu consulta local de metadados.
- Havia quatro bancos de usuário na instância e nenhum nome correspondente a este projeto.
- A instância escuta em TCP `1433` em todas as interfaces locais. O SQL Server Browser está desabilitado.
- A conexão local atual requer confiança explícita no certificado do servidor para o `sqlcmd`; isso é limitado ao bootstrap local e não substitui um certificado confiável para acesso remoto.

## Consequência registrada

A instância será reutilizada somente como servidor, com bancos exclusivos `AVALIACAO_DEV` e `AVALIACAO_PROD`. Antes de liberar qualquer acesso fora da VM, a exposição de TCP 1433, o Firewall do Windows, TLS do SQL Server, backup/restauração e a conta de mínimo privilégio da aplicação precisam ser definidos e validados.

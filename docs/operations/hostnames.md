# Hosts públicos previstos

## Direcionamento confirmado

| Componente | Host público previsto                      |
| ---------- | ------------------------------------------ |
| Front-end  | `https://formulario.rodogarcia.com.br`     |
| API        | `https://api-formulario.rodogarcia.com.br` |

## Topologia decidida

Por confirmação explícita do usuário em 2026-08-25, esta VM será a origem da aplicação e Cloudflare Tunnel será o único caminho público. O encaminhamento esperado é:

| Host público                               | Serviço privado nesta VM             |
| ------------------------------------------ | ------------------------------------ |
| `https://formulario.rodogarcia.com.br`     | `http://127.0.0.1:18080` (front-end) |
| `https://api-formulario.rodogarcia.com.br` | `http://127.0.0.1:18081` (API)       |

O HTTPS público é atendido pela Cloudflare. Os dois serviços da aplicação não devem escutar interfaces públicas, nem exigem IIS, Nginx ou abertura de porta de entrada para funcionarem pelo túnel.

O certificado HTTPS autoassinado usado por `iniciar-dev.bat` é somente local, no perfil Windows atual, e não atende nem configura os hosts públicos. A atualização desta documentação não cria ou altera conta, zona, DNS, rota de túnel, regra de proxy, certificado público ou configuração externa.

O [inventário operacional da VM de 2026-08-25](inventario-vm-2026-08-25.md) é histórico e foi feito apenas em leitura; ele registrou um estado anterior à exposição observada. A evidência mais recente, de 2026-08-26, registrou `200` anônimo para o host do front-end e para CSRF da API, com os dois processos PM2 online. Isso comprova disponibilidade pontual, não aceite de negócio, percurso autenticado, operação com dados reais ou teste integral da configuração Cloudflare.

## Consequências para a implementação futura

- A origem de produção permitida pelo CORS da API deverá ser exclusivamente `https://formulario.rodogarcia.com.br`, salvo nova decisão registrada.
- O endereço da API deverá entrar no front-end por configuração externa de produção, e não como valor secreto ou fixo no código-fonte.
- Alterações nas duas rotas do túnel continuam exigindo autorização explícita e validação própria; este repositório não as executa automaticamente.
- Logs, backup com teste de restauração, inicialização automática do PM2, atualização e rollback continuam como tarefas operacionais da `ADC-012`; não são uma dúvida sobre a origem ou o túnel.
- Nenhuma configuração de CORS foi ativada nesta fundação: a segurança e autorização são responsabilidade da tarefa `ADC-007`.

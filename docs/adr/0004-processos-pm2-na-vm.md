# ADR-0004 — Processos da aplicação gerenciados pelo PM2

- **Status:** Aceita para os scripts de execução
- **Data:** 2026-08-25
- **Origem:** Solicitação explícita do usuário para criar scripts `.bat` e verificar conflitos com os processos PM2 já existentes na VM.

## Contexto

A VM já possui processos PM2 de outros sistemas. A aplicação precisa de scripts distintos para desenvolvimento e para a execução futura em produção, sem reutilizar portas ou interromper processos que não pertençam a este projeto.

## Decisão

- Reservar `127.0.0.1:18081` para a API Java e `127.0.0.1:18080` para o front-end React.
- Reservar `https://localhost:5181` para a API e `https://localhost:5180` para a SPA no desenvolvimento; o launcher local não verifica, encerra ou ocupa as portas privadas de produção.
- Usar os nomes PM2 `avaliacao-desempenho-backend-prod` e `avaliacao-desempenho-frontend-prod` exclusivamente para esta aplicação.
- `ecosystem.config.cjs` é o manifesto canônico do PM2. Ele recebe caminhos, portas, logs e configuração externa somente do `iniciar-prod.bat` depois do preflight; não contém segredos, não lê `.env` e falha se for chamado sem o ambiente obrigatório.
- O script de produção somente inicia ou reinicia processos com esses dois nomes por meio do manifesto; ele nunca encerra processos de terceiros para liberar portas.
- O script de desenvolvimento não usa PM2 e falha se qualquer porta escolhida já estiver em uso.
- Ambos os scripts oferecem `--check`, que valida pré-requisitos e portas sem iniciar, reiniciar ou publicar processos.

## Consequências

- As portas escolhidas estavam livres na verificação de 2026-08-25 e não pertencem às faixas de exclusão TCP observadas no Windows.
- A API e o front-end ficarão restritos ao loopback. O acesso público por Cloudflare Tunnel nesta VM está definido na [ADR-0005](0005-acesso-publico-por-cloudflare-tunnel.md); a configuração externa das rotas ainda não foi executada.
- O pre-flight de produção executa a validação local antes de tocar nos processos PM2, mas não implementa rollback automático porque ainda não existe endpoint de saúde nem política de artefatos/reversão aprovada.
- O script chama `pm2 save` após sucesso, mas não configura inicialização automática do PM2 após reinício da VM.
- O manifesto configura reinício automático com backoff, limite de reinícios, mínimo de disponibilidade e arquivos de saída/erro no diretório externo de logs. A atualização do manifesto exige nova execução autorizada de `iniciar-prod.bat` para ser aplicada aos processos existentes.
- Testes afetados: validação dos modos `--check`, disponibilidade das portas, início dos processos PM2 e verificação de saúde quando o contrato de uma rota de saúde for aprovado.

# ADR-0005 — Acesso público por Cloudflare Tunnel nesta VM

- **Status:** Aceita para a topologia de acesso
- **Data:** 2026-08-25
- **Origem:** Confirmação explícita do usuário de que esta máquina será a origem e de que a aplicação rodará por Cloudflare Tunnel.

## Contexto

Esta VM já possui o serviço `Cloudflared` em execução automática. Os processos deste projeto foram desenhados para usar portas privadas exclusivas, sem interromper outros serviços da máquina.

## Decisão

- Esta VM será a origem da aplicação.
- Cloudflare Tunnel será o único caminho público para os hosts do projeto.
- `formulario.rodogarcia.com.br` será encaminhado ao front-end em `http://127.0.0.1:18080`.
- `api-formulario.rodogarcia.com.br` será encaminhado à API em `http://127.0.0.1:18081`.
- O HTTPS público será atendido pela Cloudflare. A comunicação de origem ficará restrita ao loopback da VM.
- Não será instalado IIS ou Nginx, nem serão expostas portas públicas da aplicação para esse encaminhamento.

## Consequências

- Não é necessária uma regra de entrada pública específica para o front-end ou a API funcionarem pelo túnel. A segurança geral do firewall da VM continua sendo responsabilidade operacional, mas não altera a topologia definida.
- A configuração efetiva das rotas dos hosts na Cloudflare é uma ação externa. Esta ADR não a executa nem autoriza alteração de túnel, DNS, certificado ou proxy.
- O serviço `Cloudflared` já inicia automaticamente; a restauração dos processos PM2 após reinício ainda precisa ser configurada e validada antes de produção.
- Logs, backup com teste de restauração, atualização e rollback continuam obrigatórios para operar o sistema, mesmo com o túnel definido.

## Evidência e testes afetados

- O inventário local de 2026-08-25 confirmou o serviço `Cloudflared` em execução automática e as portas `18080` e `18081` estavam livres antes de qualquer publicação.
- Após a configuração externa autorizada, validar cada hostname público, a ausência de escuta pública da aplicação, o encaminhamento para o serviço correto e a recuperação dos processos após reinicialização.

## Estado operacional posterior — 2026-08-26

Os hosts público do front-end e de CSRF da API responderam `200` em leitura anônima, com os dois processos PM2 do projeto online. Essa observação não altera a decisão nem certifica a configuração Cloudflare: ainda faltam validação autenticada de ponta a ponta, teste após reinicialização, backup/restauração e aceite de negócio.

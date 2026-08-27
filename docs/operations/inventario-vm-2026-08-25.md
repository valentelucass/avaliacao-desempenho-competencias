# Inventário operacional da VM — 2026-08-25

## Escopo da verificação

Esta verificação foi executada localmente na VM e somente em modo de leitura. Ela não criou, alterou ou reiniciou serviço, regra de firewall, certificado, túnel, DNS, proxy ou recurso da Cloudflare.

## Evidências observadas

| Item | Situação observada |
| --- | --- |
| Sistema operacional | Windows Server 2022 Standard, 64 bits |
| Servidor web de origem | IIS e Nginx não estão instalados |
| Cloudflare Tunnel | O serviço `Cloudflared` existe, inicia automaticamente e estava em execução |
| Portas de origem | Não havia processo em escuta nas portas TCP 80, 443 ou 8080 durante a verificação |
| Firewall do Windows | Nenhum dos três perfis estava habilitado |
| Certificados locais | Há certificado com chave privada local; não foi verificado vínculo, validade ou uso por este projeto |
| DNS público | `formulario.rodogarcia.com.br` e `api-formulario.rodogarcia.com.br` não resolviam no momento da verificação |

Na data desta leitura, não havia confirmação de que o serviço `cloudflared` atendia a este projeto. Nenhuma configuração de túnel foi lida, reutilizada ou alterada.

## Conclusão

O sistema operacional da VM está confirmado. Esta verificação, sozinha, não comprovava uma rota pública para os hosts do projeto nem substituía a configuração da aplicação, logs, backup e recuperação.

## Atualização de decisão posterior

Após este inventário, o usuário confirmou que esta VM será a origem do projeto e que o acesso público ocorrerá por Cloudflare Tunnel. Essa decisão está formalizada na [ADR-0005](../adr/0005-acesso-publico-por-cloudflare-tunnel.md).

O inventário continua sendo apenas evidência histórica: ele não comprova que as rotas dos hosts já existam na Cloudflare. Qualquer criação ou alteração de rota, DNS, túnel, firewall, certificado ou serviço da VM continua dependente de autorização explícita de publicação.

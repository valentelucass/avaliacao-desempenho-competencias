# Monólito modular

## Decisão estrutural

O sistema é um monólito modular: uma API Java, uma SPA React separada e um banco SQL Server. A divisão por módulos preserva fronteiras de negócio e evita transformar identidade, avaliações e indicadores em um serviço único acoplado, sem introduzir a complexidade operacional de microserviços.

## Módulos implementados no código-fonte

- `identidadeacesso`: sessão local, JWT curto, RBAC, administração de contas e auditoria.
- `cadastros`: colaboradores, filiais, áreas, lotações e vínculos administrativos.
- `ciclosavaliacao`: questionários aplicados, configuração, abertura e encerramento de ciclos.
- `avaliacoes`: rascunho, envio, cálculo, publicação, reabertura e escopo por recurso.
- `indicadores`: agregação SQL, supressão de grupos pequenos, exportação CSV e opções de filtro seguras.

O código de persistência e os controllers desses módulos são condicionais por configuração externa. Com os valores padrão, eles não são registrados e a API permanece negada por padrão. Isso permite versionar a entrega sem supor banco, segredo, conta ou deploy já existentes.

```text
br.com.avaliacao.desempenho.<modulo>/
├── api/                    # HTTP, DTOs, validação de transporte
├── application/            # Casos de uso e coordenação transacional
├── domain/                 # Regras puras, modelos e portas
└── infrastructure/         # JDBC SQL Server, segurança, auditoria e adaptadores
```

## Responsabilidades

- **API:** controllers convertem HTTP em DTOs, chamam casos de uso e definem status/headers. Não calculam, autorizam recursos nem acessam banco diretamente.
- **Aplicação:** coordena transações, idempotência, auditoria e portas do domínio.
- **Domínio:** calcula nota/classificação, avalia transições e políticas de privacidade/segregação sem depender de Spring, HTTP, JDBC ou DTOs.
- **Infraestrutura:** implementa JDBC parametrizado, segurança, limites locais e integrações técnicas. Entidades de persistência não são expostas pela API.
- **Front-end:** apresenta fluxos e valida a experiência; não é autoridade para nota, faixa, permissão, vínculo ou estado publicado.

## Limites de ativação

Em 2026-08-26, os bancos canônicos `AVALIACAO_DEV` e `AVALIACAO_PROD` reconciliaram `V0001`–`V0010`, incluindo catálogo RBAC, regra operacional e catálogo inicial `2024.1`. A `V0011` já existe na fonte para restringir a autoridade administrativa e normalizar contas administrativas legadas para perfil único, mas ainda exige aplicação autorizada nos alvos. A validação somente leitura não encontrou ciclos, lotações, vínculos, atribuições ou avaliações. Os valores padrão seguem sem registrar módulos persistidos; `iniciar-dev.bat` os ativa apenas no processo de desenvolvimento local controlado. A verificação anônima mais recente dos hosts retornou `200` e encontrou os processos PM2 online, mas não substitui teste autenticado, aceite de negócio ou validação por ambiente. Antes de aceitar dados reais ou liberar outro ambiente, é obrigatório seguir [Configuração externa da aplicação](../operations/configuracao-externa-da-aplicacao.md), testar contra SQL Server autorizado e liberar a configuração por ambiente.

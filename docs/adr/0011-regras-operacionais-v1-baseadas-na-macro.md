# ADR-0011 — Regras operacionais v1 baseadas na macro de 2024

| Campo     | Valor                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| Status    | Aceita em 2026-08-25.                                                                                               |
| Decisores | Usuário solicitante, que autorizou a macro de 2024 como fonte e a adoção de regras conservadoras para suas lacunas. |
| Escopo    | Versão de negócio para cálculo, acesso, autoavaliação, indicadores e exportação agregada.                           |

## Contexto

A macro recebida contém três questionários, a escala 80/90/100/110/120, média simples e a matriz `GERAL`, mas também contém VBA não executada, dados pessoais históricos e comportamentos incompatíveis com a segurança do produto. Ela não define autorização de pessoas, autoavaliação, privacidade de indicadores, exportação segura, arredondamento ou um fluxo auditável de reabertura.

## Decisão

A macro passa a ser a fonte de conteúdo da versão `2024.1`, sem importar seus dados ou reproduzir VBA e defeitos. As regras não definidas no arquivo seguem os controles conservadores de [Regras operacionais v1](../business/regras-operacionais-v1.md): média simples com nota final de uma casa decimal `HALF_UP`, matriz `GERAL`, questionários completos, autoavaliação independente sem efeito na nota, um gestor ativo por colaborador, reabertura auditada e indicadores agregados com privacidade reforçada.

## Consequências

- O domínio, o schema, os contratos e os testes futuros devem versionar e aplicar esta decisão; migrations já aplicadas não serão alteradas.
- Dados pessoais, CPF, comentários históricos, VBA, PDF legado e permissões implícitas da macro permanecem fora da implementação.
- As tarefas técnicas ADC-007, ADC-008, ADC-009 e ADC-011 continuam responsáveis por autenticação, persistência, API, auditoria, indicadores e exportação. Nenhuma rota ou processo externo é liberado por esta ADR.

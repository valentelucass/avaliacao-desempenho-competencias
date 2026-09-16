# ADR-0020 — Importação XLSX restrita com conferência

- Data: 2026-09-16
- Estado: implementado localmente; validação registrada no STATES.md, ativação pendente
- Origem: modelos enviados e autorização do usuário em ADC-IMP-001; colunas de Lotações e ampliação autorizadas em ADC-IMP-002

## Contexto

Os dois modelos iniciais contêm tabelas literais de nomes, ciclo e título de questionário. O usuário definiu depois as cinco colunas de Lotações, com data de início, solicitando ignorar as demais colunas de dados. A aplicação é um monólito em instância única, com SQL Server, auditoria e casos de uso individuais já existentes. Não há autorização para criar armazenamento, schema ou serviço externo.

## Decisão

Receber XLSX binário em rotas protegidas de cadastros. Ler exclusivamente a estrutura necessária dos modelos, usando ZIP/XML do JDK com allowlist e limites, sem executar Excel. Rejeitar macros, fórmulas, links e partes desconhecidas. A política XML segue o [guia JAXP do Java 21](https://docs.oracle.com/en/java/javase/21/security/java-api-xml-processing-jaxp-security-guide.html); referências de texto e células seguem a [estrutura SpreadsheetML](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document).

O leitor não pretende implementar todos os formatos Excel. Arquivos com recursos adicionais devem ser convertidos pelo usuário ao modelo simples aprovado. O intervalo literal do filtro automático presente no modelo é aceito; outros nomes definidos permanecem proibidos. A escolha evita uma dependência ampla para os três modelos pequenos, mas exige testes de limites e conteúdo e revisão quando os modelos mudarem.

Lotações usa extrator separado para os cinco cabeçalhos em qualquer ordem, limitado às colunas A:Z. Colunas extras de dados são desconsideradas; controles de conteúdo perigoso abrangem o arquivo inteiro. Datas numéricas respeitam `workbookPr.date1904`; texto exige `dd/MM/aaaa`. Frações, datas impossíveis e o serial fictício 60 de 1900 são rejeitados. A interpretação segue os [sistemas de datas documentados pela Microsoft](https://support.microsoft.com/en-us/excel/date-systems-in-excel). Domínio puro valida referências e sobreposições; a infraestrutura apenas decodifica os valores.

Manter conferência temporária em memória, limitada por ator e globalmente, com UUID aleatório, expiração em 15 minutos e descarte. Não persistir o arquivo nem introduzir cache distribuído. Retornar páginas de 25 linhas e contagens globais. A confirmação só aceita o UUID, não recebe IDs ou ações de linhas arbitrárias do cliente.

Revalidar a conferência com bloqueios UPDLOCK/HOLDLOCK na transação de confirmação e reutilizar os casos de uso auditados. Nenhuma escrita parcial. Repetição do mesmo UUID devolve o resultado já confirmado enquanto a prévia existir. Não alterar o schema para isso.

## Ampliação ADC-IMP-003 — vínculos de gestão

Em 16/09/2026, o usuário solicitou importação de vínculos gestor–colaborador e pediu definir o modelo com base na documentação e nas relações existentes. Reutilizar leitura restrita, limites, prévia e confirmação transacional, com regras de domínio próprias. Cabeçalhos: Conta avaliadora (nome de exibição da conta elegível no seletor), Colaborador e Início. Nomes ambíguos não são resolvidos automaticamente; vínculos de conta ou texto livre não substituem a escolha explícita.

A permissão de vínculo é distinta de CADASTROS.GERIR. Usar namespace `/administration/manager-assignment-imports` com permissão específica antes da leitura do arquivo e nos métodos; validar também a família de permissão da prévia em todas as operações do serviço. Isso impede confirmar um lote de acesso pela rota de cadastros após perda da permissão de vínculo. Não expor login ou novas projeções de identidade. Modelo XLSX estático vazio disponível na SPA; nenhum arquivo enviado é armazenado.

Manter vínculos idênticos, impedir substituição/sobreposição e preservar histórico. Ausência de conta ativa Gestor/RH ou colaborador ativo bloqueia; não provisionar contas/perfis. Operação solicitada amplia apenas o vínculo gestor–colaborador, não os outros dois tipos de vínculo.

## Consequências e limites

- Reinício ou expiração exige nova conferência. Se houve commit seguido de perda da resposta/reinício, reenviar o modelo mostra registros existentes para conferência, sem atualizar nem duplicar automaticamente.
- Homônimos e colaboradores inativos bloqueiam a importação; o nome não passa a ser chave única do cadastro. Novas pessoas homônimas exigem cadastro individual até definição de identificador apropriado.
- Filial é descartada nas atribuições por instrução explícita do usuário. Somente o importador Lotações cria novos períodos abertos, sem substituir/encerrar o histórico; vínculos de gestão, usuários e permissões permanecem fora do escopo dos três importadores de cadastros; vínculos possuem o fluxo específico ADC-IMP-003. Filial e área referenciam cadastros ativos existentes; gestor é texto.
- Consultas usam parâmetros, OPENJSON e apenas nomes do lote. Os bloqueios podem serializar cadastros durante a confirmação; o lote tem limite de 1.000 registros. Não há alegação de ensaio de carga produtiva.
- Não há antimalware externo nesta extração de valores sem execução, armazenamento ou redistribuição. A introdução dessas capacidades ou de outro formato exige reavaliar verificação antimalware e retenção.
- Limites por processo e prévias em memória precisam ser revistos antes de múltiplas instâncias. Não há nova integração nem infraestrutura implícita.

Regras completas, limites e evidências: [importação por planilha](../business/importacao-planilhas-cadastros.md) e [STATES.md](../../STATES.md).

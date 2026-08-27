SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dbo.schema_migrations
    WHERE version = N'V0010'
      AND script_name = N'V0010__catalogo_inicial_rodogarcia_2024_1'
)
BEGIN
    SELECT N'V0010_PENDENTE' AS estado_catalogo_inicial;
    RETURN;
END;

DECLARE @filiais_esperadas int = 9;
DECLARE @areas_esperadas int = 14;
DECLARE @competencias_esperadas int = 56;

IF (SELECT COUNT(*) FROM dbo.filial WHERE nome IN (
    N'Osasco', N'Agudos', N'Matriz', N'Campinas', N'Curitiba', N'Castro',
    N'Rio de Janeiro', N'Recife', N'Novo Hamburgo'
)) <> @filiais_esperadas
    THROW 51150, N'Catálogo inicial de filiais incompleto.', 1;

IF (SELECT COUNT(*) FROM dbo.area WHERE nome IN (
    N'Administrativo', N'Operacional', N'Frota', N'Tráfego / Torre de Controle',
    N'Financeiro', N'RH / DP', N'Controladoria', N'Comercial', N'Distribuição',
    N'Expedição', N'GRC', N'TI', N'Qualidade', N'Gerência'
)) <> @areas_esperadas
    THROW 51151, N'Catálogo inicial de áreas incompleto.', 1;

IF (SELECT COUNT(*) FROM dbo.versao_questionario AS versao
    JOIN dbo.questionario AS questionario ON questionario.questionario_id = versao.questionario_id
    WHERE questionario.codigo IN (N'LIDERANCA', N'ADMINISTRATIVO', N'OPERACIONAL')
      AND versao.numero_versao = 1
      AND versao.aprovado_em_utc IS NOT NULL) <> 3
    THROW 51152, N'Versões iniciais de questionário incompletas ou não aprovadas.', 1;

IF (SELECT COUNT(*) FROM dbo.versao_competencia AS versao
    JOIN dbo.competencia AS competencia ON competencia.competencia_id = versao.competencia_id
    WHERE competencia.codigo LIKE N'LIDERANCA[_]%'
       OR competencia.codigo LIKE N'ADMINISTRATIVO[_]%'
       OR competencia.codigo LIKE N'OPERACIONAL[_]%') <> @competencias_esperadas
    THROW 51153, N'Competências iniciais incompletas.', 1;

IF (SELECT COUNT(*) FROM dbo.pergunta_questionario AS pergunta
    JOIN dbo.questionario_competencia AS relacao
      ON relacao.questionario_competencia_id = pergunta.questionario_competencia_id
    JOIN dbo.versao_questionario AS versao ON versao.versao_questionario_id = relacao.versao_questionario_id
    JOIN dbo.questionario AS questionario ON questionario.questionario_id = versao.questionario_id
    WHERE questionario.codigo IN (N'LIDERANCA', N'ADMINISTRATIVO', N'OPERACIONAL')
      AND versao.numero_versao = 1
      AND pergunta.obrigatoria = 1) <> @competencias_esperadas
    THROW 51154, N'Perguntas obrigatórias iniciais incompletas.', 1;

IF (SELECT COUNT(*) FROM dbo.opcao_resposta AS opcao
    JOIN dbo.versao_questionario AS versao ON versao.versao_questionario_id = opcao.versao_questionario_id
    JOIN dbo.questionario AS questionario ON questionario.questionario_id = versao.questionario_id
    WHERE questionario.codigo IN (N'LIDERANCA', N'ADMINISTRATIVO', N'OPERACIONAL')
      AND versao.numero_versao = 1
      AND opcao.pontos IN (80, 90, 100, 110, 120)) <> 15
    THROW 51155, N'Escala inicial 80-120 incompleta.', 1;

IF NOT EXISTS (
    SELECT 1 FROM dbo.configuracao_calculo_versao AS configuracao
    JOIN dbo.matriz_classificacao_versao AS matriz
      ON matriz.configuracao_calculo_versao_id = configuracao.configuracao_calculo_versao_id
    WHERE configuracao.codigo = N'MEDIA_SIMPLES_2024_1'
      AND configuracao.numero_versao = 1
      AND configuracao.aprovado_em_utc IS NOT NULL
      AND matriz.codigo = N'GERAL'
      AND matriz.numero_versao = 1
      AND matriz.aprovado_em_utc IS NOT NULL
)
    THROW 51156, N'Configuração de cálculo ou matriz inicial ausente.', 1;

SELECT
    (SELECT COUNT(*) FROM dbo.filial WHERE nome IN (
        N'Osasco', N'Agudos', N'Matriz', N'Campinas', N'Curitiba', N'Castro',
        N'Rio de Janeiro', N'Recife', N'Novo Hamburgo'
    )) AS filiais_iniciais,
    (SELECT COUNT(*) FROM dbo.area WHERE nome IN (
        N'Administrativo', N'Operacional', N'Frota', N'Tráfego / Torre de Controle',
        N'Financeiro', N'RH / DP', N'Controladoria', N'Comercial', N'Distribuição',
        N'Expedição', N'GRC', N'TI', N'Qualidade', N'Gerência'
    )) AS areas_iniciais,
    @competencias_esperadas AS competencias_iniciais,
    3 AS questionarios_aprovados,
    15 AS opcoes_de_resposta;

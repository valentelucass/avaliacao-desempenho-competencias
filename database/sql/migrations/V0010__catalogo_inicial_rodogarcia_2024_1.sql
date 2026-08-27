SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @ator_usuario_id uniqueidentifier = (
    SELECT TOP (1) usuario_id
    FROM dbo.usuario
    WHERE administrador_supremo = 1
      AND situacao = 'ATIVO'
      AND excluido_logicamente = 0
    ORDER BY criado_em_utc, usuario_id
);

IF @ator_usuario_id IS NULL
    THROW 51140, N'A carga inicial exige um administrador supremo ativo.', 1;

DECLARE @filiais TABLE (nome nvarchar(200) NOT NULL PRIMARY KEY);
INSERT INTO @filiais (nome) VALUES
    (N'Osasco'), (N'Agudos'), (N'Matriz'), (N'Campinas'), (N'Curitiba'),
    (N'Castro'), (N'Rio de Janeiro'), (N'Recife'), (N'Novo Hamburgo');

DECLARE @areas TABLE (nome nvarchar(200) NOT NULL PRIMARY KEY);
INSERT INTO @areas (nome) VALUES
    (N'Administrativo'), (N'Operacional'), (N'Frota'), (N'Tráfego / Torre de Controle'),
    (N'Financeiro'), (N'RH / DP'), (N'Controladoria'), (N'Comercial'),
    (N'Distribuição'), (N'Expedição'), (N'GRC'), (N'TI'), (N'Qualidade'), (N'Gerência');

INSERT INTO dbo.filial (nome, ativa)
SELECT nome, 1 FROM @filiais AS origem
WHERE NOT EXISTS (SELECT 1 FROM dbo.filial AS destino WHERE destino.nome = origem.nome);

INSERT INTO dbo.area (nome, ativa)
SELECT nome, 1 FROM @areas AS origem
WHERE NOT EXISTS (SELECT 1 FROM dbo.area AS destino WHERE destino.nome = origem.nome);

IF EXISTS (
    SELECT 1 FROM dbo.questionario
    WHERE codigo IN (N'LIDERANCA', N'ADMINISTRATIVO', N'OPERACIONAL')
)
    THROW 51141, N'O catálogo de questionários 2024.1 já possui dados; a migration não os sobrescreve.', 1;

IF EXISTS (
    SELECT 1 FROM dbo.configuracao_calculo_versao
    WHERE codigo = N'MEDIA_SIMPLES_2024_1' AND numero_versao = 1
    UNION ALL
    SELECT 1 FROM dbo.matriz_classificacao_versao
    WHERE codigo = N'GERAL' AND numero_versao = 1
)
    THROW 51142, N'A configuração de cálculo 2024.1 já possui dados; a migration não a sobrescreve.', 1;

DECLARE @questionarios TABLE (
    codigo nvarchar(100) NOT NULL PRIMARY KEY,
    nome nvarchar(200) NOT NULL,
    titulo nvarchar(200) NOT NULL,
    descricao nvarchar(1000) NOT NULL
);
INSERT INTO @questionarios VALUES
    (N'LIDERANCA', N'Avaliação de liderança', N'Avaliação de liderança 2024.1', N'Competências de liderança da regra operacional 2024.1.'),
    (N'ADMINISTRATIVO', N'Avaliação de colaboradores', N'Avaliação de colaboradores 2024.1', N'Competências aplicáveis a colaboradores da regra operacional 2024.1.'),
    (N'OPERACIONAL', N'Avaliação operacional', N'Avaliação operacional 2024.1', N'Competências operacionais da regra operacional 2024.1.');

DECLARE @itens TABLE (
    questionario_codigo nvarchar(100) NOT NULL,
    codigo_base nvarchar(100) NOT NULL,
    nome nvarchar(200) NOT NULL,
    descricao nvarchar(2000) NOT NULL,
    ordem smallint NOT NULL,
    PRIMARY KEY (questionario_codigo, codigo_base)
);
INSERT INTO @itens VALUES
    (N'LIDERANCA',N'PREZA_SEGURANCA',N'Preza pela segurança',N'Prioriza a segurança e identifica e mitiga riscos.',1),
    (N'LIDERANCA',N'RESPONSABILIDADE_DECISOES',N'Responsabilidade sobre decisões',N'Assume ações, decisões, prazos e busca soluções.',2),
    (N'LIDERANCA',N'REGULAMENTO_INTERNO',N'Regulamento interno',N'Aplica valores, princípios e regulamento interno.',3),
    (N'LIDERANCA',N'SENSO_DONO',N'Senso de dono',N'Atua pelo crescimento do negócio com excelência.',4),
    (N'LIDERANCA',N'RELACIONAMENTO_INTERPESSOAL',N'Relacionamento interpessoal',N'Trata pessoas com respeito e promove ambiente agradável.',5),
    (N'LIDERANCA',N'COMUNICACAO',N'Comunicação',N'Comunica informações de forma clara e transparente.',6),
    (N'LIDERANCA',N'PROATIVIDADE',N'Proatividade',N'Antecipa problemas e faz as coisas acontecerem.',7),
    (N'LIDERANCA',N'QUALIDADE_TRABALHO',N'Qualidade do trabalho',N'Realiza atividades com qualidade e sem retrabalho.',8),
    (N'LIDERANCA',N'NORMAS_REGRAS',N'Cumprimento de normas e regras',N'Pratica normas com disciplina e comprometimento.',9),
    (N'LIDERANCA',N'FATURAMENTO_SETOR',N'Faturamento da filial/setor',N'Cumpre metas de faturamento, custos e área.',10),
    (N'LIDERANCA',N'TRABALHO_EQUIPE',N'Trabalho em equipe',N'Colabora e soma esforços com a equipe.',11),
    (N'LIDERANCA',N'FLEXIBILIDADE',N'Flexibilidade',N'Adapta-se a mudanças com organização.',12),
    (N'LIDERANCA',N'CRIATIVIDADE_PROBLEMAS',N'Criatividade na resolução de problemas',N'Propõe soluções e aprende com experiências.',13),
    (N'LIDERANCA',N'MENTE_EMPREENDEDORA',N'Mente empreendedora',N'Inova, aprende e atua com senso de urgência.',14),
    (N'LIDERANCA',N'GESTAO_TEMPO',N'Gestão do tempo',N'Organiza rotinas, prioridades e necessidades.',15),
    (N'LIDERANCA',N'FEEDBACK',N'Feedback',N'Oferece e solicita feedbacks para crescimento.',16),
    (N'LIDERANCA',N'DESENVOLVIMENTO_EQUIPE',N'Desenvolvimento de equipe',N'Encoraja desafios e desempenho superior.',17),
    (N'LIDERANCA',N'VISAO_SISTEMICA',N'Visão sistêmica',N'Integra processos, pessoas e recursos.',18),
    (N'LIDERANCA',N'DELEGACAO_TAREFAS',N'Delegação de tarefas',N'Delega e gerencia tarefas com eficiência.',19),
    (N'LIDERANCA',N'MELHORIA_CONTINUA',N'Melhoria contínua da área/filial',N'Propõe e executa melhorias contínuas.',20),
    (N'LIDERANCA',N'APRIMORAMENTO',N'Aprimoramento',N'Busca conhecimentos e habilidades em capacitações.',21),
    (N'ADMINISTRATIVO',N'APRENDIZAGEM',N'Aprendizagem',N'Desenvolve competências na própria função.',1),
    (N'ADMINISTRATIVO',N'COMPROMETIMENTO',N'Comprometimento',N'Segue normas e envolve-se com o propósito do setor.',2),
    (N'ADMINISTRATIVO',N'TRABALHO_EQUIPE',N'Trabalho em equipe',N'Colabora e soma esforços com a equipe.',3),
    (N'ADMINISTRATIVO',N'RESPONSABILIDADE_CONFIANCA',N'Responsabilidade e confiança',N'Demonstra confiabilidade com decisões, erros e prazos.',4),
    (N'ADMINISTRATIVO',N'RELACIONAMENTO_INTERPESSOAL',N'Relacionamento interpessoal',N'Interage com respeito e dignidade.',5),
    (N'ADMINISTRATIVO',N'COMUNICACAO',N'Comunicação',N'Comunica de forma clara, transparente e objetiva.',6),
    (N'ADMINISTRATIVO',N'PROATIVIDADE',N'Proatividade',N'Antecipa problemas e age proativamente.',7),
    (N'ADMINISTRATIVO',N'QUALIDADE_TRABALHO',N'Qualidade do trabalho',N'Trabalha no padrão de qualidade exigido.',8),
    (N'ADMINISTRATIVO',N'CONDUTA_PESSOAL',N'Conduta pessoal',N'Cumpre regras, procedimentos e instruções.',9),
    (N'ADMINISTRATIVO',N'PONTUALIDADE_ASSIDUIDADE',N'Pontualidade e assiduidade',N'Cumpre horários e jornada integralmente.',10),
    (N'ADMINISTRATIVO',N'FLEXIBILIDADE',N'Flexibilidade',N'Adapta-se a mudanças com organização.',11),
    (N'ADMINISTRATIVO',N'CRIATIVIDADE_PROBLEMAS',N'Criatividade na resolução de problemas',N'Propõe soluções para situações inesperadas.',12),
    (N'ADMINISTRATIVO',N'PRODUTIVIDADE',N'Produtividade',N'Trabalha com agilidade e atende expectativas.',13),
    (N'ADMINISTRATIVO',N'GESTAO_TEMPO',N'Gestão do tempo',N'Organiza rotina, prazos e prioridades.',14),
    (N'ADMINISTRATIVO',N'RECURSOS',N'Recursos',N'Zela por local, equipamentos, ferramentas e limpeza.',15),
    (N'ADMINISTRATIVO',N'CONHECIMENTO_TECNICO',N'Conhecimento técnico',N'Aplica conhecimento necessário à função.',16),
    (N'ADMINISTRATIVO',N'APRIMORAMENTO',N'Aprimoramento',N'Busca conhecimentos e habilidades em capacitações.',17),
    (N'ADMINISTRATIVO',N'PREZA_SEGURANCA',N'Preza pela segurança',N'Prioriza segurança e mitiga riscos.',18),
    (N'OPERACIONAL',N'APRENDIZAGEM',N'Aprendizagem',N'Desenvolve competências na própria função.',1),
    (N'OPERACIONAL',N'COMPROMETIMENTO',N'Comprometimento',N'Segue normas e envolve-se com o propósito do setor.',2),
    (N'OPERACIONAL',N'TRABALHO_EQUIPE',N'Trabalho em equipe',N'Colabora e soma esforços com a equipe.',3),
    (N'OPERACIONAL',N'RESPONSABILIDADE_CONFIANCA',N'Responsabilidade e confiança',N'Demonstra confiabilidade com decisões, erros e prazos.',4),
    (N'OPERACIONAL',N'RELACIONAMENTO_INTERPESSOAL',N'Relacionamento interpessoal',N'Interage com respeito e dignidade.',5),
    (N'OPERACIONAL',N'COMUNICACAO',N'Comunicação',N'Comunica de forma clara, transparente e objetiva.',6),
    (N'OPERACIONAL',N'PROATIVIDADE',N'Proatividade',N'Antecipa problemas e age proativamente.',7),
    (N'OPERACIONAL',N'QUALIDADE_TRABALHO',N'Qualidade do trabalho',N'Trabalha no padrão de qualidade exigido.',8),
    (N'OPERACIONAL',N'CONDUTA_PESSOAL',N'Conduta pessoal',N'Cumpre regras, normas, procedimentos, uso de EPI e instruções.',9),
    (N'OPERACIONAL',N'PONTUALIDADE_ASSIDUIDADE',N'Pontualidade e assiduidade',N'Cumpre horários e jornada integralmente.',10),
    (N'OPERACIONAL',N'FLEXIBILIDADE',N'Flexibilidade',N'Adapta-se a mudanças com organização.',11),
    (N'OPERACIONAL',N'CRIATIVIDADE_PROBLEMAS',N'Criatividade na resolução de problemas',N'Propõe soluções para situações inesperadas.',12),
    (N'OPERACIONAL',N'PRODUTIVIDADE',N'Produtividade',N'Trabalha com agilidade e atende expectativas.',13),
    (N'OPERACIONAL',N'RECURSOS',N'Recursos',N'Zela por local, equipamentos, ferramentas e limpeza.',14),
    (N'OPERACIONAL',N'CONHECIMENTO_TECNICO',N'Conhecimento técnico',N'Aplica conhecimento necessário à função.',15),
    (N'OPERACIONAL',N'APRIMORAMENTO',N'Aprimoramento',N'Busca conhecimentos e habilidades em capacitações.',16),
    (N'OPERACIONAL',N'PREZA_SEGURANCA',N'Preza pela segurança',N'Prioriza segurança e mitiga riscos.',17);

INSERT INTO dbo.questionario (codigo, nome, ativo)
SELECT codigo, nome, 1 FROM @questionarios;

DECLARE @versoes TABLE (codigo nvarchar(100) NOT NULL PRIMARY KEY, versao_questionario_id uniqueidentifier NOT NULL);
INSERT INTO dbo.versao_questionario (
    questionario_id, numero_versao, titulo, descricao, criado_por_usuario_id
)
SELECT questionario.questionario_id, 1, origem.titulo, origem.descricao, @ator_usuario_id
FROM @questionarios AS origem
JOIN dbo.questionario AS questionario ON questionario.codigo = origem.codigo;

INSERT INTO @versoes (codigo, versao_questionario_id)
SELECT questionario.codigo, versao.versao_questionario_id
FROM dbo.questionario AS questionario
JOIN dbo.versao_questionario AS versao
  ON versao.questionario_id = questionario.questionario_id
 AND versao.numero_versao = 1
JOIN @questionarios AS origem ON origem.codigo = questionario.codigo;

INSERT INTO dbo.competencia (codigo, nome, ativa)
SELECT itens.questionario_codigo + N'_' + itens.codigo_base, itens.nome, 1
FROM @itens AS itens;

DECLARE @versoes_competencia TABLE (
    questionario_codigo nvarchar(100) NOT NULL,
    codigo_base nvarchar(100) NOT NULL,
    versao_competencia_id uniqueidentifier NOT NULL,
    ordem smallint NOT NULL,
    nome nvarchar(200) NOT NULL,
    descricao nvarchar(2000) NOT NULL,
    PRIMARY KEY (questionario_codigo, codigo_base)
);
INSERT INTO dbo.versao_competencia (
    competencia_id, numero_versao, nome, descricao, criado_por_usuario_id
)
SELECT competencia.competencia_id, 1, itens.nome, itens.descricao, @ator_usuario_id
FROM @itens AS itens
JOIN dbo.competencia AS competencia
  ON competencia.codigo = itens.questionario_codigo + N'_' + itens.codigo_base;

INSERT INTO @versoes_competencia
SELECT itens.questionario_codigo, itens.codigo_base, versao.versao_competencia_id,
       itens.ordem, itens.nome, itens.descricao
FROM @itens AS itens
JOIN dbo.competencia AS competencia
  ON competencia.codigo = itens.questionario_codigo + N'_' + itens.codigo_base
JOIN dbo.versao_competencia AS versao
  ON versao.competencia_id = competencia.competencia_id AND versao.numero_versao = 1;

DECLARE @questionario_competencias TABLE (
    questionario_codigo nvarchar(100) NOT NULL,
    codigo_base nvarchar(100) NOT NULL,
    questionario_competencia_id uniqueidentifier NOT NULL,
    PRIMARY KEY (questionario_codigo, codigo_base)
);
INSERT INTO dbo.questionario_competencia (
    versao_questionario_id, versao_competencia_id, ordem
)
SELECT versoes.versao_questionario_id, origem.versao_competencia_id, origem.ordem
FROM @versoes_competencia AS origem
JOIN @versoes AS versoes ON versoes.codigo = origem.questionario_codigo;

INSERT INTO @questionario_competencias (questionario_codigo, codigo_base, questionario_competencia_id)
SELECT origem.questionario_codigo, origem.codigo_base, relacao.questionario_competencia_id
FROM @versoes_competencia AS origem
JOIN @versoes AS versoes ON versoes.codigo = origem.questionario_codigo
JOIN dbo.questionario_competencia AS relacao
  ON relacao.versao_questionario_id = versoes.versao_questionario_id
 AND relacao.versao_competencia_id = origem.versao_competencia_id;

INSERT INTO dbo.pergunta_questionario (
    questionario_competencia_id, codigo, texto, descricao, ordem, obrigatoria
)
SELECT relacao.questionario_competencia_id,
       origem.questionario_codigo + N'_' + origem.codigo_base + N'_PERGUNTA',
       origem.nome, origem.descricao, 1, 1
FROM @versoes_competencia AS origem
JOIN @questionario_competencias AS relacao
  ON relacao.questionario_codigo = origem.questionario_codigo
 AND relacao.codigo_base = origem.codigo_base;

DECLARE @opcoes TABLE (codigo nvarchar(100), rotulo nvarchar(200), ordem smallint, pontos smallint);
INSERT INTO @opcoes VALUES
    (N'ABAIXO_ESPERADO', N'Abaixo do esperado', 1, 80),
    (N'EM_DESENVOLVIMENTO', N'Em desenvolvimento', 2, 90),
    (N'DENTRO_EXPECTATIVAS', N'Dentro das expectativas', 3, 100),
    (N'SUPERA_EXPECTATIVAS', N'Supera as expectativas', 4, 110),
    (N'REFERENCIA', N'É referência', 5, 120);

INSERT INTO dbo.opcao_resposta (versao_questionario_id, codigo, rotulo, ordem, pontos)
SELECT versoes.versao_questionario_id, opcoes.codigo, opcoes.rotulo, opcoes.ordem, opcoes.pontos
FROM @versoes AS versoes CROSS JOIN @opcoes AS opcoes;

DECLARE @configuracao_calculo_id uniqueidentifier = NEWID();
INSERT INTO dbo.configuracao_calculo_versao (
    configuracao_calculo_versao_id, codigo, numero_versao, algoritmo, casas_decimais,
    modo_arredondamento, nota_minima, nota_maxima, exige_todas_perguntas, criado_por_usuario_id,
    aprovado_por_usuario_id, aprovado_em_utc
) VALUES (
    @configuracao_calculo_id, N'MEDIA_SIMPLES_2024_1', 1, 'MEDIA_SIMPLES', 1,
    'HALF_UP', 80.0, 120.0, 1, @ator_usuario_id, @ator_usuario_id, SYSUTCDATETIME()
);

DECLARE @matriz_classificacao_id uniqueidentifier = NEWID();
INSERT INTO dbo.matriz_classificacao_versao (
    matriz_classificacao_versao_id, configuracao_calculo_versao_id, codigo, numero_versao,
    criado_por_usuario_id, aprovado_por_usuario_id, aprovado_em_utc
) VALUES (
    @matriz_classificacao_id, @configuracao_calculo_id, N'GERAL', 1,
    @ator_usuario_id, @ator_usuario_id, SYSUTCDATETIME()
);

INSERT INTO dbo.faixa_classificacao (
    matriz_classificacao_versao_id, ordem, limite_inferior, limite_superior, classificacao, orientacao
) VALUES
    (@matriz_classificacao_id, 1, 80.0, 84.9, 'ABAIXO_ESPERADO', N'Desenvolver'),
    (@matriz_classificacao_id, 2, 85.0, 94.9, 'EM_DESENVOLVIMENTO', N'Entender os porquês'),
    (@matriz_classificacao_id, 3, 95.0, 104.9, 'DENTRO_EXPECTATIVAS', N'Acelerar e desenvolver'),
    (@matriz_classificacao_id, 4, 105.0, 114.9, 'SUPERA_EXPECTATIVAS', N'Manter e impulsionar'),
    (@matriz_classificacao_id, 5, 115.0, 120.0, 'REFERENCIA', N'Reter e engajar');

UPDATE versao
SET aprovado_por_usuario_id = @ator_usuario_id, aprovado_em_utc = SYSUTCDATETIME()
FROM dbo.versao_questionario AS versao
JOIN @versoes AS origem ON origem.versao_questionario_id = versao.versao_questionario_id;

INSERT INTO dbo.evento_auditoria (ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido)
SELECT @ator_usuario_id, 'CATALOGO.INICIAL.QUESTIONARIO', 'VERSAO_QUESTIONARIO', versao_questionario_id,
       'SUCESSO', 'MIGRACAO-V0010', N'Catálogo 2024.1 inicial carregado.'
FROM @versoes;

/*
 * Massa de demonstração local. Execute somente por comando explícito e nunca
 * pelo runner de migrations. A carga recusa qualquer banco que não seja o
 * AVALIACAO_DEV e não altera dados que já tenham sido semeados.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'AVALIACAO_DEV'
    THROW 51210, N'Esta massa de demonstração só pode ser executada em AVALIACAO_DEV.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0010'
      AND script_name = N'V0010__catalogo_inicial_rodogarcia_2024_1'
)
    THROW 51211, N'A massa de demonstração exige o catálogo V0010 aplicado.', 1;

IF EXISTS (SELECT 1 FROM dbo.ciclo_avaliacao WHERE codigo = N'DEV-DEMO-2026')
BEGIN
    SELECT N'MASSA_DEV_JA_EXISTE' AS resultado;
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @ator_usuario_id uniqueidentifier = (
        SELECT TOP (1) usuario_id
        FROM dbo.usuario
        WHERE administrador_supremo = 1
          AND situacao = 'ATIVO'
          AND excluido_logicamente = 0
        ORDER BY criado_em_utc, usuario_id
    );

    IF @ator_usuario_id IS NULL
        THROW 51212, N'A massa de demonstração exige um administrador supremo ativo no ambiente DEV.', 1;

    DECLARE @configuracao_calculo_versao_id uniqueidentifier = (
        SELECT configuracao_calculo_versao_id
        FROM dbo.configuracao_calculo_versao
        WHERE codigo = N'MEDIA_SIMPLES_2024_1'
          AND numero_versao = 1
    );
    DECLARE @matriz_classificacao_versao_id uniqueidentifier = (
        SELECT matriz_classificacao_versao_id
        FROM dbo.matriz_classificacao_versao
        WHERE codigo = N'GERAL'
          AND numero_versao = 1
          AND configuracao_calculo_versao_id = @configuracao_calculo_versao_id
    );

    IF @configuracao_calculo_versao_id IS NULL OR @matriz_classificacao_versao_id IS NULL
        THROW 51213, N'A configuração de cálculo ou a matriz 2024.1 não está disponível.', 1;

    INSERT INTO dbo.filial (nome, ativa)
    VALUES (N'Filial demonstração DEV', 1);

    INSERT INTO dbo.area (nome, ativa)
    VALUES (N'Área demonstração DEV', 1);

    DECLARE @filial_id uniqueidentifier = (
        SELECT filial_id FROM dbo.filial WHERE nome = N'Filial demonstração DEV'
    );
    DECLARE @area_id uniqueidentifier = (
        SELECT area_id FROM dbo.area WHERE nome = N'Área demonstração DEV'
    );

    DECLARE @pessoas TABLE (
        ordem tinyint NOT NULL PRIMARY KEY,
        nome nvarchar(200) NOT NULL UNIQUE,
        questionario_codigo nvarchar(100) NOT NULL,
        situacao_gestor varchar(16) NULL,
        pontos smallint NULL,
        comentario nvarchar(2000) NULL,
        plano_acao nvarchar(2000) NULL,
        colaborador_id uniqueidentifier NULL,
        ciclo_questionario_id uniqueidentifier NULL,
        atribuicao_id uniqueidentifier NULL,
        vinculo_gestor_id uniqueidentifier NULL,
        vinculo_usuario_id uniqueidentifier NULL
    );

    INSERT INTO @pessoas (ordem, nome, questionario_codigo, situacao_gestor, pontos, comentario, plano_acao)
    VALUES
        (1, N'Pessoa fictícia 01 — abaixo', N'OPERACIONAL', 'PUBLICADA', 80, N'Comentário fictício: requer acompanhamento próximo.', N'Plano fictício: combinar rotina de desenvolvimento.'),
        (2, N'Pessoa fictícia 02 — desenvolvimento', N'OPERACIONAL', 'PUBLICADA', 90, N'Comentário fictício: apresenta evolução consistente.', N'Plano fictício: consolidar práticas da função.'),
        (3, N'Pessoa fictícia 03 — expectativas', N'OPERACIONAL', 'PUBLICADA', 100, N'Comentário fictício: atende às expectativas atuais.', N'Plano fictício: ampliar repertório técnico.'),
        (4, N'Pessoa fictícia 04 — supera', N'OPERACIONAL', 'PUBLICADA', 110, N'Comentário fictício: supera a entrega esperada.', N'Plano fictício: compartilhar boas práticas com a equipe.'),
        (5, N'Pessoa fictícia 05 — referência', N'OPERACIONAL', 'PUBLICADA', 120, N'Comentário fictício: referência fictícia para o time.', N'Plano fictício: manter engajamento e protagonismo.'),
        (6, N'Pessoa fictícia 06 — equilíbrio', N'OPERACIONAL', 'PUBLICADA', 100, N'Comentário fictício: desempenho equilibrado.', N'Plano fictício: acelerar desenvolvimento direcionado.'),
        (7, N'Pessoa fictícia 07 — enviada', N'ADMINISTRATIVO', 'ENVIADA', 100, N'Comentário fictício para uma avaliação enviada.', N'Plano fictício: validar próximos passos.'),
        (8, N'Pessoa fictícia 08 — rascunho', N'LIDERANCA', 'RASCUNHO', 110, N'Comentário fictício em edição.', N'Plano fictício ainda em revisão.'),
        (9, N'Pessoa fictícia 09 — nova avaliação', N'ADMINISTRATIVO', NULL, NULL, NULL, NULL);

    INSERT INTO dbo.colaborador (nome_exibicao, ativo)
    SELECT nome, 1 FROM @pessoas;

    UPDATE pessoa
    SET colaborador_id = colaborador.colaborador_id
    FROM @pessoas AS pessoa
    JOIN dbo.colaborador AS colaborador ON colaborador.nome_exibicao = pessoa.nome;

    INSERT INTO dbo.colaborador (nome_exibicao, ativo)
    VALUES (N'Pessoa fictícia inativa — demonstração', 0);

    INSERT INTO dbo.lotacao_colaborador (
        colaborador_id, filial_id, area_id, gestor_texto_livre, inicio_vigencia, criado_por_usuario_id
    )
    SELECT colaborador_id, @filial_id, @area_id, N'Gestor de demonstração', '2026-01-01', @ator_usuario_id
    FROM @pessoas;

    INSERT INTO dbo.vinculo_gestor_colaborador (
        gestor_usuario_id, colaborador_id, inicio_vigencia, criado_por_usuario_id
    )
    SELECT @ator_usuario_id, colaborador_id, '2026-01-01', @ator_usuario_id
    FROM @pessoas;

    UPDATE pessoa
    SET vinculo_gestor_id = vinculo.vinculo_gestor_colaborador_id
    FROM @pessoas AS pessoa
    JOIN dbo.vinculo_gestor_colaborador AS vinculo
      ON vinculo.colaborador_id = pessoa.colaborador_id
     AND vinculo.gestor_usuario_id = @ator_usuario_id
     AND vinculo.revogado_em_utc IS NULL;

    DECLARE @colaborador_auto_id uniqueidentifier = (
        SELECT colaborador_id FROM @pessoas WHERE ordem = 7
    );
    DECLARE @vinculo_usuario_id uniqueidentifier = NEWID();

    INSERT INTO dbo.vinculo_usuario_colaborador (
        vinculo_usuario_colaborador_id, usuario_id, colaborador_id, inicio_vigencia, criado_por_usuario_id
    ) VALUES (
        @vinculo_usuario_id, @ator_usuario_id, @colaborador_auto_id, '2026-01-01', @ator_usuario_id
    );

    UPDATE @pessoas SET vinculo_usuario_id = @vinculo_usuario_id WHERE ordem = 7;

    DECLARE @ciclo_avaliacao_id uniqueidentifier = NEWID();
    INSERT INTO dbo.ciclo_avaliacao (
        ciclo_avaliacao_id, codigo, nome, situacao, janela_abertura_em_utc, janela_encerramento_em_utc,
        fuso_horario_iana, autoavaliacao_habilitada
    ) VALUES (
        @ciclo_avaliacao_id, N'DEV-DEMO-2026', N'Ciclo de demonstração DEV 2026', 'RASCUNHO',
        '2026-01-01T03:00:00.000', '2026-12-31T02:59:59.000', N'America/Sao_Paulo', 1
    );

    INSERT INTO dbo.ciclo_questionario (
        ciclo_avaliacao_id, versao_questionario_id, criado_por_usuario_id,
        configuracao_calculo_versao_id, matriz_classificacao_versao_id
    )
    SELECT @ciclo_avaliacao_id, versao.versao_questionario_id, @ator_usuario_id,
           @configuracao_calculo_versao_id, @matriz_classificacao_versao_id
    FROM dbo.questionario AS questionario
    JOIN dbo.versao_questionario AS versao
      ON versao.questionario_id = questionario.questionario_id
     AND versao.aprovado_em_utc IS NOT NULL
    WHERE questionario.codigo IN (N'LIDERANCA', N'ADMINISTRATIVO', N'OPERACIONAL');

    UPDATE pessoa
    SET ciclo_questionario_id = ciclo_questionario.ciclo_questionario_id
    FROM @pessoas AS pessoa
    JOIN dbo.questionario AS questionario ON questionario.codigo = pessoa.questionario_codigo
    JOIN dbo.versao_questionario AS versao
      ON versao.questionario_id = questionario.questionario_id
     AND versao.aprovado_em_utc IS NOT NULL
    JOIN dbo.ciclo_questionario AS ciclo_questionario
      ON ciclo_questionario.ciclo_avaliacao_id = @ciclo_avaliacao_id
     AND ciclo_questionario.versao_questionario_id = versao.versao_questionario_id;

    INSERT INTO dbo.atribuicao_questionario_colaborador (
        ciclo_avaliacao_id, colaborador_id, ciclo_questionario_id, atribuido_por_usuario_id
    )
    SELECT @ciclo_avaliacao_id, colaborador_id, ciclo_questionario_id, @ator_usuario_id
    FROM @pessoas;

    UPDATE pessoa
    SET atribuicao_id = atribuicao.atribuicao_questionario_colaborador_id
    FROM @pessoas AS pessoa
    JOIN dbo.atribuicao_questionario_colaborador AS atribuicao
      ON atribuicao.ciclo_avaliacao_id = @ciclo_avaliacao_id
     AND atribuicao.colaborador_id = pessoa.colaborador_id
     AND atribuicao.revogado_em_utc IS NULL;

    UPDATE dbo.ciclo_avaliacao
    SET situacao = 'ABERTO',
        aberto_por_usuario_id = @ator_usuario_id,
        aberto_em_utc = SYSUTCDATETIME(),
        atualizado_em_utc = SYSUTCDATETIME()
    WHERE ciclo_avaliacao_id = @ciclo_avaliacao_id;

    INSERT INTO dbo.transicao_ciclo_avaliacao (
        ciclo_avaliacao_id, situacao_origem, situacao_destino, ator_usuario_id, motivo_reduzido, request_id
    ) VALUES (
        @ciclo_avaliacao_id, 'RASCUNHO', 'ABERTO', @ator_usuario_id,
        N'Abertura da massa de demonstração DEV.', 'DEV-SEED-2026'
    );

    DECLARE @avaliacoes TABLE (
        avaliacao_id uniqueidentifier NOT NULL PRIMARY KEY,
        ciclo_questionario_id uniqueidentifier NOT NULL,
        colaborador_id uniqueidentifier NOT NULL,
        vinculo_gestor_id uniqueidentifier NULL,
        vinculo_usuario_id uniqueidentifier NULL,
        atribuicao_id uniqueidentifier NOT NULL,
        tipo varchar(20) NOT NULL,
        situacao varchar(16) NOT NULL,
        pontos smallint NOT NULL,
        comentario nvarchar(2000) NULL,
        plano_acao nvarchar(2000) NULL,
        versao_rascunho_id uniqueidentifier NOT NULL,
        versao_enviada_id uniqueidentifier NULL,
        versao_publicada_id uniqueidentifier NULL
    );

    INSERT INTO @avaliacoes (
        avaliacao_id, ciclo_questionario_id, colaborador_id, vinculo_gestor_id, vinculo_usuario_id,
        atribuicao_id, tipo, situacao, pontos, comentario, plano_acao,
        versao_rascunho_id, versao_enviada_id, versao_publicada_id
    )
    SELECT NEWID(), ciclo_questionario_id, colaborador_id, vinculo_gestor_id, NULL, atribuicao_id,
           'GESTOR', situacao_gestor, pontos, comentario, plano_acao, NEWID(),
           CASE WHEN situacao_gestor IN ('ENVIADA', 'PUBLICADA') THEN NEWID() END,
           CASE WHEN situacao_gestor = 'PUBLICADA' THEN NEWID() END
    FROM @pessoas
    WHERE situacao_gestor IS NOT NULL
    UNION ALL
    SELECT NEWID(), ciclo_questionario_id, colaborador_id, NULL, vinculo_usuario_id, atribuicao_id,
           'AUTOAVALIACAO', 'ENVIADA', 100,
           N'Autoavaliação fictícia para testar a jornada individual.',
           N'Plano fictício: acompanhar a evolução no próximo ciclo.', NEWID(), NEWID(), NULL
    FROM @pessoas
    WHERE ordem = 7;

    INSERT INTO dbo.avaliacao (
        avaliacao_id, ciclo_questionario_id, colaborador_id, avaliador_usuario_id,
        vinculo_gestor_colaborador_id, tipo_avaliacao, situacao, versao_atual_numero,
        criada_por_usuario_id, ciclo_avaliacao_id, vinculo_usuario_colaborador_id,
        atribuicao_questionario_colaborador_id
    )
    SELECT avaliacao_id, ciclo_questionario_id, colaborador_id, @ator_usuario_id,
           vinculo_gestor_id, tipo, situacao,
           CASE situacao WHEN 'PUBLICADA' THEN 3 WHEN 'ENVIADA' THEN 2 ELSE 1 END,
           @ator_usuario_id, @ciclo_avaliacao_id, vinculo_usuario_id, atribuicao_id
    FROM @avaliacoes;

    INSERT INTO dbo.versao_avaliacao (
        versao_avaliacao_id, avaliacao_id, ciclo_questionario_id, numero, situacao, origem,
        criada_por_usuario_id, comentario, plano_acao
    )
    SELECT versao_rascunho_id, avaliacao_id, ciclo_questionario_id, 1, 'RASCUNHO', 'CRIACAO',
           @ator_usuario_id, comentario, plano_acao
    FROM @avaliacoes;

    INSERT INTO dbo.resposta_avaliacao (
        versao_avaliacao_id, pergunta_questionario_id, opcao_resposta_id
    )
    SELECT avaliacao.versao_rascunho_id, pergunta.pergunta_questionario_id, opcao.opcao_resposta_id
    FROM @avaliacoes AS avaliacao
    JOIN dbo.ciclo_questionario AS ciclo_questionario
      ON ciclo_questionario.ciclo_questionario_id = avaliacao.ciclo_questionario_id
    JOIN dbo.questionario_competencia AS competencia
      ON competencia.versao_questionario_id = ciclo_questionario.versao_questionario_id
    JOIN dbo.pergunta_questionario AS pergunta
      ON pergunta.questionario_competencia_id = competencia.questionario_competencia_id
    JOIN dbo.opcao_resposta AS opcao
      ON opcao.versao_questionario_id = ciclo_questionario.versao_questionario_id
     AND opcao.pontos = CASE
            -- Os cinco primeiros perfis são propositalmente variados para que o radar
            -- permita comparar pontos fortes e oportunidades, sem sair da faixa da pessoa.
            WHEN avaliacao.pontos = 80 THEN
                CASE WHEN (competencia.ordem - 1) % 5 = 4 THEN 90 ELSE 80 END
            WHEN avaliacao.pontos = 90 THEN
                CASE (competencia.ordem - 1) % 5 WHEN 0 THEN 80 WHEN 4 THEN 100 ELSE 90 END
            WHEN avaliacao.pontos = 100 THEN
                CASE (competencia.ordem - 1) % 5 WHEN 0 THEN 90 WHEN 4 THEN 110 ELSE 100 END
            WHEN avaliacao.pontos = 110 THEN
                CASE (competencia.ordem - 1) % 5 WHEN 0 THEN 100 WHEN 4 THEN 120 ELSE 110 END
            WHEN avaliacao.pontos = 120 THEN
                CASE WHEN (competencia.ordem - 1) % 5 = 0 THEN 110 ELSE 120 END
        END;

    INSERT INTO dbo.versao_avaliacao (
        versao_avaliacao_id, avaliacao_id, ciclo_questionario_id, numero, situacao, origem,
        criada_por_usuario_id, comentario, plano_acao
    )
    SELECT versao_enviada_id, avaliacao_id, ciclo_questionario_id, 2, 'ENVIADA', 'ENVIO',
           @ator_usuario_id, comentario, plano_acao
    FROM @avaliacoes
    WHERE versao_enviada_id IS NOT NULL;

    INSERT INTO dbo.resposta_avaliacao (
        versao_avaliacao_id, pergunta_questionario_id, opcao_resposta_id
    )
    SELECT avaliacao.versao_enviada_id, resposta.pergunta_questionario_id, resposta.opcao_resposta_id
    FROM @avaliacoes AS avaliacao
    JOIN dbo.resposta_avaliacao AS resposta
      ON resposta.versao_avaliacao_id = avaliacao.versao_rascunho_id
    WHERE avaliacao.versao_enviada_id IS NOT NULL;

    INSERT INTO dbo.versao_avaliacao (
        versao_avaliacao_id, avaliacao_id, ciclo_questionario_id, numero, situacao, origem,
        criada_por_usuario_id, comentario, plano_acao
    )
    SELECT versao_publicada_id, avaliacao_id, ciclo_questionario_id, 3, 'PUBLICADA', 'PUBLICACAO',
           @ator_usuario_id, comentario, plano_acao
    FROM @avaliacoes
    WHERE versao_publicada_id IS NOT NULL;

    INSERT INTO dbo.resposta_avaliacao (
        versao_avaliacao_id, pergunta_questionario_id, opcao_resposta_id
    )
    SELECT avaliacao.versao_publicada_id, resposta.pergunta_questionario_id, resposta.opcao_resposta_id
    FROM @avaliacoes AS avaliacao
    JOIN dbo.resposta_avaliacao AS resposta
      ON resposta.versao_avaliacao_id = avaliacao.versao_enviada_id
    WHERE avaliacao.versao_publicada_id IS NOT NULL;

    ;WITH resultados AS (
        SELECT avaliacao.avaliacao_id,
               avaliacao.ciclo_questionario_id,
               avaliacao.versao_enviada_id AS versao_avaliacao_id,
               SUM(opcao.pontos) AS soma_pontos,
               COUNT(*) AS quantidade_respostas,
               CAST(ROUND(CONVERT(decimal(9, 2), SUM(opcao.pontos)) / COUNT(*), 1) AS decimal(5, 1)) AS nota_final
        FROM @avaliacoes AS avaliacao
        JOIN dbo.resposta_avaliacao AS resposta
          ON resposta.versao_avaliacao_id = avaliacao.versao_enviada_id
        JOIN dbo.opcao_resposta AS opcao ON opcao.opcao_resposta_id = resposta.opcao_resposta_id
        WHERE avaliacao.versao_enviada_id IS NOT NULL
        GROUP BY avaliacao.avaliacao_id, avaliacao.ciclo_questionario_id, avaliacao.versao_enviada_id
    )
    INSERT INTO dbo.resultado_avaliacao (
        avaliacao_id, versao_avaliacao_id, configuracao_calculo_versao_id,
        matriz_classificacao_versao_id, soma_pontos, quantidade_respostas, nota_final, classificacao
    )
    SELECT resultado.avaliacao_id, resultado.versao_avaliacao_id,
           ciclo_questionario.configuracao_calculo_versao_id,
           ciclo_questionario.matriz_classificacao_versao_id,
           resultado.soma_pontos, resultado.quantidade_respostas, resultado.nota_final,
           CASE
               WHEN resultado.nota_final >= 115.0 THEN 'REFERENCIA'
               WHEN resultado.nota_final >= 105.0 THEN 'SUPERA_EXPECTATIVAS'
               WHEN resultado.nota_final >= 95.0 THEN 'DENTRO_EXPECTATIVAS'
               WHEN resultado.nota_final >= 85.0 THEN 'EM_DESENVOLVIMENTO'
               ELSE 'ABAIXO_ESPERADO'
           END
    FROM resultados AS resultado
    JOIN dbo.ciclo_questionario AS ciclo_questionario
      ON ciclo_questionario.ciclo_questionario_id = resultado.ciclo_questionario_id;

    ;WITH resultados AS (
        SELECT avaliacao.avaliacao_id,
               avaliacao.ciclo_questionario_id,
               avaliacao.versao_publicada_id AS versao_avaliacao_id,
               SUM(opcao.pontos) AS soma_pontos,
               COUNT(*) AS quantidade_respostas,
               CAST(ROUND(CONVERT(decimal(9, 2), SUM(opcao.pontos)) / COUNT(*), 1) AS decimal(5, 1)) AS nota_final
        FROM @avaliacoes AS avaliacao
        JOIN dbo.resposta_avaliacao AS resposta
          ON resposta.versao_avaliacao_id = avaliacao.versao_publicada_id
        JOIN dbo.opcao_resposta AS opcao ON opcao.opcao_resposta_id = resposta.opcao_resposta_id
        WHERE avaliacao.versao_publicada_id IS NOT NULL
        GROUP BY avaliacao.avaliacao_id, avaliacao.ciclo_questionario_id, avaliacao.versao_publicada_id
    )
    INSERT INTO dbo.resultado_avaliacao (
        avaliacao_id, versao_avaliacao_id, configuracao_calculo_versao_id,
        matriz_classificacao_versao_id, soma_pontos, quantidade_respostas, nota_final, classificacao
    )
    SELECT resultado.avaliacao_id, resultado.versao_avaliacao_id,
           ciclo_questionario.configuracao_calculo_versao_id,
           ciclo_questionario.matriz_classificacao_versao_id,
           resultado.soma_pontos, resultado.quantidade_respostas, resultado.nota_final,
           CASE
               WHEN resultado.nota_final >= 115.0 THEN 'REFERENCIA'
               WHEN resultado.nota_final >= 105.0 THEN 'SUPERA_EXPECTATIVAS'
               WHEN resultado.nota_final >= 95.0 THEN 'DENTRO_EXPECTATIVAS'
               WHEN resultado.nota_final >= 85.0 THEN 'EM_DESENVOLVIMENTO'
               ELSE 'ABAIXO_ESPERADO'
           END
    FROM resultados AS resultado
    JOIN dbo.ciclo_questionario AS ciclo_questionario
      ON ciclo_questionario.ciclo_questionario_id = resultado.ciclo_questionario_id;

    INSERT INTO dbo.transicao_avaliacao (
        avaliacao_id, versao_avaliacao_id, situacao_origem, situacao_destino, acao, ator_usuario_id, request_id
    )
    SELECT avaliacao_id, versao_rascunho_id, NULL, 'RASCUNHO', 'CRIACAO', @ator_usuario_id, 'DEV-SEED-2026'
    FROM @avaliacoes;

    INSERT INTO dbo.transicao_avaliacao (
        avaliacao_id, versao_avaliacao_id, situacao_origem, situacao_destino, acao, ator_usuario_id, request_id
    )
    SELECT avaliacao_id, versao_enviada_id, 'RASCUNHO', 'ENVIADA', 'ENVIO', @ator_usuario_id, 'DEV-SEED-2026'
    FROM @avaliacoes
    WHERE versao_enviada_id IS NOT NULL;

    INSERT INTO dbo.transicao_avaliacao (
        avaliacao_id, versao_avaliacao_id, situacao_origem, situacao_destino, acao, ator_usuario_id, request_id
    )
    SELECT avaliacao_id, versao_publicada_id, 'ENVIADA', 'PUBLICADA', 'PUBLICACAO', @ator_usuario_id, 'DEV-SEED-2026'
    FROM @avaliacoes
    WHERE versao_publicada_id IS NOT NULL;

    INSERT INTO dbo.evento_auditoria (
        ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
    ) VALUES (
        @ator_usuario_id, 'DADOS_TESTE.POPULAR', 'CICLO_AVALIACAO', @ciclo_avaliacao_id, 'SUCESSO',
        'DEV-SEED-2026', N'Massa fictícia de demonstração criada somente no AVALIACAO_DEV.'
    );

    COMMIT TRANSACTION;

    SELECT
        N'MASSA_DEV_CRIADA' AS resultado,
        (SELECT COUNT(*) FROM @pessoas) AS colaboradores_ativos_ficticios,
        (SELECT COUNT(*) FROM dbo.avaliacao WHERE ciclo_avaliacao_id = @ciclo_avaliacao_id) AS avaliacoes_ficticias,
        (SELECT COUNT(*) FROM dbo.avaliacao WHERE ciclo_avaliacao_id = @ciclo_avaliacao_id AND situacao = 'PUBLICADA') AS publicadas,
        (SELECT COUNT(*) FROM dbo.avaliacao WHERE ciclo_avaliacao_id = @ciclo_avaliacao_id AND situacao = 'ENVIADA') AS enviadas,
        (SELECT COUNT(*) FROM dbo.avaliacao WHERE ciclo_avaliacao_id = @ciclo_avaliacao_id AND situacao = 'RASCUNHO') AS rascunhos;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

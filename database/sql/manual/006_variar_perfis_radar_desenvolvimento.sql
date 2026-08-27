/* Cria somente em AVALIACAO_DEV cinco avaliações publicadas com variação por competência. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'AVALIACAO_DEV'
    THROW 51220, N'Esta massa de radar só pode ser executada em AVALIACAO_DEV.', 1;

IF EXISTS (SELECT 1 FROM dbo.ciclo_avaliacao WHERE codigo = N'DEV-RADAR-2026')
BEGIN
    SELECT N'MASSA_DEV_RADAR_JA_EXISTE' AS resultado;
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @ator_usuario_id uniqueidentifier = (
        SELECT TOP (1) usuario_id FROM dbo.usuario
        WHERE administrador_supremo = 1 AND situacao = 'ATIVO' AND excluido_logicamente = 0
        ORDER BY criado_em_utc, usuario_id
    );
    IF @ator_usuario_id IS NULL
        THROW 51221, N'A massa de radar exige um administrador supremo ativo no ambiente DEV.', 1;

    DECLARE @configuracao_calculo_versao_id uniqueidentifier = (
        SELECT configuracao_calculo_versao_id FROM dbo.configuracao_calculo_versao
        WHERE codigo = N'MEDIA_SIMPLES_2024_1' AND numero_versao = 1
    );
    DECLARE @matriz_classificacao_versao_id uniqueidentifier = (
        SELECT matriz_classificacao_versao_id FROM dbo.matriz_classificacao_versao
        WHERE codigo = N'GERAL' AND numero_versao = 1
          AND configuracao_calculo_versao_id = @configuracao_calculo_versao_id
    );
    DECLARE @versao_questionario_id uniqueidentifier = (
        SELECT TOP (1) versao.versao_questionario_id
        FROM dbo.questionario AS questionario
        INNER JOIN dbo.versao_questionario AS versao ON versao.questionario_id = questionario.questionario_id
        WHERE questionario.codigo = N'OPERACIONAL' AND versao.aprovado_em_utc IS NOT NULL
        ORDER BY versao.numero_versao DESC
    );
    IF @configuracao_calculo_versao_id IS NULL OR @matriz_classificacao_versao_id IS NULL OR @versao_questionario_id IS NULL
        THROW 51222, N'O catálogo 2024.1 necessário para a massa de radar não está disponível.', 1;

    DECLARE @perfis TABLE (
        nome nvarchar(200) NOT NULL PRIMARY KEY, perfil tinyint NOT NULL,
        colaborador_id uniqueidentifier NULL, vinculo_gestor_id uniqueidentifier NULL, atribuicao_id uniqueidentifier NULL
    );
    INSERT INTO @perfis (nome, perfil) VALUES
        (N'Pessoa fictícia 01 — abaixo', 1),
        (N'Pessoa fictícia 02 — desenvolvimento', 2),
        (N'Pessoa fictícia 03 — expectativas', 3),
        (N'Pessoa fictícia 04 — supera', 4),
        (N'Pessoa fictícia 05 — referência', 5);

    UPDATE perfil SET colaborador_id = colaborador.colaborador_id
    FROM @perfis AS perfil
    INNER JOIN dbo.colaborador AS colaborador ON colaborador.nome_exibicao = perfil.nome
    WHERE colaborador.ativo = 1;
    IF (SELECT COUNT(*) FROM @perfis WHERE colaborador_id IS NOT NULL) <> 5
        THROW 51223, N'Os cinco colaboradores fictícios esperados não foram localizados no DEV.', 1;

    DECLARE @ciclo_avaliacao_id uniqueidentifier = NEWID();
    INSERT INTO dbo.ciclo_avaliacao (
        ciclo_avaliacao_id, codigo, nome, situacao, janela_abertura_em_utc, janela_encerramento_em_utc,
        fuso_horario_iana, autoavaliacao_habilitada, aberto_por_usuario_id, aberto_em_utc
    ) VALUES (
        @ciclo_avaliacao_id, N'DEV-RADAR-2026', N'Demonstração DEV — radar com 5 perfis', 'RASCUNHO',
        '2026-01-01T03:00:00.000', '2026-12-31T02:59:59.000', N'America/Sao_Paulo', 0, NULL, NULL
    );

    DECLARE @ciclo_questionario_id uniqueidentifier = NEWID();
    INSERT INTO dbo.ciclo_questionario (
        ciclo_questionario_id, ciclo_avaliacao_id, versao_questionario_id, criado_por_usuario_id,
        configuracao_calculo_versao_id, matriz_classificacao_versao_id
    ) VALUES (
        @ciclo_questionario_id, @ciclo_avaliacao_id, @versao_questionario_id, @ator_usuario_id,
        @configuracao_calculo_versao_id, @matriz_classificacao_versao_id
    );
    INSERT INTO dbo.atribuicao_questionario_colaborador (
        ciclo_avaliacao_id, colaborador_id, ciclo_questionario_id, atribuido_por_usuario_id
    ) SELECT @ciclo_avaliacao_id, colaborador_id, @ciclo_questionario_id, @ator_usuario_id FROM @perfis;

    UPDATE perfil
    SET atribuicao_id = atribuicao.atribuicao_questionario_colaborador_id,
        vinculo_gestor_id = vinculo.vinculo_gestor_colaborador_id
    FROM @perfis AS perfil
    INNER JOIN dbo.atribuicao_questionario_colaborador AS atribuicao
        ON atribuicao.ciclo_avaliacao_id = @ciclo_avaliacao_id AND atribuicao.colaborador_id = perfil.colaborador_id AND atribuicao.revogado_em_utc IS NULL
    INNER JOIN dbo.vinculo_gestor_colaborador AS vinculo
        ON vinculo.colaborador_id = perfil.colaborador_id AND vinculo.gestor_usuario_id = @ator_usuario_id AND vinculo.revogado_em_utc IS NULL;
    IF (SELECT COUNT(*) FROM @perfis WHERE atribuicao_id IS NOT NULL AND vinculo_gestor_id IS NOT NULL) <> 5
        THROW 51224, N'As atribuições ou vínculos dos cinco perfis fictícios não estão íntegros.', 1;

    UPDATE dbo.ciclo_avaliacao
    SET situacao = 'ABERTO', aberto_por_usuario_id = @ator_usuario_id, aberto_em_utc = SYSUTCDATETIME(),
        atualizado_em_utc = SYSUTCDATETIME()
    WHERE ciclo_avaliacao_id = @ciclo_avaliacao_id;
    INSERT INTO dbo.transicao_ciclo_avaliacao (
        ciclo_avaliacao_id, situacao_origem, situacao_destino, ator_usuario_id, motivo_reduzido, request_id
    ) VALUES (@ciclo_avaliacao_id, 'RASCUNHO', 'ABERTO', @ator_usuario_id, N'Abertura da massa de radar DEV.', 'DEV-SEED-RADAR-2026');

    DECLARE @avaliacoes TABLE (
        avaliacao_id uniqueidentifier NOT NULL PRIMARY KEY, perfil tinyint NOT NULL, colaborador_id uniqueidentifier NOT NULL,
        vinculo_gestor_id uniqueidentifier NOT NULL, atribuicao_id uniqueidentifier NOT NULL,
        versao_rascunho_id uniqueidentifier NOT NULL, versao_enviada_id uniqueidentifier NOT NULL, versao_publicada_id uniqueidentifier NOT NULL
    );
    INSERT INTO @avaliacoes (avaliacao_id, perfil, colaborador_id, vinculo_gestor_id, atribuicao_id, versao_rascunho_id, versao_enviada_id, versao_publicada_id)
    SELECT NEWID(), perfil, colaborador_id, vinculo_gestor_id, atribuicao_id, NEWID(), NEWID(), NEWID() FROM @perfis;

    INSERT INTO dbo.avaliacao (
        avaliacao_id, ciclo_questionario_id, colaborador_id, avaliador_usuario_id, vinculo_gestor_colaborador_id,
        tipo_avaliacao, situacao, versao_atual_numero, criada_por_usuario_id, ciclo_avaliacao_id, atribuicao_questionario_colaborador_id
    ) SELECT avaliacao_id, @ciclo_questionario_id, colaborador_id, @ator_usuario_id, vinculo_gestor_id,
             'GESTOR', 'PUBLICADA', 3, @ator_usuario_id, @ciclo_avaliacao_id, atribuicao_id FROM @avaliacoes;

    INSERT INTO dbo.versao_avaliacao (
        versao_avaliacao_id, avaliacao_id, ciclo_questionario_id, numero, situacao, origem, criada_por_usuario_id, comentario, plano_acao
    ) SELECT versao_rascunho_id, avaliacao_id, @ciclo_questionario_id, 1, 'RASCUNHO', 'CRIACAO', @ator_usuario_id,
             N'Comentário fictício para comparação de perfil.', N'Plano fictício: acompanhar os pontos destacados no radar.' FROM @avaliacoes;

    INSERT INTO dbo.resposta_avaliacao (versao_avaliacao_id, pergunta_questionario_id, opcao_resposta_id)
    SELECT avaliacao.versao_rascunho_id, pergunta.pergunta_questionario_id, opcao.opcao_resposta_id
    FROM @avaliacoes AS avaliacao
    INNER JOIN dbo.questionario_competencia AS competencia ON competencia.versao_questionario_id = @versao_questionario_id
    INNER JOIN dbo.pergunta_questionario AS pergunta ON pergunta.questionario_competencia_id = competencia.questionario_competencia_id
    INNER JOIN dbo.opcao_resposta AS opcao ON opcao.versao_questionario_id = @versao_questionario_id
      AND opcao.pontos = CASE avaliacao.perfil
        WHEN 1 THEN CASE WHEN (competencia.ordem - 1) % 5 = 4 THEN 90 ELSE 80 END
        WHEN 2 THEN CASE (competencia.ordem - 1) % 5 WHEN 0 THEN 80 WHEN 4 THEN 100 ELSE 90 END
        WHEN 3 THEN CASE (competencia.ordem - 1) % 5 WHEN 0 THEN 90 WHEN 4 THEN 110 ELSE 100 END
        WHEN 4 THEN CASE (competencia.ordem - 1) % 5 WHEN 0 THEN 100 WHEN 4 THEN 120 ELSE 110 END
        WHEN 5 THEN CASE WHEN (competencia.ordem - 1) % 5 = 0 THEN 110 ELSE 120 END END;

    INSERT INTO dbo.versao_avaliacao (
        versao_avaliacao_id, avaliacao_id, ciclo_questionario_id, numero, situacao, origem, criada_por_usuario_id, comentario, plano_acao
    ) SELECT versao_enviada_id, avaliacao_id, @ciclo_questionario_id, 2, 'ENVIADA', 'ENVIO', @ator_usuario_id,
             N'Comentário fictício para comparação de perfil.', N'Plano fictício: acompanhar os pontos destacados no radar.' FROM @avaliacoes
    UNION ALL
    SELECT versao_publicada_id, avaliacao_id, @ciclo_questionario_id, 3, 'PUBLICADA', 'PUBLICACAO', @ator_usuario_id,
           N'Comentário fictício para comparação de perfil.', N'Plano fictício: acompanhar os pontos destacados no radar.' FROM @avaliacoes;

    INSERT INTO dbo.resposta_avaliacao (versao_avaliacao_id, pergunta_questionario_id, opcao_resposta_id)
    SELECT destino.versao_avaliacao_id, resposta.pergunta_questionario_id, resposta.opcao_resposta_id
    FROM @avaliacoes AS avaliacao
    CROSS APPLY (VALUES (avaliacao.versao_enviada_id), (avaliacao.versao_publicada_id)) AS destino(versao_avaliacao_id)
    INNER JOIN dbo.resposta_avaliacao AS resposta ON resposta.versao_avaliacao_id = avaliacao.versao_rascunho_id;

    ;WITH resultados AS (
        SELECT avaliacao.avaliacao_id, versao.versao_avaliacao_id, SUM(opcao.pontos) AS soma_pontos, COUNT(*) AS quantidade_respostas,
               CAST(ROUND(CONVERT(decimal(9, 2), SUM(opcao.pontos)) / COUNT(*), 1) AS decimal(5, 1)) AS nota_final
        FROM @avaliacoes AS avaliacao
        CROSS APPLY (VALUES (avaliacao.versao_enviada_id), (avaliacao.versao_publicada_id)) AS versao(versao_avaliacao_id)
        INNER JOIN dbo.resposta_avaliacao AS resposta ON resposta.versao_avaliacao_id = versao.versao_avaliacao_id
        INNER JOIN dbo.opcao_resposta AS opcao ON opcao.opcao_resposta_id = resposta.opcao_resposta_id
        GROUP BY avaliacao.avaliacao_id, versao.versao_avaliacao_id
    )
    INSERT INTO dbo.resultado_avaliacao (
        avaliacao_id, versao_avaliacao_id, configuracao_calculo_versao_id, matriz_classificacao_versao_id,
        soma_pontos, quantidade_respostas, nota_final, classificacao
    ) SELECT avaliacao_id, versao_avaliacao_id, @configuracao_calculo_versao_id, @matriz_classificacao_versao_id,
             soma_pontos, quantidade_respostas, nota_final, CASE
                WHEN nota_final >= 115.0 THEN 'REFERENCIA' WHEN nota_final >= 105.0 THEN 'SUPERA_EXPECTATIVAS'
                WHEN nota_final >= 95.0 THEN 'DENTRO_EXPECTATIVAS' WHEN nota_final >= 85.0 THEN 'EM_DESENVOLVIMENTO'
                ELSE 'ABAIXO_ESPERADO' END FROM resultados;

    INSERT INTO dbo.transicao_avaliacao (
        avaliacao_id, versao_avaliacao_id, situacao_origem, situacao_destino, acao, ator_usuario_id, request_id
    ) SELECT avaliacao_id, versao_rascunho_id, NULL, 'RASCUNHO', 'CRIACAO', @ator_usuario_id, 'DEV-SEED-RADAR-2026' FROM @avaliacoes
      UNION ALL SELECT avaliacao_id, versao_enviada_id, 'RASCUNHO', 'ENVIADA', 'ENVIO', @ator_usuario_id, 'DEV-SEED-RADAR-2026' FROM @avaliacoes
      UNION ALL SELECT avaliacao_id, versao_publicada_id, 'ENVIADA', 'PUBLICADA', 'PUBLICACAO', @ator_usuario_id, 'DEV-SEED-RADAR-2026' FROM @avaliacoes;

    INSERT INTO dbo.evento_auditoria (ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido)
    VALUES (@ator_usuario_id, 'DADOS_TESTE.POPULAR_RADAR', 'CICLO_AVALIACAO', @ciclo_avaliacao_id, 'SUCESSO', 'DEV-SEED-RADAR-2026',
            N'Massa fictícia de cinco perfis variados criada somente no AVALIACAO_DEV.');
    COMMIT TRANSACTION;
    SELECT N'MASSA_DEV_RADAR_CRIADA' AS resultado, 5 AS perfis_publicados_variados;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

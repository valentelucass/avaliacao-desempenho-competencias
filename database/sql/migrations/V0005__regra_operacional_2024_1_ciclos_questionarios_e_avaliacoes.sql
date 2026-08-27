IF EXISTS (
    SELECT 1 FROM dbo.vinculo_gestor_colaborador
    UNION ALL SELECT 1 FROM dbo.questionario
    UNION ALL SELECT 1 FROM dbo.versao_questionario
    UNION ALL SELECT 1 FROM dbo.questionario_competencia
    UNION ALL SELECT 1 FROM dbo.pergunta_questionario
    UNION ALL SELECT 1 FROM dbo.opcao_resposta
    UNION ALL SELECT 1 FROM dbo.ciclo_avaliacao
    UNION ALL SELECT 1 FROM dbo.ciclo_questionario
    UNION ALL SELECT 1 FROM dbo.avaliacao
    UNION ALL SELECT 1 FROM dbo.versao_avaliacao
    UNION ALL SELECT 1 FROM dbo.resposta_avaliacao
    UNION ALL SELECT 1 FROM dbo.transicao_avaliacao
)
    THROW 51080, N'A regra 2024.1 exige estruturas de dominio vazias para adicionar configuracao versionada sem inferir valores historicos.', 1;

CREATE TABLE dbo.vinculo_usuario_colaborador (
    vinculo_usuario_colaborador_id uniqueidentifier NOT NULL
        CONSTRAINT DF_vinculo_usuario_colaborador_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_vinculo_usuario_colaborador PRIMARY KEY,
    usuario_id uniqueidentifier NOT NULL,
    colaborador_id uniqueidentifier NOT NULL,
    inicio_vigencia date NOT NULL,
    fim_vigencia date NULL,
    criado_por_usuario_id uniqueidentifier NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_vinculo_usuario_colaborador_criado_em_utc DEFAULT SYSUTCDATETIME(),
    encerrado_por_usuario_id uniqueidentifier NULL,
    encerrado_em_utc datetime2(3) NULL,
    row_version rowversion,
    CONSTRAINT UQ_vinculo_usuario_colaborador_relacao UNIQUE (
        vinculo_usuario_colaborador_id,
        usuario_id,
        colaborador_id
    ),
    CONSTRAINT FK_vinculo_usuario_colaborador_usuario
        FOREIGN KEY (usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_vinculo_usuario_colaborador_colaborador
        FOREIGN KEY (colaborador_id) REFERENCES dbo.colaborador (colaborador_id),
    CONSTRAINT FK_vinculo_usuario_colaborador_criado_por
        FOREIGN KEY (criado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_vinculo_usuario_colaborador_encerrado_por
        FOREIGN KEY (encerrado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_vinculo_usuario_colaborador_vigencia CHECK (
        fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia
    ),
    CONSTRAINT CK_vinculo_usuario_colaborador_encerramento CHECK (
        (encerrado_por_usuario_id IS NULL AND encerrado_em_utc IS NULL)
        OR (encerrado_por_usuario_id IS NOT NULL AND encerrado_em_utc IS NOT NULL)
    )
);

CREATE UNIQUE INDEX UX_vinculo_usuario_colaborador_usuario_ativo
    ON dbo.vinculo_usuario_colaborador (usuario_id)
    WHERE encerrado_em_utc IS NULL;

CREATE UNIQUE INDEX UX_vinculo_usuario_colaborador_colaborador_ativo
    ON dbo.vinculo_usuario_colaborador (colaborador_id)
    WHERE encerrado_em_utc IS NULL;

CREATE UNIQUE INDEX UX_vinculo_gestor_colaborador_colaborador_ativo
    ON dbo.vinculo_gestor_colaborador (colaborador_id)
    WHERE revogado_em_utc IS NULL;

CREATE TABLE dbo.configuracao_calculo_versao (
    configuracao_calculo_versao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_configuracao_calculo_versao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_configuracao_calculo_versao PRIMARY KEY,
    codigo nvarchar(100) NOT NULL,
    numero_versao int NOT NULL,
    algoritmo varchar(32) NOT NULL,
    casas_decimais tinyint NOT NULL,
    modo_arredondamento varchar(16) NOT NULL,
    nota_minima decimal(5, 1) NOT NULL,
    nota_maxima decimal(5, 1) NOT NULL,
    exige_todas_perguntas bit NOT NULL,
    criado_por_usuario_id uniqueidentifier NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_configuracao_calculo_versao_criado_em_utc DEFAULT SYSUTCDATETIME(),
    aprovado_por_usuario_id uniqueidentifier NULL,
    aprovado_em_utc datetime2(3) NULL,
    CONSTRAINT UQ_configuracao_calculo_versao_codigo UNIQUE (codigo, numero_versao),
    CONSTRAINT FK_configuracao_calculo_versao_criado_por
        FOREIGN KEY (criado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_configuracao_calculo_versao_aprovado_por
        FOREIGN KEY (aprovado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_configuracao_calculo_versao_codigo_nao_vazio CHECK (
        LEN(LTRIM(RTRIM(codigo))) > 0
    ),
    CONSTRAINT CK_configuracao_calculo_versao_numero CHECK (numero_versao >= 1),
    CONSTRAINT CK_configuracao_calculo_versao_algoritmo CHECK (
        algoritmo = 'MEDIA_SIMPLES'
    ),
    CONSTRAINT CK_configuracao_calculo_versao_casas_decimais CHECK (
        casas_decimais = 1
    ),
    CONSTRAINT CK_configuracao_calculo_versao_arredondamento CHECK (
        modo_arredondamento = 'HALF_UP'
    ),
    CONSTRAINT CK_configuracao_calculo_versao_limites CHECK (
        nota_minima = CONVERT(decimal(5, 1), 80.0)
        AND nota_maxima = CONVERT(decimal(5, 1), 120.0)
    ),
    CONSTRAINT CK_configuracao_calculo_versao_perguntas CHECK (
        exige_todas_perguntas = 1
    ),
    CONSTRAINT CK_configuracao_calculo_versao_aprovacao CHECK (
        (aprovado_por_usuario_id IS NULL AND aprovado_em_utc IS NULL)
        OR (aprovado_por_usuario_id IS NOT NULL AND aprovado_em_utc IS NOT NULL)
    )
);

CREATE TABLE dbo.matriz_classificacao_versao (
    matriz_classificacao_versao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_matriz_classificacao_versao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_matriz_classificacao_versao PRIMARY KEY,
    configuracao_calculo_versao_id uniqueidentifier NOT NULL,
    codigo nvarchar(100) NOT NULL,
    numero_versao int NOT NULL,
    criado_por_usuario_id uniqueidentifier NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_matriz_classificacao_versao_criado_em_utc DEFAULT SYSUTCDATETIME(),
    aprovado_por_usuario_id uniqueidentifier NULL,
    aprovado_em_utc datetime2(3) NULL,
    CONSTRAINT UQ_matriz_classificacao_versao_codigo UNIQUE (codigo, numero_versao),
    CONSTRAINT UQ_matriz_classificacao_versao_configuracao UNIQUE (
        matriz_classificacao_versao_id,
        configuracao_calculo_versao_id
    ),
    CONSTRAINT FK_matriz_classificacao_versao_configuracao
        FOREIGN KEY (configuracao_calculo_versao_id)
        REFERENCES dbo.configuracao_calculo_versao (configuracao_calculo_versao_id),
    CONSTRAINT FK_matriz_classificacao_versao_criado_por
        FOREIGN KEY (criado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_matriz_classificacao_versao_aprovado_por
        FOREIGN KEY (aprovado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_matriz_classificacao_versao_codigo_nao_vazio CHECK (
        LEN(LTRIM(RTRIM(codigo))) > 0
    ),
    CONSTRAINT CK_matriz_classificacao_versao_numero CHECK (numero_versao >= 1),
    CONSTRAINT CK_matriz_classificacao_versao_aprovacao CHECK (
        (aprovado_por_usuario_id IS NULL AND aprovado_em_utc IS NULL)
        OR (aprovado_por_usuario_id IS NOT NULL AND aprovado_em_utc IS NOT NULL)
    )
);

CREATE TABLE dbo.faixa_classificacao (
    faixa_classificacao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_faixa_classificacao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_faixa_classificacao PRIMARY KEY,
    matriz_classificacao_versao_id uniqueidentifier NOT NULL,
    ordem tinyint NOT NULL,
    limite_inferior decimal(5, 1) NOT NULL,
    limite_superior decimal(5, 1) NOT NULL,
    classificacao varchar(32) NOT NULL,
    orientacao nvarchar(200) NOT NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_faixa_classificacao_criado_em_utc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_faixa_classificacao_ordem UNIQUE (matriz_classificacao_versao_id, ordem),
    CONSTRAINT UQ_faixa_classificacao_classificacao UNIQUE (
        matriz_classificacao_versao_id,
        classificacao
    ),
    CONSTRAINT FK_faixa_classificacao_matriz
        FOREIGN KEY (matriz_classificacao_versao_id)
        REFERENCES dbo.matriz_classificacao_versao (matriz_classificacao_versao_id),
    CONSTRAINT CK_faixa_classificacao_ordem CHECK (ordem >= 1),
    CONSTRAINT CK_faixa_classificacao_limites CHECK (
        limite_inferior >= CONVERT(decimal(5, 1), 80.0)
        AND limite_superior <= CONVERT(decimal(5, 1), 120.0)
        AND limite_superior >= limite_inferior
    ),
    CONSTRAINT CK_faixa_classificacao_codigo CHECK (
        classificacao IN (
            'ABAIXO_ESPERADO',
            'EM_DESENVOLVIMENTO',
            'DENTRO_EXPECTATIVAS',
            'SUPERA_EXPECTATIVAS',
            'REFERENCIA'
        )
    ),
    CONSTRAINT CK_faixa_classificacao_orientacao_nao_vazia CHECK (
        LEN(LTRIM(RTRIM(orientacao))) > 0
    )
);

ALTER TABLE dbo.pergunta_questionario
    ADD obrigatoria bit NOT NULL;

ALTER TABLE dbo.opcao_resposta
    ADD pontos smallint NOT NULL;

-- O runner aplica cada migration em um único lote transacional. SQL Server compila
-- restrições contra o metadado que existia no início desse lote; por isso, toda
-- referência a uma coluna criada logo acima precisa ser compilada depois do ADD.
EXEC(N'ALTER TABLE dbo.opcao_resposta WITH CHECK
    ADD CONSTRAINT CK_opcao_resposta_pontos_2024_1 CHECK (
        pontos IN (80, 90, 100, 110, 120)
    );');

ALTER TABLE dbo.ciclo_avaliacao
    ADD fuso_horario_iana nvarchar(64) NOT NULL,
        autoavaliacao_habilitada bit NOT NULL;

EXEC(N'ALTER TABLE dbo.ciclo_avaliacao WITH CHECK
    ADD CONSTRAINT CK_ciclo_avaliacao_fuso_2024_1 CHECK (
        fuso_horario_iana = N''America/Sao_Paulo''
    );

ALTER TABLE dbo.ciclo_avaliacao WITH CHECK
    ADD CONSTRAINT CK_ciclo_avaliacao_janela_2024_1 CHECK (
        situacao = ''RASCUNHO''
        OR (
            janela_abertura_em_utc IS NOT NULL
            AND janela_encerramento_em_utc IS NOT NULL
            AND janela_encerramento_em_utc > janela_abertura_em_utc
        )
    );');

ALTER TABLE dbo.ciclo_questionario
    ADD configuracao_calculo_versao_id uniqueidentifier NOT NULL,
        matriz_classificacao_versao_id uniqueidentifier NOT NULL;

ALTER TABLE dbo.ciclo_questionario
    ADD CONSTRAINT UQ_ciclo_questionario_relacao UNIQUE (
        ciclo_questionario_id,
        ciclo_avaliacao_id
    );

EXEC(N'ALTER TABLE dbo.ciclo_questionario
    ADD CONSTRAINT FK_ciclo_questionario_configuracao
        FOREIGN KEY (configuracao_calculo_versao_id)
        REFERENCES dbo.configuracao_calculo_versao (configuracao_calculo_versao_id),
        CONSTRAINT FK_ciclo_questionario_matriz_configuracao
        FOREIGN KEY (
            matriz_classificacao_versao_id,
            configuracao_calculo_versao_id
        )
        REFERENCES dbo.matriz_classificacao_versao (
            matriz_classificacao_versao_id,
            configuracao_calculo_versao_id
        );');

ALTER TABLE dbo.avaliacao
    ALTER COLUMN vinculo_gestor_colaborador_id uniqueidentifier NULL;

ALTER TABLE dbo.avaliacao
    ADD ciclo_avaliacao_id uniqueidentifier NOT NULL,
        vinculo_usuario_colaborador_id uniqueidentifier NULL;

ALTER TABLE dbo.avaliacao NOCHECK CONSTRAINT CK_avaliacao_tipo;

ALTER TABLE dbo.avaliacao WITH CHECK
    ADD CONSTRAINT CK_avaliacao_tipo_2024_1 CHECK (
        tipo_avaliacao IN ('GESTOR', 'AUTOAVALIACAO')
    );

EXEC(N'ALTER TABLE dbo.avaliacao WITH CHECK
    ADD CONSTRAINT CK_avaliacao_relacao_por_tipo_2024_1 CHECK (
        (tipo_avaliacao = ''GESTOR''
            AND vinculo_gestor_colaborador_id IS NOT NULL
            AND vinculo_usuario_colaborador_id IS NULL)
        OR (tipo_avaliacao = ''AUTOAVALIACAO''
            AND vinculo_gestor_colaborador_id IS NULL
            AND vinculo_usuario_colaborador_id IS NOT NULL)
    );

ALTER TABLE dbo.avaliacao
    ADD CONSTRAINT FK_avaliacao_ciclo
        FOREIGN KEY (ciclo_avaliacao_id)
        REFERENCES dbo.ciclo_avaliacao (ciclo_avaliacao_id),
        CONSTRAINT FK_avaliacao_ciclo_questionario_ciclo
        FOREIGN KEY (ciclo_questionario_id, ciclo_avaliacao_id)
        REFERENCES dbo.ciclo_questionario (ciclo_questionario_id, ciclo_avaliacao_id),
        CONSTRAINT FK_avaliacao_vinculo_usuario_colaborador
        FOREIGN KEY (
            vinculo_usuario_colaborador_id,
            avaliador_usuario_id,
            colaborador_id
        )
        REFERENCES dbo.vinculo_usuario_colaborador (
            vinculo_usuario_colaborador_id,
            usuario_id,
            colaborador_id
        ),
        CONSTRAINT UQ_avaliacao_ciclo_colaborador_tipo UNIQUE (
            ciclo_avaliacao_id,
            colaborador_id,
            tipo_avaliacao
        );');

ALTER TABLE dbo.versao_avaliacao
    ADD comentario nvarchar(2000) NULL,
        plano_acao nvarchar(2000) NULL;

EXEC(N'ALTER TABLE dbo.versao_avaliacao WITH CHECK
    ADD CONSTRAINT CK_versao_avaliacao_comentario_2024_1 CHECK (
        comentario IS NULL OR LEN(LTRIM(RTRIM(comentario))) > 0
    ),
        CONSTRAINT CK_versao_avaliacao_plano_acao_2024_1 CHECK (
            plano_acao IS NULL OR LEN(LTRIM(RTRIM(plano_acao))) > 0
        );');

ALTER TABLE dbo.versao_avaliacao NOCHECK CONSTRAINT CK_versao_avaliacao_origem;
ALTER TABLE dbo.versao_avaliacao NOCHECK CONSTRAINT CK_versao_avaliacao_origem_situacao;

ALTER TABLE dbo.versao_avaliacao WITH CHECK
    ADD CONSTRAINT CK_versao_avaliacao_origem_2024_1 CHECK (
        origem IN ('CRIACAO', 'EDICAO', 'ENVIO', 'PUBLICACAO', 'REABERTURA')
    ),
        CONSTRAINT CK_versao_avaliacao_origem_situacao_2024_1 CHECK (
            (origem IN ('CRIACAO', 'EDICAO', 'REABERTURA') AND situacao = 'RASCUNHO')
            OR (origem = 'ENVIO' AND situacao = 'ENVIADA')
            OR (origem = 'PUBLICACAO' AND situacao = 'PUBLICADA')
        );

ALTER TABLE dbo.transicao_avaliacao NOCHECK CONSTRAINT CK_transicao_avaliacao_acao;
ALTER TABLE dbo.transicao_avaliacao NOCHECK CONSTRAINT CK_transicao_avaliacao_fluxo;

ALTER TABLE dbo.transicao_avaliacao WITH CHECK
    ADD CONSTRAINT CK_transicao_avaliacao_acao_2024_1 CHECK (
        acao IN ('CRIACAO', 'ENVIO', 'PUBLICACAO', 'REABERTURA')
    ),
        CONSTRAINT CK_transicao_avaliacao_fluxo_2024_1 CHECK (
            (acao = 'CRIACAO' AND situacao_origem IS NULL AND situacao_destino = 'RASCUNHO')
            OR (acao = 'ENVIO' AND situacao_origem = 'RASCUNHO' AND situacao_destino = 'ENVIADA')
            OR (acao = 'PUBLICACAO' AND situacao_origem = 'ENVIADA' AND situacao_destino = 'PUBLICADA')
            OR (acao = 'REABERTURA' AND situacao_origem = 'PUBLICADA' AND situacao_destino = 'RASCUNHO')
        ),
        CONSTRAINT CK_transicao_avaliacao_motivo_reabertura_2024_1 CHECK (
            acao <> 'REABERTURA'
            OR (motivo_codigo IS NOT NULL AND LEN(LTRIM(RTRIM(motivo_codigo))) > 0)
        );

CREATE TABLE dbo.resultado_avaliacao (
    resultado_avaliacao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_resultado_avaliacao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_resultado_avaliacao PRIMARY KEY,
    avaliacao_id uniqueidentifier NOT NULL,
    versao_avaliacao_id uniqueidentifier NOT NULL,
    configuracao_calculo_versao_id uniqueidentifier NOT NULL,
    matriz_classificacao_versao_id uniqueidentifier NOT NULL,
    soma_pontos int NOT NULL,
    quantidade_respostas smallint NOT NULL,
    nota_final decimal(5, 1) NOT NULL,
    classificacao varchar(32) NOT NULL,
    calculada_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_resultado_avaliacao_calculada_em_utc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_resultado_avaliacao_versao UNIQUE (versao_avaliacao_id),
    CONSTRAINT FK_resultado_avaliacao_versao
        FOREIGN KEY (versao_avaliacao_id, avaliacao_id)
        REFERENCES dbo.versao_avaliacao (versao_avaliacao_id, avaliacao_id),
    CONSTRAINT FK_resultado_avaliacao_configuracao
        FOREIGN KEY (configuracao_calculo_versao_id)
        REFERENCES dbo.configuracao_calculo_versao (configuracao_calculo_versao_id),
    CONSTRAINT FK_resultado_avaliacao_matriz_configuracao
        FOREIGN KEY (
            matriz_classificacao_versao_id,
            configuracao_calculo_versao_id
        )
        REFERENCES dbo.matriz_classificacao_versao (
            matriz_classificacao_versao_id,
            configuracao_calculo_versao_id
        ),
    CONSTRAINT CK_resultado_avaliacao_quantidade CHECK (quantidade_respostas >= 1),
    CONSTRAINT CK_resultado_avaliacao_soma CHECK (
        soma_pontos >= quantidade_respostas * 80
        AND soma_pontos <= quantidade_respostas * 120
    ),
    CONSTRAINT CK_resultado_avaliacao_nota CHECK (
        nota_final >= CONVERT(decimal(5, 1), 80.0)
        AND nota_final <= CONVERT(decimal(5, 1), 120.0)
    ),
    CONSTRAINT CK_resultado_avaliacao_classificacao CHECK (
        (classificacao = 'REFERENCIA' AND nota_final >= CONVERT(decimal(5, 1), 115.0))
        OR (classificacao = 'SUPERA_EXPECTATIVAS'
            AND nota_final >= CONVERT(decimal(5, 1), 105.0)
            AND nota_final <= CONVERT(decimal(5, 1), 114.9))
        OR (classificacao = 'DENTRO_EXPECTATIVAS'
            AND nota_final >= CONVERT(decimal(5, 1), 95.0)
            AND nota_final <= CONVERT(decimal(5, 1), 104.9))
        OR (classificacao = 'EM_DESENVOLVIMENTO'
            AND nota_final >= CONVERT(decimal(5, 1), 85.0)
            AND nota_final <= CONVERT(decimal(5, 1), 94.9))
        OR (classificacao = 'ABAIXO_ESPERADO'
            AND nota_final >= CONVERT(decimal(5, 1), 80.0)
            AND nota_final <= CONVERT(decimal(5, 1), 84.9))
    )
);

CREATE INDEX IX_resultado_avaliacao_classificacao
    ON dbo.resultado_avaliacao (classificacao, nota_final);

EXEC(N'CREATE TRIGGER dbo.TR_ciclo_avaliacao_janela_immutavel_apos_abertura
ON dbo.ciclo_avaliacao
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM deleted AS anterior
        LEFT JOIN inserted AS novo
            ON novo.ciclo_avaliacao_id = anterior.ciclo_avaliacao_id
        WHERE novo.ciclo_avaliacao_id IS NULL
          AND anterior.situacao <> ''RASCUNHO''
    )
        THROW 51081, N''Um ciclo aberto ou encerrado deve preservar seu historico.'', 1;

    IF EXISTS (
        SELECT 1
        FROM deleted AS anterior
        JOIN inserted AS novo
            ON novo.ciclo_avaliacao_id = anterior.ciclo_avaliacao_id
        WHERE anterior.situacao <> ''RASCUNHO''
          AND (
              novo.janela_abertura_em_utc <> anterior.janela_abertura_em_utc
              OR (novo.janela_abertura_em_utc IS NULL AND anterior.janela_abertura_em_utc IS NOT NULL)
              OR (novo.janela_abertura_em_utc IS NOT NULL AND anterior.janela_abertura_em_utc IS NULL)
              OR novo.janela_encerramento_em_utc <> anterior.janela_encerramento_em_utc
              OR (novo.janela_encerramento_em_utc IS NULL AND anterior.janela_encerramento_em_utc IS NOT NULL)
              OR (novo.janela_encerramento_em_utc IS NOT NULL AND anterior.janela_encerramento_em_utc IS NULL)
              OR novo.fuso_horario_iana <> anterior.fuso_horario_iana
              OR novo.autoavaliacao_habilitada <> anterior.autoavaliacao_habilitada
          )
    )
        THROW 51082, N''Janela, fuso e configuracao de autoavaliacao nao podem mudar depois da abertura.'', 1;
END;');

EXEC(N'CREATE TRIGGER dbo.TR_ciclo_questionario_immutavel_apos_abertura
ON dbo.ciclo_questionario
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT ciclo_avaliacao_id FROM inserted
            UNION
            SELECT ciclo_avaliacao_id FROM deleted
        ) AS ciclo_afetado
        JOIN dbo.ciclo_avaliacao AS ciclo
            ON ciclo.ciclo_avaliacao_id = ciclo_afetado.ciclo_avaliacao_id
        WHERE ciclo.situacao <> ''RASCUNHO''
    )
        THROW 51083, N''Questionarios, calculo e matriz do ciclo nao podem mudar depois da abertura.'', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted AS ciclo_questionario
        JOIN dbo.versao_questionario AS versao
            ON versao.versao_questionario_id = ciclo_questionario.versao_questionario_id
        WHERE versao.aprovado_em_utc IS NULL
    )
        THROW 51084, N''Um ciclo so pode usar versao de questionario aprovada.'', 1;
END;');

EXEC(N'CREATE TRIGGER dbo.TR_versao_questionario_immutavel_apos_aprovacao
ON dbo.versao_questionario
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM deleted
        WHERE aprovado_em_utc IS NOT NULL
    )
        THROW 51085, N''Uma versao de questionario aprovada e imutavel.'', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted AS nova
        JOIN deleted AS anterior
            ON anterior.versao_questionario_id = nova.versao_questionario_id
        WHERE anterior.aprovado_em_utc IS NULL
          AND nova.aprovado_em_utc IS NOT NULL
          AND (
              NOT EXISTS (
                  SELECT 1
                  FROM dbo.questionario_competencia AS competencia_questionario
                  JOIN dbo.pergunta_questionario AS pergunta
                      ON pergunta.questionario_competencia_id = competencia_questionario.questionario_competencia_id
                  WHERE competencia_questionario.versao_questionario_id = nova.versao_questionario_id
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbo.questionario_competencia AS competencia_questionario
                  JOIN dbo.pergunta_questionario AS pergunta
                      ON pergunta.questionario_competencia_id = competencia_questionario.questionario_competencia_id
                  WHERE competencia_questionario.versao_questionario_id = nova.versao_questionario_id
                    AND pergunta.obrigatoria = 0
              )
              OR (SELECT COUNT(*)
                  FROM dbo.opcao_resposta AS opcao
                  WHERE opcao.versao_questionario_id = nova.versao_questionario_id) <> 5
              OR (SELECT COUNT(DISTINCT opcao.pontos)
                  FROM dbo.opcao_resposta AS opcao
                  WHERE opcao.versao_questionario_id = nova.versao_questionario_id) <> 5
          )
    )
        THROW 51086, N''Uma versao aprovada exige perguntas obrigatorias e as cinco opcoes pontuadas da regra 2024.1.'', 1;
END;');

EXEC(N'CREATE TRIGGER dbo.TR_questionario_competencia_immutavel_apos_aprovacao
ON dbo.questionario_competencia
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT versao_questionario_id FROM inserted
            UNION
            SELECT versao_questionario_id FROM deleted
        ) AS versao_afetada
        JOIN dbo.versao_questionario AS versao
            ON versao.versao_questionario_id = versao_afetada.versao_questionario_id
        WHERE versao.aprovado_em_utc IS NOT NULL
    )
        THROW 51087, N''Competencias de uma versao aprovada nao podem mudar.'', 1;
END;');

EXEC(N'CREATE TRIGGER dbo.TR_pergunta_questionario_immutavel_apos_aprovacao
ON dbo.pergunta_questionario
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT questionario_competencia_id FROM inserted
            UNION
            SELECT questionario_competencia_id FROM deleted
        ) AS pergunta_afetada
        JOIN dbo.questionario_competencia AS competencia_questionario
            ON competencia_questionario.questionario_competencia_id = pergunta_afetada.questionario_competencia_id
        JOIN dbo.versao_questionario AS versao
            ON versao.versao_questionario_id = competencia_questionario.versao_questionario_id
        WHERE versao.aprovado_em_utc IS NOT NULL
    )
        THROW 51088, N''Perguntas de uma versao aprovada nao podem mudar.'', 1;
END;');

EXEC(N'CREATE TRIGGER dbo.TR_opcao_resposta_immutavel_apos_aprovacao
ON dbo.opcao_resposta
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT versao_questionario_id FROM inserted
            UNION
            SELECT versao_questionario_id FROM deleted
        ) AS versao_afetada
        JOIN dbo.versao_questionario AS versao
            ON versao.versao_questionario_id = versao_afetada.versao_questionario_id
        WHERE versao.aprovado_em_utc IS NOT NULL
    )
        THROW 51089, N''Opcoes de uma versao aprovada nao podem mudar.'', 1;
END;');

EXEC(N'CREATE TRIGGER dbo.TR_versao_competencia_immutavel_apos_aprovacao
ON dbo.versao_competencia
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM deleted AS competencia_afetada
        JOIN dbo.questionario_competencia AS competencia_questionario
            ON competencia_questionario.versao_competencia_id = competencia_afetada.versao_competencia_id
        JOIN dbo.versao_questionario AS versao
            ON versao.versao_questionario_id = competencia_questionario.versao_questionario_id
        WHERE versao.aprovado_em_utc IS NOT NULL
    )
        THROW 51090, N''Competencia usada por questionario aprovado nao pode mudar.'', 1;
END;');

EXEC(N'CREATE TRIGGER dbo.TR_resultado_avaliacao_imutavel
ON dbo.resultado_avaliacao
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51091, N''Resultados calculados sao imutaveis; uma reabertura cria nova versao.'', 1;
END;');

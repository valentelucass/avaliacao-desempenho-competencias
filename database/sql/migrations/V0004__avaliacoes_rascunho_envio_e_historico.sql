CREATE TABLE dbo.avaliacao (
    avaliacao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_avaliacao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_avaliacao PRIMARY KEY,
    ciclo_questionario_id uniqueidentifier NOT NULL,
    colaborador_id uniqueidentifier NOT NULL,
    avaliador_usuario_id uniqueidentifier NOT NULL,
    vinculo_gestor_colaborador_id uniqueidentifier NOT NULL,
    tipo_avaliacao varchar(20) NOT NULL
        CONSTRAINT DF_avaliacao_tipo DEFAULT 'GESTOR',
    situacao varchar(16) NOT NULL
        CONSTRAINT DF_avaliacao_situacao DEFAULT 'RASCUNHO',
    versao_atual_numero int NOT NULL
        CONSTRAINT DF_avaliacao_versao_atual_numero DEFAULT 1,
    criada_por_usuario_id uniqueidentifier NOT NULL,
    criada_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_avaliacao_criada_em_utc DEFAULT SYSUTCDATETIME(),
    atualizada_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_avaliacao_atualizada_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_avaliacao_ciclo_questionario UNIQUE (avaliacao_id, ciclo_questionario_id),
    CONSTRAINT FK_avaliacao_ciclo_questionario
        FOREIGN KEY (ciclo_questionario_id)
        REFERENCES dbo.ciclo_questionario (ciclo_questionario_id),
    CONSTRAINT FK_avaliacao_colaborador
        FOREIGN KEY (colaborador_id) REFERENCES dbo.colaborador (colaborador_id),
    CONSTRAINT FK_avaliacao_vinculo_gestor_colaborador
        FOREIGN KEY (
            vinculo_gestor_colaborador_id,
            avaliador_usuario_id,
            colaborador_id
        )
        REFERENCES dbo.vinculo_gestor_colaborador (
            vinculo_gestor_colaborador_id,
            gestor_usuario_id,
            colaborador_id
        ),
    CONSTRAINT FK_avaliacao_criada_por
        FOREIGN KEY (criada_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_avaliacao_tipo CHECK (tipo_avaliacao = 'GESTOR'),
    CONSTRAINT CK_avaliacao_situacao CHECK (situacao IN ('RASCUNHO', 'ENVIADA', 'PUBLICADA')),
    CONSTRAINT CK_avaliacao_versao_atual_numero CHECK (versao_atual_numero >= 1),
    CONSTRAINT CK_avaliacao_criada_por_avaliador CHECK (
        criada_por_usuario_id = avaliador_usuario_id
    )
);

CREATE INDEX IX_avaliacao_ciclo_colaborador_situacao
    ON dbo.avaliacao (ciclo_questionario_id, colaborador_id, situacao);

CREATE INDEX IX_avaliacao_avaliador_situacao
    ON dbo.avaliacao (avaliador_usuario_id, situacao);

CREATE TABLE dbo.versao_avaliacao (
    versao_avaliacao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_versao_avaliacao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_versao_avaliacao PRIMARY KEY,
    avaliacao_id uniqueidentifier NOT NULL,
    ciclo_questionario_id uniqueidentifier NOT NULL,
    numero int NOT NULL,
    situacao varchar(16) NOT NULL,
    origem varchar(24) NOT NULL,
    criada_por_usuario_id uniqueidentifier NOT NULL,
    criada_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_versao_avaliacao_criada_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_versao_avaliacao_numero UNIQUE (avaliacao_id, numero),
    CONSTRAINT UQ_versao_avaliacao_relacao UNIQUE (versao_avaliacao_id, avaliacao_id),
    CONSTRAINT FK_versao_avaliacao_avaliacao_ciclo
        FOREIGN KEY (avaliacao_id, ciclo_questionario_id)
        REFERENCES dbo.avaliacao (avaliacao_id, ciclo_questionario_id),
    CONSTRAINT FK_versao_avaliacao_criada_por
        FOREIGN KEY (criada_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_versao_avaliacao_numero CHECK (numero >= 1),
    CONSTRAINT CK_versao_avaliacao_situacao CHECK (
        situacao IN ('RASCUNHO', 'ENVIADA', 'PUBLICADA')
    ),
    CONSTRAINT CK_versao_avaliacao_origem CHECK (
        origem IN ('CRIACAO', 'EDICAO', 'ENVIO', 'PUBLICACAO')
    ),
    CONSTRAINT CK_versao_avaliacao_origem_situacao CHECK (
        (origem IN ('CRIACAO', 'EDICAO') AND situacao = 'RASCUNHO')
        OR (origem = 'ENVIO' AND situacao = 'ENVIADA')
        OR (origem = 'PUBLICACAO' AND situacao = 'PUBLICADA')
    )
);

CREATE TABLE dbo.resposta_avaliacao (
    resposta_avaliacao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_resposta_avaliacao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_resposta_avaliacao PRIMARY KEY,
    versao_avaliacao_id uniqueidentifier NOT NULL,
    pergunta_questionario_id uniqueidentifier NOT NULL,
    opcao_resposta_id uniqueidentifier NOT NULL,
    respondida_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_resposta_avaliacao_respondida_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_resposta_avaliacao_pergunta UNIQUE (versao_avaliacao_id, pergunta_questionario_id),
    CONSTRAINT FK_resposta_avaliacao_versao
        FOREIGN KEY (versao_avaliacao_id) REFERENCES dbo.versao_avaliacao (versao_avaliacao_id),
    CONSTRAINT FK_resposta_avaliacao_pergunta
        FOREIGN KEY (pergunta_questionario_id)
        REFERENCES dbo.pergunta_questionario (pergunta_questionario_id),
    CONSTRAINT FK_resposta_avaliacao_opcao
        FOREIGN KEY (opcao_resposta_id) REFERENCES dbo.opcao_resposta (opcao_resposta_id)
);

CREATE INDEX IX_resposta_avaliacao_opcao
    ON dbo.resposta_avaliacao (opcao_resposta_id);

CREATE TABLE dbo.transicao_avaliacao (
    transicao_avaliacao_id bigint IDENTITY(1, 1) NOT NULL
        CONSTRAINT PK_transicao_avaliacao PRIMARY KEY,
    avaliacao_id uniqueidentifier NOT NULL,
    versao_avaliacao_id uniqueidentifier NOT NULL,
    situacao_origem varchar(16) NULL,
    situacao_destino varchar(16) NOT NULL,
    acao varchar(24) NOT NULL,
    ator_usuario_id uniqueidentifier NOT NULL,
    ocorrida_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_transicao_avaliacao_ocorrida_em_utc DEFAULT SYSUTCDATETIME(),
    request_id varchar(64) NULL,
    motivo_codigo varchar(80) NULL,
    CONSTRAINT FK_transicao_avaliacao_avaliacao
        FOREIGN KEY (avaliacao_id) REFERENCES dbo.avaliacao (avaliacao_id),
    CONSTRAINT FK_transicao_avaliacao_versao
        FOREIGN KEY (versao_avaliacao_id, avaliacao_id)
        REFERENCES dbo.versao_avaliacao (versao_avaliacao_id, avaliacao_id),
    CONSTRAINT FK_transicao_avaliacao_ator
        FOREIGN KEY (ator_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_transicao_avaliacao_origem CHECK (
        situacao_origem IS NULL OR situacao_origem IN ('RASCUNHO', 'ENVIADA', 'PUBLICADA')
    ),
    CONSTRAINT CK_transicao_avaliacao_destino CHECK (
        situacao_destino IN ('RASCUNHO', 'ENVIADA', 'PUBLICADA')
    ),
    CONSTRAINT CK_transicao_avaliacao_acao CHECK (
        acao IN ('CRIACAO', 'ENVIO', 'PUBLICACAO')
    ),
    CONSTRAINT CK_transicao_avaliacao_fluxo CHECK (
        (acao = 'CRIACAO' AND situacao_origem IS NULL AND situacao_destino = 'RASCUNHO')
        OR (acao = 'ENVIO' AND situacao_origem = 'RASCUNHO' AND situacao_destino = 'ENVIADA')
        OR (acao = 'PUBLICACAO' AND situacao_origem = 'ENVIADA' AND situacao_destino = 'PUBLICADA')
    ),
    CONSTRAINT CK_transicao_avaliacao_request_id CHECK (
        request_id IS NULL OR LEN(LTRIM(RTRIM(request_id))) > 0
    ),
    CONSTRAINT CK_transicao_avaliacao_motivo_codigo CHECK (
        motivo_codigo IS NULL OR LEN(LTRIM(RTRIM(motivo_codigo))) > 0
    )
);

CREATE INDEX IX_transicao_avaliacao_avaliacao_data
    ON dbo.transicao_avaliacao (avaliacao_id, ocorrida_em_utc);

CREATE INDEX IX_transicao_avaliacao_ator_data
    ON dbo.transicao_avaliacao (ator_usuario_id, ocorrida_em_utc);


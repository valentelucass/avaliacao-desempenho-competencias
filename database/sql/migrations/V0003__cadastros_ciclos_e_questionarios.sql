CREATE TABLE dbo.filial (
    filial_id uniqueidentifier NOT NULL
        CONSTRAINT DF_filial_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_filial PRIMARY KEY,
    nome nvarchar(200) NOT NULL,
    ativa bit NOT NULL
        CONSTRAINT DF_filial_ativa DEFAULT 1,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_filial_criado_em_utc DEFAULT SYSUTCDATETIME(),
    atualizado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_filial_atualizado_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_filial_nome UNIQUE (nome),
    CONSTRAINT CK_filial_nome_nao_vazio CHECK (LEN(LTRIM(RTRIM(nome))) > 0)
);

CREATE TABLE dbo.area (
    area_id uniqueidentifier NOT NULL
        CONSTRAINT DF_area_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_area PRIMARY KEY,
    nome nvarchar(200) NOT NULL,
    ativa bit NOT NULL
        CONSTRAINT DF_area_ativa DEFAULT 1,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_area_criado_em_utc DEFAULT SYSUTCDATETIME(),
    atualizado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_area_atualizado_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_area_nome UNIQUE (nome),
    CONSTRAINT CK_area_nome_nao_vazio CHECK (LEN(LTRIM(RTRIM(nome))) > 0)
);

CREATE TABLE dbo.colaborador (
    colaborador_id uniqueidentifier NOT NULL
        CONSTRAINT DF_colaborador_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_colaborador PRIMARY KEY,
    nome_exibicao nvarchar(200) NOT NULL,
    ativo bit NOT NULL
        CONSTRAINT DF_colaborador_ativo DEFAULT 1,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_colaborador_criado_em_utc DEFAULT SYSUTCDATETIME(),
    atualizado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_colaborador_atualizado_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT CK_colaborador_nome_nao_vazio CHECK (LEN(LTRIM(RTRIM(nome_exibicao))) > 0)
);

CREATE TABLE dbo.lotacao_colaborador (
    lotacao_colaborador_id uniqueidentifier NOT NULL
        CONSTRAINT DF_lotacao_colaborador_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_lotacao_colaborador PRIMARY KEY,
    colaborador_id uniqueidentifier NOT NULL,
    filial_id uniqueidentifier NULL,
    area_id uniqueidentifier NULL,
    gestor_texto_livre nvarchar(200) NULL,
    inicio_vigencia date NULL,
    fim_vigencia date NULL,
    criado_por_usuario_id uniqueidentifier NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_lotacao_colaborador_criado_em_utc DEFAULT SYSUTCDATETIME(),
    encerrado_por_usuario_id uniqueidentifier NULL,
    encerrado_em_utc datetime2(3) NULL,
    row_version rowversion,
    CONSTRAINT FK_lotacao_colaborador_colaborador
        FOREIGN KEY (colaborador_id) REFERENCES dbo.colaborador (colaborador_id),
    CONSTRAINT FK_lotacao_colaborador_filial
        FOREIGN KEY (filial_id) REFERENCES dbo.filial (filial_id),
    CONSTRAINT FK_lotacao_colaborador_area
        FOREIGN KEY (area_id) REFERENCES dbo.area (area_id),
    CONSTRAINT FK_lotacao_colaborador_criado_por
        FOREIGN KEY (criado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_lotacao_colaborador_encerrado_por
        FOREIGN KEY (encerrado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_lotacao_colaborador_gestor_texto CHECK (
        gestor_texto_livre IS NULL OR LEN(LTRIM(RTRIM(gestor_texto_livre))) > 0
    ),
    CONSTRAINT CK_lotacao_colaborador_vigencia CHECK (
        fim_vigencia IS NULL OR inicio_vigencia IS NULL OR fim_vigencia >= inicio_vigencia
    ),
    CONSTRAINT CK_lotacao_colaborador_encerramento CHECK (
        (encerrado_por_usuario_id IS NULL AND encerrado_em_utc IS NULL)
        OR (encerrado_por_usuario_id IS NOT NULL AND encerrado_em_utc IS NOT NULL)
    )
);

CREATE INDEX IX_lotacao_colaborador_vigencia
    ON dbo.lotacao_colaborador (colaborador_id, inicio_vigencia, fim_vigencia);

CREATE INDEX IX_lotacao_colaborador_filial
    ON dbo.lotacao_colaborador (filial_id, inicio_vigencia, fim_vigencia)
    WHERE filial_id IS NOT NULL;

CREATE INDEX IX_lotacao_colaborador_area
    ON dbo.lotacao_colaborador (area_id, inicio_vigencia, fim_vigencia)
    WHERE area_id IS NOT NULL;

CREATE TABLE dbo.vinculo_gestor_colaborador (
    vinculo_gestor_colaborador_id uniqueidentifier NOT NULL
        CONSTRAINT DF_vinculo_gestor_colaborador_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_vinculo_gestor_colaborador PRIMARY KEY,
    gestor_usuario_id uniqueidentifier NOT NULL,
    colaborador_id uniqueidentifier NOT NULL,
    inicio_vigencia date NULL,
    fim_vigencia date NULL,
    criado_por_usuario_id uniqueidentifier NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_vinculo_gestor_colaborador_criado_em_utc DEFAULT SYSUTCDATETIME(),
    revogado_por_usuario_id uniqueidentifier NULL,
    revogado_em_utc datetime2(3) NULL,
    row_version rowversion,
    CONSTRAINT UQ_vinculo_gestor_colaborador_relacao
        UNIQUE (vinculo_gestor_colaborador_id, gestor_usuario_id, colaborador_id),
    CONSTRAINT FK_vinculo_gestor_colaborador_gestor
        FOREIGN KEY (gestor_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_vinculo_gestor_colaborador_colaborador
        FOREIGN KEY (colaborador_id) REFERENCES dbo.colaborador (colaborador_id),
    CONSTRAINT FK_vinculo_gestor_colaborador_criado_por
        FOREIGN KEY (criado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_vinculo_gestor_colaborador_revogado_por
        FOREIGN KEY (revogado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_vinculo_gestor_colaborador_vigencia CHECK (
        fim_vigencia IS NULL OR inicio_vigencia IS NULL OR fim_vigencia >= inicio_vigencia
    ),
    CONSTRAINT CK_vinculo_gestor_colaborador_revogacao CHECK (
        (revogado_por_usuario_id IS NULL AND revogado_em_utc IS NULL)
        OR (revogado_por_usuario_id IS NOT NULL AND revogado_em_utc IS NOT NULL)
    )
);

CREATE INDEX IX_vinculo_gestor_colaborador_gestor_vigencia
    ON dbo.vinculo_gestor_colaborador (
        gestor_usuario_id,
        inicio_vigencia,
        fim_vigencia,
        revogado_em_utc
    );

CREATE INDEX IX_vinculo_gestor_colaborador_colaborador_vigencia
    ON dbo.vinculo_gestor_colaborador (
        colaborador_id,
        inicio_vigencia,
        fim_vigencia,
        revogado_em_utc
    );

CREATE TABLE dbo.questionario (
    questionario_id uniqueidentifier NOT NULL
        CONSTRAINT DF_questionario_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_questionario PRIMARY KEY,
    codigo nvarchar(100) NOT NULL,
    nome nvarchar(200) NOT NULL,
    ativo bit NOT NULL
        CONSTRAINT DF_questionario_ativo DEFAULT 1,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_questionario_criado_em_utc DEFAULT SYSUTCDATETIME(),
    atualizado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_questionario_atualizado_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_questionario_codigo UNIQUE (codigo),
    CONSTRAINT CK_questionario_codigo_nao_vazio CHECK (LEN(LTRIM(RTRIM(codigo))) > 0),
    CONSTRAINT CK_questionario_nome_nao_vazio CHECK (LEN(LTRIM(RTRIM(nome))) > 0)
);

CREATE TABLE dbo.versao_questionario (
    versao_questionario_id uniqueidentifier NOT NULL
        CONSTRAINT DF_versao_questionario_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_versao_questionario PRIMARY KEY,
    questionario_id uniqueidentifier NOT NULL,
    numero_versao int NOT NULL,
    titulo nvarchar(200) NOT NULL,
    descricao nvarchar(1000) NULL,
    criado_por_usuario_id uniqueidentifier NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_versao_questionario_criado_em_utc DEFAULT SYSUTCDATETIME(),
    aprovado_por_usuario_id uniqueidentifier NULL,
    aprovado_em_utc datetime2(3) NULL,
    row_version rowversion,
    CONSTRAINT UQ_versao_questionario_numero UNIQUE (questionario_id, numero_versao),
    CONSTRAINT FK_versao_questionario_questionario
        FOREIGN KEY (questionario_id) REFERENCES dbo.questionario (questionario_id),
    CONSTRAINT FK_versao_questionario_criado_por
        FOREIGN KEY (criado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_versao_questionario_aprovado_por
        FOREIGN KEY (aprovado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_versao_questionario_numero CHECK (numero_versao >= 1),
    CONSTRAINT CK_versao_questionario_titulo_nao_vazio CHECK (LEN(LTRIM(RTRIM(titulo))) > 0),
    CONSTRAINT CK_versao_questionario_aprovacao CHECK (
        (aprovado_por_usuario_id IS NULL AND aprovado_em_utc IS NULL)
        OR (aprovado_por_usuario_id IS NOT NULL AND aprovado_em_utc IS NOT NULL)
    )
);

CREATE TABLE dbo.competencia (
    competencia_id uniqueidentifier NOT NULL
        CONSTRAINT DF_competencia_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_competencia PRIMARY KEY,
    codigo nvarchar(100) NOT NULL,
    nome nvarchar(200) NOT NULL,
    ativa bit NOT NULL
        CONSTRAINT DF_competencia_ativa DEFAULT 1,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_competencia_criado_em_utc DEFAULT SYSUTCDATETIME(),
    atualizado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_competencia_atualizado_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_competencia_codigo UNIQUE (codigo),
    CONSTRAINT CK_competencia_codigo_nao_vazio CHECK (LEN(LTRIM(RTRIM(codigo))) > 0),
    CONSTRAINT CK_competencia_nome_nao_vazio CHECK (LEN(LTRIM(RTRIM(nome))) > 0)
);

CREATE TABLE dbo.versao_competencia (
    versao_competencia_id uniqueidentifier NOT NULL
        CONSTRAINT DF_versao_competencia_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_versao_competencia PRIMARY KEY,
    competencia_id uniqueidentifier NOT NULL,
    numero_versao int NOT NULL,
    nome nvarchar(200) NOT NULL,
    descricao nvarchar(2000) NULL,
    criado_por_usuario_id uniqueidentifier NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_versao_competencia_criado_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_versao_competencia_numero UNIQUE (competencia_id, numero_versao),
    CONSTRAINT FK_versao_competencia_competencia
        FOREIGN KEY (competencia_id) REFERENCES dbo.competencia (competencia_id),
    CONSTRAINT FK_versao_competencia_criado_por
        FOREIGN KEY (criado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_versao_competencia_numero CHECK (numero_versao >= 1),
    CONSTRAINT CK_versao_competencia_nome_nao_vazio CHECK (LEN(LTRIM(RTRIM(nome))) > 0)
);

CREATE TABLE dbo.questionario_competencia (
    questionario_competencia_id uniqueidentifier NOT NULL
        CONSTRAINT DF_questionario_competencia_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_questionario_competencia PRIMARY KEY,
    versao_questionario_id uniqueidentifier NOT NULL,
    versao_competencia_id uniqueidentifier NOT NULL,
    ordem smallint NOT NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_questionario_competencia_criado_em_utc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_questionario_competencia_versao UNIQUE (
        versao_questionario_id,
        versao_competencia_id
    ),
    CONSTRAINT UQ_questionario_competencia_ordem UNIQUE (versao_questionario_id, ordem),
    CONSTRAINT FK_questionario_competencia_questionario
        FOREIGN KEY (versao_questionario_id)
        REFERENCES dbo.versao_questionario (versao_questionario_id),
    CONSTRAINT FK_questionario_competencia_competencia
        FOREIGN KEY (versao_competencia_id) REFERENCES dbo.versao_competencia (versao_competencia_id),
    CONSTRAINT CK_questionario_competencia_ordem CHECK (ordem >= 1)
);

CREATE TABLE dbo.pergunta_questionario (
    pergunta_questionario_id uniqueidentifier NOT NULL
        CONSTRAINT DF_pergunta_questionario_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_pergunta_questionario PRIMARY KEY,
    questionario_competencia_id uniqueidentifier NOT NULL,
    codigo nvarchar(100) NOT NULL,
    texto nvarchar(1000) NOT NULL,
    descricao nvarchar(4000) NULL,
    ordem smallint NOT NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_pergunta_questionario_criado_em_utc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_pergunta_questionario_ordem UNIQUE (questionario_competencia_id, ordem),
    CONSTRAINT UQ_pergunta_questionario_codigo UNIQUE (questionario_competencia_id, codigo),
    CONSTRAINT FK_pergunta_questionario_competencia
        FOREIGN KEY (questionario_competencia_id)
        REFERENCES dbo.questionario_competencia (questionario_competencia_id),
    CONSTRAINT CK_pergunta_questionario_codigo_nao_vazio CHECK (LEN(LTRIM(RTRIM(codigo))) > 0),
    CONSTRAINT CK_pergunta_questionario_texto_nao_vazio CHECK (LEN(LTRIM(RTRIM(texto))) > 0),
    CONSTRAINT CK_pergunta_questionario_ordem CHECK (ordem >= 1)
);

CREATE TABLE dbo.opcao_resposta (
    opcao_resposta_id uniqueidentifier NOT NULL
        CONSTRAINT DF_opcao_resposta_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_opcao_resposta PRIMARY KEY,
    versao_questionario_id uniqueidentifier NOT NULL,
    codigo nvarchar(100) NOT NULL,
    rotulo nvarchar(200) NOT NULL,
    ordem smallint NOT NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_opcao_resposta_criado_em_utc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_opcao_resposta_codigo UNIQUE (versao_questionario_id, codigo),
    CONSTRAINT UQ_opcao_resposta_ordem UNIQUE (versao_questionario_id, ordem),
    CONSTRAINT FK_opcao_resposta_questionario
        FOREIGN KEY (versao_questionario_id)
        REFERENCES dbo.versao_questionario (versao_questionario_id),
    CONSTRAINT CK_opcao_resposta_codigo_nao_vazio CHECK (LEN(LTRIM(RTRIM(codigo))) > 0),
    CONSTRAINT CK_opcao_resposta_rotulo_nao_vazio CHECK (LEN(LTRIM(RTRIM(rotulo))) > 0),
    CONSTRAINT CK_opcao_resposta_ordem CHECK (ordem >= 1)
);

CREATE TABLE dbo.ciclo_avaliacao (
    ciclo_avaliacao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_ciclo_avaliacao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_ciclo_avaliacao PRIMARY KEY,
    codigo nvarchar(100) NOT NULL,
    nome nvarchar(200) NOT NULL,
    situacao varchar(16) NOT NULL
        CONSTRAINT DF_ciclo_avaliacao_situacao DEFAULT 'RASCUNHO',
    janela_abertura_em_utc datetime2(3) NULL,
    janela_encerramento_em_utc datetime2(3) NULL,
    aberto_por_usuario_id uniqueidentifier NULL,
    aberto_em_utc datetime2(3) NULL,
    encerrado_por_usuario_id uniqueidentifier NULL,
    encerrado_em_utc datetime2(3) NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_ciclo_avaliacao_criado_em_utc DEFAULT SYSUTCDATETIME(),
    atualizado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_ciclo_avaliacao_atualizado_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_ciclo_avaliacao_codigo UNIQUE (codigo),
    CONSTRAINT FK_ciclo_avaliacao_aberto_por
        FOREIGN KEY (aberto_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_ciclo_avaliacao_encerrado_por
        FOREIGN KEY (encerrado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_ciclo_avaliacao_codigo_nao_vazio CHECK (LEN(LTRIM(RTRIM(codigo))) > 0),
    CONSTRAINT CK_ciclo_avaliacao_nome_nao_vazio CHECK (LEN(LTRIM(RTRIM(nome))) > 0),
    CONSTRAINT CK_ciclo_avaliacao_situacao CHECK (
        situacao IN ('RASCUNHO', 'ABERTO', 'ENCERRADO')
    ),
    CONSTRAINT CK_ciclo_avaliacao_janela CHECK (
        janela_abertura_em_utc IS NULL
        OR janela_encerramento_em_utc IS NULL
        OR janela_encerramento_em_utc > janela_abertura_em_utc
    ),
    CONSTRAINT CK_ciclo_avaliacao_historico_situacao CHECK (
        (situacao = 'RASCUNHO'
            AND aberto_por_usuario_id IS NULL
            AND aberto_em_utc IS NULL
            AND encerrado_por_usuario_id IS NULL
            AND encerrado_em_utc IS NULL)
        OR (situacao = 'ABERTO'
            AND aberto_por_usuario_id IS NOT NULL
            AND aberto_em_utc IS NOT NULL
            AND encerrado_por_usuario_id IS NULL
            AND encerrado_em_utc IS NULL)
        OR (situacao = 'ENCERRADO'
            AND aberto_por_usuario_id IS NOT NULL
            AND aberto_em_utc IS NOT NULL
            AND encerrado_por_usuario_id IS NOT NULL
            AND encerrado_em_utc IS NOT NULL
            AND encerrado_em_utc >= aberto_em_utc)
    )
);

CREATE INDEX IX_ciclo_avaliacao_situacao_janela
    ON dbo.ciclo_avaliacao (situacao, janela_abertura_em_utc, janela_encerramento_em_utc);

CREATE TABLE dbo.ciclo_questionario (
    ciclo_questionario_id uniqueidentifier NOT NULL
        CONSTRAINT DF_ciclo_questionario_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_ciclo_questionario PRIMARY KEY,
    ciclo_avaliacao_id uniqueidentifier NOT NULL,
    versao_questionario_id uniqueidentifier NOT NULL,
    criado_por_usuario_id uniqueidentifier NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_ciclo_questionario_criado_em_utc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ciclo_questionario_versao UNIQUE (ciclo_avaliacao_id, versao_questionario_id),
    CONSTRAINT FK_ciclo_questionario_ciclo
        FOREIGN KEY (ciclo_avaliacao_id) REFERENCES dbo.ciclo_avaliacao (ciclo_avaliacao_id),
    CONSTRAINT FK_ciclo_questionario_versao
        FOREIGN KEY (versao_questionario_id)
        REFERENCES dbo.versao_questionario (versao_questionario_id),
    CONSTRAINT FK_ciclo_questionario_criado_por
        FOREIGN KEY (criado_por_usuario_id) REFERENCES dbo.usuario (usuario_id)
);

CREATE INDEX IX_ciclo_questionario_ciclo
    ON dbo.ciclo_questionario (ciclo_avaliacao_id);

CREATE TABLE dbo.transicao_ciclo_avaliacao (
    transicao_ciclo_avaliacao_id bigint IDENTITY(1, 1) NOT NULL
        CONSTRAINT PK_transicao_ciclo_avaliacao PRIMARY KEY,
    ciclo_avaliacao_id uniqueidentifier NOT NULL,
    situacao_origem varchar(16) NULL,
    situacao_destino varchar(16) NOT NULL,
    ator_usuario_id uniqueidentifier NULL,
    ocorrida_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_transicao_ciclo_avaliacao_ocorrida_em_utc DEFAULT SYSUTCDATETIME(),
    motivo_reduzido nvarchar(500) NULL,
    request_id varchar(64) NULL,
    CONSTRAINT FK_transicao_ciclo_avaliacao_ciclo
        FOREIGN KEY (ciclo_avaliacao_id) REFERENCES dbo.ciclo_avaliacao (ciclo_avaliacao_id),
    CONSTRAINT FK_transicao_ciclo_avaliacao_ator
        FOREIGN KEY (ator_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_transicao_ciclo_avaliacao_origem CHECK (
        situacao_origem IS NULL OR situacao_origem IN ('RASCUNHO', 'ABERTO', 'ENCERRADO')
    ),
    CONSTRAINT CK_transicao_ciclo_avaliacao_destino CHECK (
        situacao_destino IN ('RASCUNHO', 'ABERTO', 'ENCERRADO')
    ),
    CONSTRAINT CK_transicao_ciclo_avaliacao_motivo CHECK (
        motivo_reduzido IS NULL OR LEN(LTRIM(RTRIM(motivo_reduzido))) > 0
    ),
    CONSTRAINT CK_transicao_ciclo_avaliacao_request_id CHECK (
        request_id IS NULL OR LEN(LTRIM(RTRIM(request_id))) > 0
    )
);

CREATE INDEX IX_transicao_ciclo_avaliacao_ciclo_data
    ON dbo.transicao_ciclo_avaliacao (ciclo_avaliacao_id, ocorrida_em_utc);


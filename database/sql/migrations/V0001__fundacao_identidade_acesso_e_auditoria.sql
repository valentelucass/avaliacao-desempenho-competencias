CREATE TABLE dbo.usuario (
    usuario_id uniqueidentifier NOT NULL
        CONSTRAINT DF_usuario_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_usuario PRIMARY KEY,
    login_normalizado nvarchar(128) NOT NULL,
    nome_exibicao nvarchar(200) NOT NULL,
    situacao varchar(16) NOT NULL
        CONSTRAINT DF_usuario_situacao DEFAULT 'ATIVO',
    administrador_supremo bit NOT NULL
        CONSTRAINT DF_usuario_administrador_supremo DEFAULT 0,
    protegido_fluxo_normal bit NOT NULL
        CONSTRAINT DF_usuario_protegido_fluxo_normal DEFAULT 0,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_usuario_criado_em_utc DEFAULT SYSUTCDATETIME(),
    atualizado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_usuario_atualizado_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_usuario_login_normalizado UNIQUE (login_normalizado),
    CONSTRAINT CK_usuario_situacao CHECK (situacao IN ('ATIVO', 'BLOQUEADO', 'DESATIVADO')),
    CONSTRAINT CK_usuario_supremo_protegido CHECK (
        protegido_fluxo_normal = 0 OR administrador_supremo = 1
    )
);

CREATE TABLE dbo.credencial_local (
    usuario_id uniqueidentifier NOT NULL
        CONSTRAINT PK_credencial_local PRIMARY KEY,
    senha_hash varchar(255) NOT NULL,
    algoritmo varchar(32) NOT NULL,
    parametros varchar(200) NOT NULL,
    senha_alterada_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_credencial_local_senha_alterada_em_utc DEFAULT SYSUTCDATETIME(),
    senha_deve_ser_trocada bit NOT NULL
        CONSTRAINT DF_credencial_local_senha_deve_ser_trocada DEFAULT 1,
    tentativas_falhas smallint NOT NULL
        CONSTRAINT DF_credencial_local_tentativas_falhas DEFAULT 0,
    bloqueada_ate_utc datetime2(3) NULL,
    CONSTRAINT FK_credencial_local_usuario
        FOREIGN KEY (usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_credencial_local_tentativas_falhas CHECK (tentativas_falhas >= 0)
);

CREATE TABLE dbo.papel (
    papel_id uniqueidentifier NOT NULL
        CONSTRAINT DF_papel_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_papel PRIMARY KEY,
    codigo nvarchar(100) NOT NULL,
    descricao nvarchar(300) NOT NULL,
    ativo bit NOT NULL
        CONSTRAINT DF_papel_ativo DEFAULT 1,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_papel_criado_em_utc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_papel_codigo UNIQUE (codigo)
);

CREATE TABLE dbo.permissao (
    permissao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_permissao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_permissao PRIMARY KEY,
    codigo nvarchar(150) NOT NULL,
    descricao nvarchar(300) NOT NULL,
    ativo bit NOT NULL
        CONSTRAINT DF_permissao_ativo DEFAULT 1,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_permissao_criado_em_utc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_permissao_codigo UNIQUE (codigo)
);

CREATE TABLE dbo.atribuicao_papel (
    atribuicao_papel_id uniqueidentifier NOT NULL
        CONSTRAINT DF_atribuicao_papel_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_atribuicao_papel PRIMARY KEY,
    usuario_id uniqueidentifier NOT NULL,
    papel_id uniqueidentifier NOT NULL,
    concedido_por_usuario_id uniqueidentifier NULL,
    concedido_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_atribuicao_papel_concedido_em_utc DEFAULT SYSUTCDATETIME(),
    revogado_por_usuario_id uniqueidentifier NULL,
    revogado_em_utc datetime2(3) NULL,
    CONSTRAINT FK_atribuicao_papel_usuario
        FOREIGN KEY (usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_atribuicao_papel_papel
        FOREIGN KEY (papel_id) REFERENCES dbo.papel (papel_id),
    CONSTRAINT FK_atribuicao_papel_concedido_por
        FOREIGN KEY (concedido_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_atribuicao_papel_revogado_por
        FOREIGN KEY (revogado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_atribuicao_papel_revogacao CHECK (
        (revogado_em_utc IS NULL AND revogado_por_usuario_id IS NULL)
        OR (revogado_em_utc IS NOT NULL AND revogado_por_usuario_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX UX_atribuicao_papel_ativa
    ON dbo.atribuicao_papel (usuario_id, papel_id)
    WHERE revogado_em_utc IS NULL;

CREATE TABLE dbo.papel_permissao (
    papel_permissao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_papel_permissao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_papel_permissao PRIMARY KEY,
    papel_id uniqueidentifier NOT NULL,
    permissao_id uniqueidentifier NOT NULL,
    concedido_por_usuario_id uniqueidentifier NULL,
    concedido_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_papel_permissao_concedido_em_utc DEFAULT SYSUTCDATETIME(),
    revogado_por_usuario_id uniqueidentifier NULL,
    revogado_em_utc datetime2(3) NULL,
    CONSTRAINT FK_papel_permissao_papel
        FOREIGN KEY (papel_id) REFERENCES dbo.papel (papel_id),
    CONSTRAINT FK_papel_permissao_permissao
        FOREIGN KEY (permissao_id) REFERENCES dbo.permissao (permissao_id),
    CONSTRAINT FK_papel_permissao_concedido_por
        FOREIGN KEY (concedido_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_papel_permissao_revogado_por
        FOREIGN KEY (revogado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_papel_permissao_revogacao CHECK (
        (revogado_em_utc IS NULL AND revogado_por_usuario_id IS NULL)
        OR (revogado_em_utc IS NOT NULL AND revogado_por_usuario_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX UX_papel_permissao_ativa
    ON dbo.papel_permissao (papel_id, permissao_id)
    WHERE revogado_em_utc IS NULL;

CREATE TABLE dbo.concessao_permissao_usuario (
    concessao_permissao_usuario_id uniqueidentifier NOT NULL
        CONSTRAINT DF_concessao_permissao_usuario_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_concessao_permissao_usuario PRIMARY KEY,
    usuario_id uniqueidentifier NOT NULL,
    permissao_id uniqueidentifier NOT NULL,
    efeito varchar(8) NOT NULL,
    concedido_por_usuario_id uniqueidentifier NULL,
    concedido_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_concessao_permissao_usuario_concedido_em_utc DEFAULT SYSUTCDATETIME(),
    revogado_por_usuario_id uniqueidentifier NULL,
    revogado_em_utc datetime2(3) NULL,
    CONSTRAINT FK_concessao_permissao_usuario_usuario
        FOREIGN KEY (usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_concessao_permissao_usuario_permissao
        FOREIGN KEY (permissao_id) REFERENCES dbo.permissao (permissao_id),
    CONSTRAINT FK_concessao_permissao_usuario_concedido_por
        FOREIGN KEY (concedido_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_concessao_permissao_usuario_revogado_por
        FOREIGN KEY (revogado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_concessao_permissao_usuario_efeito CHECK (efeito IN ('PERMITIR', 'NEGAR')),
    CONSTRAINT CK_concessao_permissao_usuario_revogacao CHECK (
        (revogado_em_utc IS NULL AND revogado_por_usuario_id IS NULL)
        OR (revogado_em_utc IS NOT NULL AND revogado_por_usuario_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX UX_concessao_permissao_usuario_ativa
    ON dbo.concessao_permissao_usuario (usuario_id, permissao_id)
    WHERE revogado_em_utc IS NULL;

CREATE TABLE dbo.sessao_autenticacao (
    sessao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_sessao_autenticacao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_sessao_autenticacao PRIMARY KEY,
    usuario_id uniqueidentifier NOT NULL,
    familia_id uniqueidentifier NOT NULL,
    jti_acesso varchar(128) NOT NULL,
    emitida_em_utc datetime2(3) NOT NULL,
    expira_em_utc datetime2(3) NOT NULL,
    revogada_em_utc datetime2(3) NULL,
    motivo_revogacao varchar(80) NULL,
    CONSTRAINT FK_sessao_autenticacao_usuario
        FOREIGN KEY (usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT UQ_sessao_autenticacao_jti_acesso UNIQUE (jti_acesso),
    CONSTRAINT CK_sessao_autenticacao_periodo CHECK (expira_em_utc > emitida_em_utc)
);

CREATE INDEX IX_sessao_autenticacao_usuario_expiracao
    ON dbo.sessao_autenticacao (usuario_id, expira_em_utc)
    WHERE revogada_em_utc IS NULL;

CREATE TABLE dbo.token_renovacao (
    token_renovacao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_token_renovacao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_token_renovacao PRIMARY KEY,
    sessao_id uniqueidentifier NOT NULL,
    token_hash char(64) NOT NULL,
    emitido_em_utc datetime2(3) NOT NULL,
    expira_em_utc datetime2(3) NOT NULL,
    revogado_em_utc datetime2(3) NULL,
    substituido_por_token_renovacao_id uniqueidentifier NULL,
    CONSTRAINT FK_token_renovacao_sessao
        FOREIGN KEY (sessao_id) REFERENCES dbo.sessao_autenticacao (sessao_id),
    CONSTRAINT FK_token_renovacao_substituido_por
        FOREIGN KEY (substituido_por_token_renovacao_id)
        REFERENCES dbo.token_renovacao (token_renovacao_id),
    CONSTRAINT UQ_token_renovacao_hash UNIQUE (token_hash),
    CONSTRAINT CK_token_renovacao_periodo CHECK (expira_em_utc > emitido_em_utc),
    CONSTRAINT CK_token_renovacao_hash CHECK (token_hash NOT LIKE '%[^0-9a-f]%')
);

CREATE INDEX IX_token_renovacao_sessao_expiracao
    ON dbo.token_renovacao (sessao_id, expira_em_utc)
    WHERE revogado_em_utc IS NULL;

CREATE TABLE dbo.evento_auditoria (
    evento_auditoria_id bigint IDENTITY(1, 1) NOT NULL
        CONSTRAINT PK_evento_auditoria PRIMARY KEY,
    ocorrido_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_evento_auditoria_ocorrido_em_utc DEFAULT SYSUTCDATETIME(),
    ator_usuario_id uniqueidentifier NULL,
    acao varchar(100) NOT NULL,
    tipo_recurso varchar(80) NOT NULL,
    recurso_id uniqueidentifier NULL,
    resultado varchar(16) NOT NULL,
    request_id varchar(64) NULL,
    detalhe_reduzido nvarchar(500) NULL,
    CONSTRAINT FK_evento_auditoria_ator
        FOREIGN KEY (ator_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_evento_auditoria_resultado CHECK (resultado IN ('SUCESSO', 'NEGADO', 'FALHA'))
);

CREATE INDEX IX_evento_auditoria_recurso_data
    ON dbo.evento_auditoria (tipo_recurso, recurso_id, ocorrido_em_utc);

CREATE INDEX IX_evento_auditoria_ator_data
    ON dbo.evento_auditoria (ator_usuario_id, ocorrido_em_utc);

CREATE TABLE dbo.chave_idempotencia (
    chave_idempotencia_id uniqueidentifier NOT NULL
        CONSTRAINT DF_chave_idempotencia_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_chave_idempotencia PRIMARY KEY,
    ator_usuario_id uniqueidentifier NOT NULL,
    operacao varchar(100) NOT NULL,
    chave_hash char(64) NOT NULL,
    requisicao_hash char(64) NOT NULL,
    status_resposta smallint NULL,
    recurso_resposta_id uniqueidentifier NULL,
    criada_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_chave_idempotencia_criada_em_utc DEFAULT SYSUTCDATETIME(),
    expira_em_utc datetime2(3) NOT NULL,
    CONSTRAINT FK_chave_idempotencia_ator
        FOREIGN KEY (ator_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT UQ_chave_idempotencia_ator_operacao_chave
        UNIQUE (ator_usuario_id, operacao, chave_hash),
    CONSTRAINT CK_chave_idempotencia_periodo CHECK (expira_em_utc > criada_em_utc),
    CONSTRAINT CK_chave_idempotencia_chave_hash CHECK (chave_hash NOT LIKE '%[^0-9a-f]%'),
    CONSTRAINT CK_chave_idempotencia_requisicao_hash CHECK (requisicao_hash NOT LIKE '%[^0-9a-f]%')
);

CREATE INDEX IX_chave_idempotencia_expiracao
    ON dbo.chave_idempotencia (expira_em_utc);

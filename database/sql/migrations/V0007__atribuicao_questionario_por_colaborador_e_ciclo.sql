IF EXISTS (SELECT 1 FROM dbo.avaliacao)
    THROW 51110, N'A atribuicao explicita de questionario exige avaliacoes vazias; nao e permitido inferir questionario aplicavel de historico existente.', 1;

CREATE TABLE dbo.atribuicao_questionario_colaborador (
    atribuicao_questionario_colaborador_id uniqueidentifier NOT NULL
        CONSTRAINT DF_atribuicao_questionario_colaborador_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_atribuicao_questionario_colaborador PRIMARY KEY,
    ciclo_avaliacao_id uniqueidentifier NOT NULL,
    colaborador_id uniqueidentifier NOT NULL,
    ciclo_questionario_id uniqueidentifier NOT NULL,
    atribuido_por_usuario_id uniqueidentifier NOT NULL,
    atribuido_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_atribuicao_questionario_colaborador_atribuido_em_utc DEFAULT SYSUTCDATETIME(),
    revogado_por_usuario_id uniqueidentifier NULL,
    revogado_em_utc datetime2(3) NULL,
    motivo_revogacao nvarchar(500) NULL,
    row_version rowversion,
    CONSTRAINT UQ_atribuicao_questionario_colaborador_relacao UNIQUE (
        atribuicao_questionario_colaborador_id,
        ciclo_avaliacao_id,
        colaborador_id,
        ciclo_questionario_id
    ),
    CONSTRAINT FK_atribuicao_questionario_colaborador_ciclo
        FOREIGN KEY (ciclo_avaliacao_id)
        REFERENCES dbo.ciclo_avaliacao (ciclo_avaliacao_id),
    CONSTRAINT FK_atribuicao_questionario_colaborador_colaborador
        FOREIGN KEY (colaborador_id) REFERENCES dbo.colaborador (colaborador_id),
    CONSTRAINT FK_atribuicao_questionario_colaborador_ciclo_questionario_ciclo
        FOREIGN KEY (ciclo_questionario_id, ciclo_avaliacao_id)
        REFERENCES dbo.ciclo_questionario (ciclo_questionario_id, ciclo_avaliacao_id),
    CONSTRAINT FK_atribuicao_questionario_colaborador_atribuido_por
        FOREIGN KEY (atribuido_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_atribuicao_questionario_colaborador_revogado_por
        FOREIGN KEY (revogado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_atribuicao_questionario_colaborador_revogacao CHECK (
        (revogado_por_usuario_id IS NULL
            AND revogado_em_utc IS NULL
            AND motivo_revogacao IS NULL)
        OR (revogado_por_usuario_id IS NOT NULL
            AND revogado_em_utc IS NOT NULL
            AND motivo_revogacao IS NOT NULL
            AND LEN(LTRIM(RTRIM(motivo_revogacao))) > 0)
    )
);

CREATE UNIQUE INDEX UX_atribuicao_questionario_colaborador_ativa
    ON dbo.atribuicao_questionario_colaborador (ciclo_avaliacao_id, colaborador_id)
    WHERE revogado_em_utc IS NULL;

CREATE INDEX IX_atribuicao_questionario_colaborador_ciclo_questionario
    ON dbo.atribuicao_questionario_colaborador (
        ciclo_avaliacao_id,
        ciclo_questionario_id,
        colaborador_id
    )
    WHERE revogado_em_utc IS NULL;

ALTER TABLE dbo.avaliacao
    ADD atribuicao_questionario_colaborador_id uniqueidentifier NOT NULL;

ALTER TABLE dbo.avaliacao
    ADD CONSTRAINT FK_avaliacao_atribuicao_questionario_colaborador
        FOREIGN KEY (
            atribuicao_questionario_colaborador_id,
            ciclo_avaliacao_id,
            colaborador_id,
            ciclo_questionario_id
        )
        REFERENCES dbo.atribuicao_questionario_colaborador (
            atribuicao_questionario_colaborador_id,
            ciclo_avaliacao_id,
            colaborador_id,
            ciclo_questionario_id
        );

EXEC(N'CREATE TRIGGER dbo.TR_atribuicao_questionario_colaborador_historico
ON dbo.atribuicao_questionario_colaborador
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM deleted AS anterior
        LEFT JOIN inserted AS novo
            ON novo.atribuicao_questionario_colaborador_id
                = anterior.atribuicao_questionario_colaborador_id
        WHERE novo.atribuicao_questionario_colaborador_id IS NULL
    )
        THROW 51111, N''A atribuicao de questionario preserva historico e nao pode ser excluida.'', 1;

    IF EXISTS (
        SELECT 1
        FROM deleted AS anterior
        JOIN inserted AS novo
            ON novo.atribuicao_questionario_colaborador_id
                = anterior.atribuicao_questionario_colaborador_id
        WHERE novo.ciclo_avaliacao_id <> anterior.ciclo_avaliacao_id
           OR novo.colaborador_id <> anterior.colaborador_id
           OR novo.ciclo_questionario_id <> anterior.ciclo_questionario_id
           OR novo.atribuido_por_usuario_id <> anterior.atribuido_por_usuario_id
           OR novo.atribuido_em_utc <> anterior.atribuido_em_utc
    )
        THROW 51112, N''Ciclo, colaborador, questionario e autoria da atribuicao sao imutaveis.'', 1;

    IF EXISTS (
        SELECT 1
        FROM deleted AS anterior
        JOIN inserted AS novo
            ON novo.atribuicao_questionario_colaborador_id
                = anterior.atribuicao_questionario_colaborador_id
        WHERE anterior.revogado_em_utc IS NOT NULL
          AND (
              novo.revogado_em_utc <> anterior.revogado_em_utc
              OR novo.revogado_por_usuario_id <> anterior.revogado_por_usuario_id
              OR novo.motivo_revogacao <> anterior.motivo_revogacao
          )
    )
        THROW 51113, N''Uma revogacao registrada nao pode ser alterada ou removida.'', 1;

    IF EXISTS (
        SELECT 1
        FROM deleted AS anterior
        JOIN inserted AS novo
            ON novo.atribuicao_questionario_colaborador_id
                = anterior.atribuicao_questionario_colaborador_id
        JOIN dbo.avaliacao AS avaliacao
            ON avaliacao.atribuicao_questionario_colaborador_id
                = anterior.atribuicao_questionario_colaborador_id
        WHERE anterior.revogado_em_utc IS NULL
          AND novo.revogado_em_utc IS NOT NULL
    )
        THROW 51114, N''Uma atribuicao com avaliacao registrada nao pode ser revogada.'', 1;
END;');

EXEC(N'CREATE TRIGGER dbo.TR_atribuicao_questionario_colaborador_ciclo_rascunho
ON dbo.atribuicao_questionario_colaborador
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted AS atribuicao
        JOIN dbo.ciclo_avaliacao AS ciclo
            ON ciclo.ciclo_avaliacao_id = atribuicao.ciclo_avaliacao_id
        WHERE ciclo.situacao <> ''RASCUNHO''
    )
        THROW 51115, N''A atribuicao ou revogacao de questionario so pode ocorrer enquanto o ciclo estiver em rascunho.'', 1;
END;');

EXEC(N'CREATE TRIGGER dbo.TR_avaliacao_questionario_atribuido_ativo
ON dbo.avaliacao
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted AS avaliacao
        JOIN dbo.atribuicao_questionario_colaborador AS atribuicao
            ON atribuicao.atribuicao_questionario_colaborador_id
                = avaliacao.atribuicao_questionario_colaborador_id
        WHERE atribuicao.revogado_em_utc IS NOT NULL
    )
        THROW 51116, N''Uma avaliacao exige atribuicao de questionario ativa para o colaborador e ciclo.'', 1;
END;');

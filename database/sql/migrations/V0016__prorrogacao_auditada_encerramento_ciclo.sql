/* A excecao altera somente o encerramento de ABERTO, mediante comando auditado atomico. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

CREATE TABLE dbo.prorrogacao_ciclo_avaliacao (
    prorrogacao_ciclo_avaliacao_id uniqueidentifier NOT NULL
        CONSTRAINT PK_prorrogacao_ciclo_avaliacao PRIMARY KEY,
    ciclo_avaliacao_id uniqueidentifier NOT NULL,
    encerramento_anterior_em_utc datetime2(7) NOT NULL,
    novo_encerramento_em_utc datetime2(3) NOT NULL,
    motivo nvarchar(500) NOT NULL,
    ator_usuario_id uniqueidentifier NOT NULL,
    registrada_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_prorrogacao_ciclo_registrada DEFAULT SYSUTCDATETIME(),
    request_id varchar(64) NULL,
    CONSTRAINT FK_prorrogacao_ciclo_ciclo FOREIGN KEY (ciclo_avaliacao_id)
        REFERENCES dbo.ciclo_avaliacao (ciclo_avaliacao_id),
    CONSTRAINT FK_prorrogacao_ciclo_ator FOREIGN KEY (ator_usuario_id)
        REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_prorrogacao_ciclo_motivo CHECK (LEN(LTRIM(RTRIM(motivo))) BETWEEN 10 AND 500)
);

CREATE INDEX IX_prorrogacao_ciclo_data
    ON dbo.prorrogacao_ciclo_avaliacao (ciclo_avaliacao_id, registrada_em_utc);
CREATE INDEX IX_prorrogacao_ciclo_ator_data
    ON dbo.prorrogacao_ciclo_avaliacao (ator_usuario_id, registrada_em_utc);

EXEC(N'CREATE TRIGGER dbo.TR_prorrogacao_ciclo_aplicar
ON dbo.prorrogacao_ciclo_avaliacao
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    IF (SELECT COUNT_BIG(*) FROM inserted) <> 1
        THROW 51210, N''A prorrogacao exige um unico comando por operacao.'', 1;

    DECLARE @id uniqueidentifier, @ciclo uniqueidentifier, @ator uniqueidentifier,
            @anterior datetime2(7), @novo datetime2(3), @request varchar(64),
            @atual datetime2(3), @situacao varchar(16), @fuso nvarchar(100);
    SELECT @id = prorrogacao_ciclo_avaliacao_id, @ciclo = ciclo_avaliacao_id,
           @ator = ator_usuario_id, @anterior = encerramento_anterior_em_utc,
           @novo = novo_encerramento_em_utc, @request = request_id
    FROM inserted;

    SELECT @atual = janela_encerramento_em_utc, @situacao = situacao, @fuso = fuso_horario_iana
    FROM dbo.ciclo_avaliacao WITH (UPDLOCK, HOLDLOCK)
    WHERE ciclo_avaliacao_id = @ciclo;

    IF @situacao IS NULL OR @situacao <> ''ABERTO'' OR @atual IS NULL
       OR @anterior <> @atual OR @fuso <> N''America/Sao_Paulo''
        THROW 51210, N''O ciclo deve estar aberto e manter o encerramento esperado.'', 1;
    IF @novo <= @atual OR @novo <= SYSUTCDATETIME()
        THROW 51211, N''O novo encerramento deve ser posterior ao atual e ao horario corrente.'', 1;
    IF NOT EXISTS (
        SELECT 1 FROM dbo.usuario
        WHERE usuario_id = @ator AND situacao = ''ATIVO'' AND excluido_logicamente = 0
    )
        THROW 51210, N''O autor da prorrogacao deve estar ativo.'', 1;

    UPDATE dbo.ciclo_avaliacao
    SET janela_encerramento_em_utc = @novo, atualizado_em_utc = SYSUTCDATETIME()
    WHERE ciclo_avaliacao_id = @ciclo AND situacao = ''ABERTO''
      AND janela_encerramento_em_utc = @anterior;
    IF @@ROWCOUNT <> 1
        THROW 51210, N''O encerramento foi alterado por outra operacao.'', 1;

    INSERT INTO dbo.evento_auditoria (
        ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
    ) VALUES (
        @ator, ''CICLO.PRORROGAR_ENCERRAMENTO'', ''CICLO_AVALIACAO'', @ciclo,
        ''SUCESSO'', @request, N''Prorrogacao auditada: '' + CONVERT(nvarchar(36), @id)
    );
END;');

EXEC(N'CREATE TRIGGER dbo.TR_prorrogacao_ciclo_imutavel
ON dbo.prorrogacao_ciclo_avaliacao
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51212, N''O historico de prorrogacoes nao pode ser alterado ou removido.'', 1;
END;');

EXEC(N'ALTER TRIGGER dbo.TR_ciclo_avaliacao_janela_immutavel_apos_abertura
ON dbo.ciclo_avaliacao
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted AS anterior
        LEFT JOIN inserted AS novo ON novo.ciclo_avaliacao_id = anterior.ciclo_avaliacao_id
        WHERE novo.ciclo_avaliacao_id IS NULL AND anterior.situacao <> ''RASCUNHO''
    )
        THROW 51081, N''Um ciclo aberto ou encerrado deve preservar seu historico.'', 1;

    IF EXISTS (
        SELECT 1 FROM deleted AS anterior
        JOIN inserted AS novo ON novo.ciclo_avaliacao_id = anterior.ciclo_avaliacao_id
        WHERE anterior.situacao <> ''RASCUNHO'' AND EXISTS (
            SELECT novo.janela_abertura_em_utc, novo.fuso_horario_iana, novo.autoavaliacao_habilitada
            EXCEPT
            SELECT anterior.janela_abertura_em_utc, anterior.fuso_horario_iana, anterior.autoavaliacao_habilitada
        )
    )
        THROW 51082, N''Abertura, fuso e autoavaliacao nao podem mudar depois da abertura.'', 1;

    IF EXISTS (
        SELECT 1 FROM deleted AS anterior
        JOIN inserted AS novo ON novo.ciclo_avaliacao_id = anterior.ciclo_avaliacao_id
        WHERE anterior.situacao <> ''RASCUNHO'' AND EXISTS (
            SELECT novo.janela_encerramento_em_utc EXCEPT SELECT anterior.janela_encerramento_em_utc
        ) AND (
            anterior.situacao <> ''ABERTO'' OR novo.situacao <> ''ABERTO''
            OR anterior.janela_encerramento_em_utc IS NULL OR novo.janela_encerramento_em_utc IS NULL
            OR novo.janela_encerramento_em_utc <= anterior.janela_encerramento_em_utc
            OR novo.janela_encerramento_em_utc <= SYSUTCDATETIME()
            OR TRIGGER_NESTLEVEL(OBJECT_ID(N''dbo.TR_prorrogacao_ciclo_aplicar''), ''AFTER'', ''DML'') <> 1
            OR NOT EXISTS (
                SELECT 1 FROM dbo.prorrogacao_ciclo_avaliacao AS registro
                WHERE registro.ciclo_avaliacao_id = anterior.ciclo_avaliacao_id
                  AND registro.encerramento_anterior_em_utc = anterior.janela_encerramento_em_utc
                  AND registro.novo_encerramento_em_utc = novo.janela_encerramento_em_utc
            )
            OR EXISTS (
                SELECT novo.codigo, novo.nome, novo.situacao, novo.aberto_por_usuario_id,
                       novo.aberto_em_utc, novo.encerrado_por_usuario_id, novo.encerrado_em_utc, novo.criado_em_utc
                EXCEPT
                SELECT anterior.codigo, anterior.nome, anterior.situacao, anterior.aberto_por_usuario_id,
                       anterior.aberto_em_utc, anterior.encerrado_por_usuario_id, anterior.encerrado_em_utc, anterior.criado_em_utc
            )
        )
    )
        THROW 51082, N''O encerramento exige prorrogacao auditada de ciclo aberto.'', 1;
END;');

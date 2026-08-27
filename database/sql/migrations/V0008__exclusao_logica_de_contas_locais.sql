ALTER TABLE dbo.usuario
    ADD excluido_logicamente bit NOT NULL
        CONSTRAINT DF_usuario_excluido_logicamente DEFAULT 0 WITH VALUES,
        excluido_em_utc datetime2(3) NULL,
        excluido_por_usuario_id uniqueidentifier NULL;

ALTER TABLE dbo.usuario
    ADD CONSTRAINT FK_usuario_excluido_por
        FOREIGN KEY (excluido_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
        CONSTRAINT CK_usuario_exclusao_logica CHECK (
            (excluido_logicamente = 0
                AND excluido_em_utc IS NULL
                AND excluido_por_usuario_id IS NULL)
            OR (excluido_logicamente = 1
                AND excluido_em_utc IS NOT NULL
                AND excluido_por_usuario_id IS NOT NULL
                AND situacao = 'DESATIVADO')
        );

CREATE INDEX IX_usuario_exclusao_logica
    ON dbo.usuario (excluido_logicamente, nome_exibicao, usuario_id);

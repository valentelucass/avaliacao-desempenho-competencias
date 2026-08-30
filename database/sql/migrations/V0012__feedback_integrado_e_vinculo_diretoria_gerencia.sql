/*
 * Feedback pertence à versão publicada da avaliação. A migration é aditiva:
 * avaliações históricas não são alteradas; PUBLICADA sem registro de feedback
 * continua sendo interpretada pela aplicação como PENDENTE quando aplicável.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;

CREATE TABLE dbo.vinculo_diretoria_gerencia (
    vinculo_diretoria_gerencia_id uniqueidentifier NOT NULL
        CONSTRAINT DF_vinculo_diretoria_gerencia_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_vinculo_diretoria_gerencia PRIMARY KEY,
    diretoria_usuario_id uniqueidentifier NOT NULL,
    gerencia_colaborador_id uniqueidentifier NOT NULL,
    inicio_vigencia date NULL,
    fim_vigencia date NULL,
    criado_por_usuario_id uniqueidentifier NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_vinculo_diretoria_gerencia_criado_em_utc DEFAULT SYSUTCDATETIME(),
    revogado_por_usuario_id uniqueidentifier NULL,
    revogado_em_utc datetime2(3) NULL,
    row_version rowversion,
    CONSTRAINT UQ_vinculo_diretoria_gerencia_relacao
        UNIQUE (
            vinculo_diretoria_gerencia_id,
            diretoria_usuario_id,
            gerencia_colaborador_id
        ),
    CONSTRAINT FK_vinculo_diretoria_gerencia_diretoria
        FOREIGN KEY (diretoria_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_vinculo_diretoria_gerencia_gerencia
        FOREIGN KEY (gerencia_colaborador_id) REFERENCES dbo.colaborador (colaborador_id),
    CONSTRAINT FK_vinculo_diretoria_gerencia_criado_por
        FOREIGN KEY (criado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT FK_vinculo_diretoria_gerencia_revogado_por
        FOREIGN KEY (revogado_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_vinculo_diretoria_gerencia_vigencia CHECK (
        fim_vigencia IS NULL OR inicio_vigencia IS NULL OR fim_vigencia >= inicio_vigencia
    ),
    CONSTRAINT CK_vinculo_diretoria_gerencia_revogacao CHECK (
        (revogado_por_usuario_id IS NULL AND revogado_em_utc IS NULL)
        OR (revogado_por_usuario_id IS NOT NULL AND revogado_em_utc IS NOT NULL)
    )
);

CREATE UNIQUE INDEX UX_vinculo_diretoria_gerencia_gerencia_ativo
    ON dbo.vinculo_diretoria_gerencia (gerencia_colaborador_id)
    WHERE revogado_em_utc IS NULL;

CREATE INDEX IX_vinculo_diretoria_gerencia_diretoria_vigencia
    ON dbo.vinculo_diretoria_gerencia (
        diretoria_usuario_id,
        inicio_vigencia,
        fim_vigencia,
        revogado_em_utc
    );

ALTER TABLE dbo.avaliacao
    ADD vinculo_diretoria_gerencia_id uniqueidentifier NULL;

ALTER TABLE dbo.avaliacao NOCHECK CONSTRAINT CK_avaliacao_tipo_2024_1;
ALTER TABLE dbo.avaliacao NOCHECK CONSTRAINT CK_avaliacao_relacao_por_tipo_2024_1;

ALTER TABLE dbo.avaliacao WITH CHECK
    ADD CONSTRAINT CK_avaliacao_tipo_2026_feedback CHECK (
        tipo_avaliacao IN ('GESTOR', 'AUTOAVALIACAO', 'DIRETORIA_GERENCIA')
    );

EXEC(N'ALTER TABLE dbo.avaliacao WITH CHECK
    ADD CONSTRAINT CK_avaliacao_relacao_por_tipo_2026_feedback CHECK (
        (tipo_avaliacao = ''GESTOR''
            AND vinculo_gestor_colaborador_id IS NOT NULL
            AND vinculo_usuario_colaborador_id IS NULL
            AND vinculo_diretoria_gerencia_id IS NULL)
        OR (tipo_avaliacao = ''AUTOAVALIACAO''
            AND vinculo_gestor_colaborador_id IS NULL
            AND vinculo_usuario_colaborador_id IS NOT NULL
            AND vinculo_diretoria_gerencia_id IS NULL)
        OR (tipo_avaliacao = ''DIRETORIA_GERENCIA''
            AND vinculo_gestor_colaborador_id IS NULL
            AND vinculo_usuario_colaborador_id IS NULL
            AND vinculo_diretoria_gerencia_id IS NOT NULL)
    );

ALTER TABLE dbo.avaliacao
    ADD CONSTRAINT FK_avaliacao_vinculo_diretoria_gerencia
        FOREIGN KEY (
            vinculo_diretoria_gerencia_id,
            avaliador_usuario_id,
            colaborador_id
        )
        REFERENCES dbo.vinculo_diretoria_gerencia (
            vinculo_diretoria_gerencia_id,
            diretoria_usuario_id,
            gerencia_colaborador_id
        );');

CREATE TABLE dbo.feedback_avaliacao (
    feedback_avaliacao_id uniqueidentifier NOT NULL
        CONSTRAINT DF_feedback_avaliacao_id DEFAULT NEWSEQUENTIALID()
        CONSTRAINT PK_feedback_avaliacao PRIMARY KEY,
    avaliacao_id uniqueidentifier NOT NULL,
    versao_avaliacao_id uniqueidentifier NOT NULL,
    situacao varchar(20) NOT NULL,
    data_feedback date NULL,
    comentario nvarchar(2000) NULL,
    concluido_por_usuario_id uniqueidentifier NULL,
    concluido_em_utc datetime2(3) NULL,
    criado_em_utc datetime2(3) NOT NULL
        CONSTRAINT DF_feedback_avaliacao_criado_em_utc DEFAULT SYSUTCDATETIME(),
    row_version rowversion,
    CONSTRAINT UQ_feedback_avaliacao_versao UNIQUE (versao_avaliacao_id),
    CONSTRAINT FK_feedback_avaliacao_versao
        FOREIGN KEY (versao_avaliacao_id, avaliacao_id)
        REFERENCES dbo.versao_avaliacao (versao_avaliacao_id, avaliacao_id),
    CONSTRAINT FK_feedback_avaliacao_concluido_por
        FOREIGN KEY (concluido_por_usuario_id) REFERENCES dbo.usuario (usuario_id),
    CONSTRAINT CK_feedback_avaliacao_situacao CHECK (
        situacao IN ('NAO_APLICAVEL', 'PENDENTE', 'CONCLUIDO')
    ),
    CONSTRAINT CK_feedback_avaliacao_conclusao CHECK (
        (situacao IN ('NAO_APLICAVEL', 'PENDENTE')
            AND data_feedback IS NULL
            AND comentario IS NULL
            AND concluido_por_usuario_id IS NULL
            AND concluido_em_utc IS NULL)
        OR (situacao = 'CONCLUIDO'
            AND data_feedback IS NOT NULL
            AND comentario IS NOT NULL
            AND LEN(LTRIM(RTRIM(comentario))) > 0
            AND concluido_por_usuario_id IS NOT NULL
            AND concluido_em_utc IS NOT NULL)
    )
);

CREATE INDEX IX_feedback_avaliacao_avaliacao_situacao
    ON dbo.feedback_avaliacao (avaliacao_id, situacao, versao_avaliacao_id);

DECLARE @permissoes TABLE (
    codigo nvarchar(150) NOT NULL PRIMARY KEY,
    descricao nvarchar(300) NOT NULL
);

INSERT INTO @permissoes (codigo, descricao)
VALUES
    (N'AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS', N'Cria, edita, envia e conclui feedback somente de Gerencias vinculadas a Diretoria.'),
    (N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO', N'Registra uma unica conclusao de feedback da propria avaliacao publicada.'),
    (N'VINCULOS_DIRETORIA_GERENCIA.GERIR', N'Cria, encerra e consulta vinculos Diretoria-Gerencia com vigencia e autoria.');

INSERT INTO dbo.permissao (codigo, descricao)
SELECT catalogo.codigo, catalogo.descricao
FROM @permissoes AS catalogo
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.permissao AS existente
    WHERE existente.codigo = catalogo.codigo
);

DECLARE @concessoes TABLE (
    papel_codigo nvarchar(100) NOT NULL,
    permissao_codigo nvarchar(150) NOT NULL,
    PRIMARY KEY (papel_codigo, permissao_codigo)
);

INSERT INTO @concessoes (papel_codigo, permissao_codigo)
VALUES
    (N'GESTOR', N'AUTOAVALIACOES.PREENCHER_PROPRIA'),
    (N'GESTOR', N'AUTOAVALIACOES.ENVIAR_PROPRIA'),
    (N'GESTOR', N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'),
    (N'GESTOR', N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'),
    (N'DIRETORIA', N'AUTOAVALIACOES.PREENCHER_PROPRIA'),
    (N'DIRETORIA', N'AUTOAVALIACOES.ENVIAR_PROPRIA'),
    (N'DIRETORIA', N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'),
    (N'DIRETORIA', N'AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS'),
    (N'DIRETORIA', N'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'),
    (N'ADMINISTRADOR_PLATAFORMA', N'VINCULOS_DIRETORIA_GERENCIA.GERIR'),
    (N'GERENCIA_RH', N'VINCULOS_DIRETORIA_GERENCIA.GERIR');

INSERT INTO dbo.papel_permissao (papel_id, permissao_id)
SELECT papel.papel_id, permissao.permissao_id
FROM @concessoes AS concessao
JOIN dbo.papel AS papel ON papel.codigo = concessao.papel_codigo
JOIN dbo.permissao AS permissao ON permissao.codigo = concessao.permissao_codigo
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.papel_permissao AS existente
    WHERE existente.papel_id = papel.papel_id
      AND existente.permissao_id = permissao.permissao_id
      AND existente.revogado_em_utc IS NULL
);

DECLARE @ator_usuario_id uniqueidentifier = (
    SELECT TOP (1) usuario_id
    FROM dbo.usuario
    WHERE administrador_supremo = 1
      AND situacao = 'ATIVO'
      AND excluido_logicamente = 0
    ORDER BY criado_em_utc, usuario_id
);

IF @ator_usuario_id IS NULL
    THROW 51160, N'A normalizacao de acesso do feedback exige administrador supremo ativo.', 1;

UPDATE papel_permissao
SET revogado_por_usuario_id = @ator_usuario_id,
    revogado_em_utc = SYSUTCDATETIME()
FROM dbo.papel_permissao AS papel_permissao
JOIN dbo.papel AS papel ON papel.papel_id = papel_permissao.papel_id
JOIN dbo.permissao AS permissao ON permissao.permissao_id = papel_permissao.permissao_id
WHERE papel.codigo = N'COLABORADOR'
  AND permissao.codigo IN (
      N'AUTOAVALIACOES.PREENCHER_PROPRIA',
      N'AUTOAVALIACOES.ENVIAR_PROPRIA',
      N'AUTOAVALIACOES.VISUALIZAR_PROPRIA'
  )
  AND papel_permissao.revogado_em_utc IS NULL;

UPDATE dbo.papel
SET descricao = N'Perfil legado sem acesso a plataforma; colaboradores nao avaliadores nao recebem login nesta versao.'
WHERE codigo = N'COLABORADOR';

INSERT INTO dbo.evento_auditoria (
    ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
)
VALUES (
    @ator_usuario_id,
    'MIGRACAO.FEEDBACK.E_VINCULO_DIRETORIA_GERENCIA',
    'CONFIGURACAO',
    NULL,
    'SUCESSO',
    'MIGRACAO-V0012',
    N'Feedback integrado, vinculo Diretoria-Gerencia e perfis de avaliadores configurados.'
);

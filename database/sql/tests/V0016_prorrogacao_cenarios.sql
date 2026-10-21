/*
 * SOMENTE DEV, dentro de transacao externa que sempre sofre rollback.
 * O executor deve aplicar V0016 nessa mesma transacao e prefixar DECLARE @cenario nvarchar(40).
 * Cada negativo usa transacao/conexao propria: THROW em trigger pode invalidar toda a transacao.
 * Nao cria usuario nem reutiliza pessoas reais: exige ator qa.feedback.rh.* ja ficticio no DEV.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'AVALIACAO_DEV' OR @@TRANCOUNT = 0
    THROW 51290, N'O ensaio exige DEV e transacao externa para rollback.', 1;
IF @cenario NOT IN (
    N'positivo_vencido', N'positivo_vigente', N'estado_encerrado', N'estado_rascunho',
    N'esperado_ultrapassado', N'esperado_submilissegundo', N'igual', N'encurtar', N'novo_passado',
    N'update_direto', N'alterar_abertura', N'alterar_auto', N'alterar_fuso',
    N'lote', N'auditoria_update', N'auditoria_delete', N'repeticao', N'questionario', N'falha_auditoria'
)
    THROW 51290, N'Cenario ficticio desconhecido.', 1;

DECLARE @ator uniqueidentifier = (
    SELECT TOP (1) usuario_id FROM dbo.usuario
    WHERE login_normalizado LIKE N'qa.feedback.rh.%' AND situacao = 'ATIVO'
      AND excluido_logicamente = 0
    ORDER BY usuario_id
);
IF @ator IS NULL THROW 51290, N'Ator QA ficticio ausente no DEV.', 1;

DECLARE @id uniqueidentifier = NEWID(), @registro uniqueidentifier = NEWID(),
        @q uniqueidentifier = NEWID(), @versao uniqueidentifier, @calculo uniqueidentifier, @matriz uniqueidentifier,
        @abertura datetime2(3) = DATEADD(day, -10, SYSUTCDATETIME()),
        @anterior datetime2(3) = DATEADD(day, -1, SYSUTCDATETIME()),
        @novo datetime2(3) = DATEADD(day, 3, SYSUTCDATETIME()),
        @esperado datetime2(7), @antes varbinary(32), @questionario_antes varbinary(32);
IF @cenario = N'positivo_vigente' SET @anterior = DATEADD(day, 1, SYSUTCDATETIME());
SET @esperado = @anterior;

SELECT TOP (1) @versao = v.versao_questionario_id,
       @calculo = c.configuracao_calculo_versao_id, @matriz = m.matriz_classificacao_versao_id
FROM dbo.versao_questionario AS v
CROSS JOIN dbo.configuracao_calculo_versao AS c
JOIN dbo.matriz_classificacao_versao AS m ON m.configuracao_calculo_versao_id = c.configuracao_calculo_versao_id
WHERE v.aprovado_em_utc IS NOT NULL AND c.aprovado_em_utc IS NOT NULL AND m.aprovado_em_utc IS NOT NULL;
IF @versao IS NULL THROW 51290, N'Catalogo aprovado de questionario QA indisponivel.', 1;

INSERT INTO dbo.ciclo_avaliacao (
    ciclo_avaliacao_id, codigo, nome, situacao, janela_abertura_em_utc,
    janela_encerramento_em_utc, fuso_horario_iana, autoavaliacao_habilitada
) VALUES (@id, N'QA-V16-' + CONVERT(nvarchar(36), @id), N'Ciclo ficticio V0016', 'RASCUNHO',
          @abertura, @anterior, N'America/Sao_Paulo', 1);
INSERT INTO dbo.ciclo_questionario (
    ciclo_questionario_id, ciclo_avaliacao_id, versao_questionario_id,
    configuracao_calculo_versao_id, matriz_classificacao_versao_id, criado_por_usuario_id
) VALUES (@q, @id, @versao, @calculo, @matriz, @ator);
IF @cenario <> N'estado_rascunho'
    UPDATE dbo.ciclo_avaliacao SET situacao = 'ABERTO', aberto_por_usuario_id = @ator,
        aberto_em_utc = DATEADD(day, -9, SYSUTCDATETIME()) WHERE ciclo_avaliacao_id = @id;
IF @cenario = N'estado_encerrado'
    UPDATE dbo.ciclo_avaliacao SET situacao = 'ENCERRADO', encerrado_por_usuario_id = @ator,
        encerrado_em_utc = SYSUTCDATETIME() WHERE ciclo_avaliacao_id = @id;

SELECT @antes = HASHBYTES('SHA2_256', (
    SELECT codigo, nome, situacao, janela_abertura_em_utc, fuso_horario_iana, autoavaliacao_habilitada,
           aberto_por_usuario_id, aberto_em_utc, encerrado_por_usuario_id, encerrado_em_utc, criado_em_utc
    FROM dbo.ciclo_avaliacao WHERE ciclo_avaliacao_id = @id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
SELECT @questionario_antes = HASHBYTES('SHA2_256', (
    SELECT * FROM dbo.ciclo_questionario WHERE ciclo_avaliacao_id = @id FOR JSON PATH));

IF @cenario = N'update_direto'
    UPDATE dbo.ciclo_avaliacao SET janela_encerramento_em_utc = @novo WHERE ciclo_avaliacao_id = @id;
IF @cenario = N'alterar_abertura'
    UPDATE dbo.ciclo_avaliacao SET janela_abertura_em_utc = DATEADD(hour, 1, @abertura) WHERE ciclo_avaliacao_id = @id;
IF @cenario = N'alterar_auto'
    UPDATE dbo.ciclo_avaliacao SET autoavaliacao_habilitada = 0 WHERE ciclo_avaliacao_id = @id;
IF @cenario = N'alterar_fuso'
    UPDATE dbo.ciclo_avaliacao SET fuso_horario_iana = N'UTC' WHERE ciclo_avaliacao_id = @id;
IF @cenario = N'questionario'
    UPDATE dbo.ciclo_questionario SET criado_por_usuario_id = @ator WHERE ciclo_questionario_id = @q;
IF @cenario = N'esperado_ultrapassado' SET @esperado = DATEADD(millisecond, 1, @anterior);
IF @cenario = N'esperado_submilissegundo' SET @esperado = DATEADD(nanosecond, 100, @esperado);
IF @cenario = N'igual' SET @novo = @anterior;
IF @cenario = N'encurtar' SET @novo = DATEADD(hour, -1, @anterior);
IF @cenario = N'novo_passado' SET @novo = DATEADD(hour, -1, SYSUTCDATETIME());
IF @cenario = N'lote'
    INSERT INTO dbo.prorrogacao_ciclo_avaliacao (
        prorrogacao_ciclo_avaliacao_id, ciclo_avaliacao_id, encerramento_anterior_em_utc,
        novo_encerramento_em_utc, motivo, ator_usuario_id, request_id
    ) SELECT NEWID(), @id, @esperado, @novo, N'Motivo ficticio de lote QA', @ator, 'QA-V0016'
      FROM (VALUES(1),(2)) AS lote(n);
IF @cenario = N'falha_auditoria'
BEGIN
    DECLARE @sql_falha nvarchar(max) = N'CREATE TRIGGER dbo.TR_qa_v0016_falha_auditoria ON dbo.evento_auditoria AFTER INSERT AS
        BEGIN SET NOCOUNT ON;
        IF EXISTS (SELECT 1 FROM inserted WHERE recurso_id = ''' + CONVERT(nvarchar(36), @id) + N''')
            THROW 51220, N''Falha de auditoria ficticia QA.'', 1;
        END;';
    EXEC(@sql_falha);
END;

INSERT INTO dbo.prorrogacao_ciclo_avaliacao (
    prorrogacao_ciclo_avaliacao_id, ciclo_avaliacao_id, encerramento_anterior_em_utc,
    novo_encerramento_em_utc, motivo, ator_usuario_id, request_id
) VALUES (@registro, @id, @esperado, @novo, N'Motivo ficticio de prorrogacao QA', @ator, 'QA-V0016');

IF @cenario = N'auditoria_update'
    UPDATE dbo.prorrogacao_ciclo_avaliacao SET motivo = N'Motivo ficticio adulterado' WHERE prorrogacao_ciclo_avaliacao_id = @registro;
IF @cenario = N'auditoria_delete'
    DELETE FROM dbo.prorrogacao_ciclo_avaliacao WHERE prorrogacao_ciclo_avaliacao_id = @registro;
IF @cenario = N'repeticao'
    INSERT INTO dbo.prorrogacao_ciclo_avaliacao (
        prorrogacao_ciclo_avaliacao_id, ciclo_avaliacao_id, encerramento_anterior_em_utc,
        novo_encerramento_em_utc, motivo, ator_usuario_id, request_id
    ) VALUES (NEWID(), @id, @esperado, @novo, N'Repeticao ficticia de pedido QA', @ator, 'QA-V0016');
IF @cenario NOT IN (N'positivo_vencido', N'positivo_vigente')
    THROW 51299, N'O negativo foi aceito indevidamente.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.ciclo_avaliacao WHERE ciclo_avaliacao_id = @id AND janela_encerramento_em_utc = @novo AND situacao = 'ABERTO')
    THROW 51299, N'O novo prazo nao foi aplicado.', 1;
IF @antes <> (SELECT HASHBYTES('SHA2_256', (
    SELECT codigo, nome, situacao, janela_abertura_em_utc, fuso_horario_iana, autoavaliacao_habilitada,
           aberto_por_usuario_id, aberto_em_utc, encerrado_por_usuario_id, encerrado_em_utc, criado_em_utc
    FROM dbo.ciclo_avaliacao WHERE ciclo_avaliacao_id = @id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)))
    THROW 51299, N'Campo imutavel do ciclo foi alterado.', 1;
IF @questionario_antes <> (SELECT HASHBYTES('SHA2_256', (
    SELECT * FROM dbo.ciclo_questionario WHERE ciclo_avaliacao_id = @id FOR JSON PATH)))
    THROW 51299, N'Questionario aplicado foi alterado.', 1;
IF (SELECT COUNT(*) FROM dbo.evento_auditoria WHERE recurso_id = @id AND acao = 'CICLO.PRORROGAR_ENCERRAMENTO') <> 1
   OR (SELECT COUNT(*) FROM dbo.prorrogacao_ciclo_avaliacao WHERE ciclo_avaliacao_id = @id AND ator_usuario_id = @ator AND encerramento_anterior_em_utc = @anterior AND novo_encerramento_em_utc = @novo) <> 1
    THROW 51299, N'Auditoria da prorrogacao nao corresponde a operacao.', 1;
IF EXISTS (SELECT 1 FROM dbo.avaliacao WHERE ciclo_avaliacao_id = @id)
    THROW 51299, N'O comando nao deve criar avaliacoes.', 1;
SELECT N'CENARIO_FICTICIO_APROVADO' AS resultado;

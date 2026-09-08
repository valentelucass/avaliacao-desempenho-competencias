/* Massa persistente ADC-DEV-002. Somente DEV; nunca executada pelo runner.
   Avaliações e resultados são criados posteriormente pela API, não por SQL.
   Reexecução não sobrescreve contas, senhas, respostas ou cadastros existentes. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_NAME() <> N'AVALIACAO_DEV'
    THROW 51360, N'Esta carga aceita somente AVALIACAO_DEV.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'V0014')
    THROW 51361, N'A carga exige V0014 aplicada.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @lock_result int;
    EXEC @lock_result = sys.sp_getapplock @Resource = N'ADC-DEV-002', @LockMode = 'Exclusive',
        @LockOwner = 'Transaction', @LockTimeout = 0;
    IF @lock_result < 0 THROW 51362, N'Outra carga DEV esta em andamento.', 1;

    IF EXISTS (SELECT 1 FROM dbo.evento_auditoria WHERE acao = 'DADOS_TESTE.PREPARAR_MASSA_COMPLETA' AND request_id = 'ADC-DEV-002')
    BEGIN
        COMMIT TRANSACTION;
        PRINT N'MASSA_BASE_DEV_JA_EXISTE';
        GOTO historical_cycle;
    END;
    IF EXISTS (SELECT 1 FROM dbo.ciclo_avaliacao WHERE codigo LIKE N'DEV-COMPLETO-%')
       OR EXISTS (SELECT 1 FROM dbo.colaborador WHERE nome_exibicao LIKE N'DEV COMPLETO - %')
       OR EXISTS (SELECT 1 FROM dbo.usuario WHERE login_normalizado = N'teste.admin@avaliacao.test')
       OR EXISTS (SELECT 1 FROM dbo.filial WHERE nome LIKE N'DEV COMPLETO - %')
       OR EXISTS (SELECT 1 FROM dbo.area WHERE nome LIKE N'DEV COMPLETO - %')
        THROW 51363, N'Colisao de identificadores; nenhum dado existente sera sobrescrito.', 1;

    DECLARE @accounts TABLE (perfil varchar(32) PRIMARY KEY, usuario_id uniqueidentifier);
    INSERT INTO @accounts
    SELECT p.codigo, u.usuario_id
    FROM dbo.usuario u
    JOIN dbo.atribuicao_papel ap ON ap.usuario_id = u.usuario_id AND ap.revogado_em_utc IS NULL
    JOIN dbo.papel p ON p.papel_id = ap.papel_id AND p.ativo = 1
    WHERE u.situacao = 'ATIVO' AND u.excluido_logicamente = 0 AND u.administrador_supremo = 0
      AND ((u.login_normalizado = N'teste.rh@avaliacao.test' AND p.codigo = 'GERENCIA_RH')
        OR (u.login_normalizado = N'teste.gestor@avaliacao.test' AND p.codigo = 'GESTOR')
        OR (u.login_normalizado = N'teste.diretoria@avaliacao.test' AND p.codigo = 'DIRETORIA'));
    IF (SELECT COUNT(*) FROM @accounts) <> 3
        THROW 51364, N'As tres contas ficticias de avaliadores devem existir e estar ativas.', 1;

    DECLARE @rh uniqueidentifier = (SELECT usuario_id FROM @accounts WHERE perfil = 'GERENCIA_RH');
    DECLARE @manager uniqueidentifier = (SELECT usuario_id FROM @accounts WHERE perfil = 'GESTOR');
    DECLARE @director uniqueidentifier = (SELECT usuario_id FROM @accounts WHERE perfil = 'DIRETORIA');
    DECLARE @admin uniqueidentifier = NEWID();
    DECLARE @admin_role uniqueidentifier = (SELECT papel_id FROM dbo.papel WHERE codigo = 'ADMINISTRADOR_PLATAFORMA' AND ativo = 1);
    DECLARE @admin_hash varchar(255) = '$(ADC_DEV_ADMIN_BCRYPT_HASH)';
    IF @admin_role IS NULL OR LEN(@admin_hash) <> 60 OR @admin_hash NOT LIKE '$2[aby]$12$%'
        THROW 51365, N'Administrador ficticio exige perfil tecnico e hash BCrypt de custo 12.', 1;
    INSERT INTO dbo.usuario (usuario_id, login_normalizado, nome_exibicao, situacao, administrador_supremo, protegido_fluxo_normal, excluido_logicamente)
    VALUES (@admin, N'teste.admin@avaliacao.test', N'DEV COMPLETO - Administrador tecnico ficticio', 'ATIVO', 0, 0, 0);
    INSERT INTO dbo.credencial_local (usuario_id, senha_hash, algoritmo, parametros, senha_deve_ser_trocada)
    VALUES (@admin, @admin_hash, 'BCRYPT', 'strength=12', 0);
    INSERT INTO dbo.atribuicao_papel (usuario_id, papel_id, concedido_por_usuario_id)
    VALUES (@admin, @admin_role, @admin);

    DECLARE @today date = CONVERT(date, SYSUTCDATETIME());
    DECLARE @branch_a uniqueidentifier = NEWID(), @branch_b uniqueidentifier = NEWID();
    DECLARE @area_rh uniqueidentifier = NEWID(), @area_team uniqueidentifier = NEWID();
    INSERT INTO dbo.filial (filial_id, nome, ativa) VALUES
        (@branch_a, N'DEV COMPLETO - Filial principal', 1),
        (@branch_b, N'DEV COMPLETO - Filial grupo pequeno', 1),
        (NEWID(), N'DEV COMPLETO - Filial inativa', 0);
    INSERT INTO dbo.area (area_id, nome, ativa) VALUES
        (@area_rh, N'DEV COMPLETO - Equipe RH', 1),
        (@area_team, N'DEV COMPLETO - Equipe Gestor', 1),
        (NEWID(), N'DEV COMPLETO - Area inativa', 0);

    DECLARE @people TABLE (
        codigo varchar(24) PRIMARY KEY, colaborador_id uniqueidentifier NULL,
        questionario varchar(32) NOT NULL, avaliador uniqueidentifier NULL,
        tipo varchar(32) NOT NULL, ordem int NOT NULL
    );
    INSERT INTO @people (codigo, questionario, avaliador, tipo, ordem)
    SELECT role_code + '-' + RIGHT('0' + CONVERT(varchar(2), ordinal), 2),
        CASE ordinal % 3 WHEN 0 THEN 'LIDERANCA' WHEN 1 THEN 'OPERACIONAL' ELSE 'ADMINISTRATIVO' END,
        actor_id, 'GESTOR', ordinal
    FROM (VALUES ('RH', @rh), ('GESTOR', @manager)) roles(role_code, actor_id)
    CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7),(8)) ordinals(ordinal);
    INSERT INTO @people (codigo, questionario, avaliador, tipo, ordem) VALUES
        ('GERENCIA-01', 'LIDERANCA', @director, 'DIRETORIA_GERENCIA', 1),
        ('GERENCIA-02', 'LIDERANCA', @director, 'DIRETORIA_GERENCIA', 2),
        ('AUTO-RH', 'LIDERANCA', @rh, 'AUTOAVALIACAO', 1),
        ('AUTO-GESTOR', 'LIDERANCA', @manager, 'AUTOAVALIACAO', 2),
        ('AUTO-DIRETORIA', 'LIDERANCA', @director, 'AUTOAVALIACAO', 3);
    UPDATE person SET colaborador_id = link.colaborador_id
    FROM @people person
    JOIN dbo.vinculo_usuario_colaborador link ON link.usuario_id = person.avaliador
        AND link.encerrado_em_utc IS NULL
        AND link.inicio_vigencia <= @today AND (link.fim_vigencia IS NULL OR link.fim_vigencia >= @today)
    WHERE person.tipo = 'AUTOAVALIACAO';
    IF EXISTS (SELECT 1 FROM @people person JOIN dbo.colaborador c ON c.colaborador_id=person.colaborador_id WHERE c.ativo=0)
        THROW 51366, N'Vinculo de teste aponta para colaborador inativo.', 1;
    UPDATE @people SET colaborador_id = NEWID() WHERE colaborador_id IS NULL;
    INSERT INTO dbo.colaborador (colaborador_id, nome_exibicao, ativo)
    SELECT person.colaborador_id, N'DEV COMPLETO - ' + person.codigo, 1 FROM @people person
    WHERE NOT EXISTS (SELECT 1 FROM dbo.colaborador c WHERE c.colaborador_id = person.colaborador_id);
    INSERT INTO dbo.lotacao_colaborador (colaborador_id, filial_id, area_id, gestor_texto_livre, inicio_vigencia, criado_por_usuario_id)
    SELECT person.colaborador_id, CASE WHEN person.ordem=5 THEN @branch_b ELSE @branch_a END,
        CASE WHEN person.avaliador=@rh THEN @area_rh ELSE @area_team END,
        N'Equipe ficticia DEV COMPLETO', @today, @admin
    FROM @people person WHERE NOT EXISTS (
        SELECT 1 FROM dbo.lotacao_colaborador l WHERE l.colaborador_id=person.colaborador_id AND l.encerrado_em_utc IS NULL);
    INSERT INTO dbo.vinculo_gestor_colaborador (gestor_usuario_id, colaborador_id, inicio_vigencia, criado_por_usuario_id)
    SELECT avaliador, colaborador_id, @today, @admin FROM @people WHERE tipo='GESTOR';
    INSERT INTO dbo.vinculo_diretoria_gerencia (diretoria_usuario_id, gerencia_colaborador_id, inicio_vigencia, criado_por_usuario_id)
    SELECT avaliador, colaborador_id, @today, @admin FROM @people WHERE tipo='DIRETORIA_GERENCIA';
    INSERT INTO dbo.vinculo_usuario_colaborador (usuario_id, colaborador_id, inicio_vigencia, criado_por_usuario_id)
    SELECT person.avaliador, person.colaborador_id, @today, @admin FROM @people person
    WHERE person.tipo='AUTOAVALIACAO' AND NOT EXISTS (
        SELECT 1 FROM dbo.vinculo_usuario_colaborador link WHERE link.usuario_id=person.avaliador AND link.encerrado_em_utc IS NULL);

    DECLARE @inactive uniqueidentifier = NEWID();
    INSERT INTO dbo.colaborador (colaborador_id, nome_exibicao, ativo)
    VALUES (@inactive, N'DEV COMPLETO - Historico inativo', 0);
    INSERT INTO dbo.lotacao_colaborador (colaborador_id, filial_id, area_id, gestor_texto_livre, inicio_vigencia, fim_vigencia,
        criado_por_usuario_id, encerrado_por_usuario_id, encerrado_em_utc)
    VALUES (@inactive, @branch_a, @area_team, N'Lotacao ficticia encerrada', DATEADD(day,-30,@today), DATEADD(day,-1,@today),
        @admin, @admin, SYSUTCDATETIME());

    DECLARE @cycles TABLE (codigo varchar(32) PRIMARY KEY, id uniqueidentifier NOT NULL);
    INSERT INTO @cycles VALUES ('DEV-COMPLETO-LIVRE',NEWID()), ('DEV-COMPLETO-FLUXOS',NEWID()),
        ('DEV-COMPLETO-CONFIG',NEWID()), ('DEV-COMPLETO-FUTURO',NEWID());
    INSERT INTO dbo.ciclo_avaliacao (ciclo_avaliacao_id,codigo,nome,situacao,janela_abertura_em_utc,janela_encerramento_em_utc,fuso_horario_iana,autoavaliacao_habilitada)
    SELECT id,codigo,N'DEV COMPLETO - '+REPLACE(codigo,'DEV-COMPLETO-',''),'RASCUNHO',
        DATEADD(day,-1,SYSUTCDATETIME()),DATEADD(day,365,SYSUTCDATETIME()),N'America/Sao_Paulo',1 FROM @cycles;
    DECLARE @calc uniqueidentifier = (SELECT configuracao_calculo_versao_id FROM dbo.configuracao_calculo_versao WHERE codigo=N'MEDIA_SIMPLES_2024_1' AND numero_versao=1);
    DECLARE @matrix uniqueidentifier = (SELECT matriz_classificacao_versao_id FROM dbo.matriz_classificacao_versao WHERE codigo=N'GERAL' AND numero_versao=1 AND configuracao_calculo_versao_id=@calc);
    IF @calc IS NULL OR @matrix IS NULL THROW 51367, N'Configuracao 2024.1 ausente.', 1;
    INSERT INTO dbo.ciclo_questionario (ciclo_avaliacao_id,versao_questionario_id,configuracao_calculo_versao_id,matriz_classificacao_versao_id,criado_por_usuario_id)
    SELECT cycle.id,v.versao_questionario_id,@calc,@matrix,@rh FROM @cycles cycle
    CROSS JOIN dbo.versao_questionario v JOIN dbo.questionario q ON q.questionario_id=v.questionario_id
    WHERE q.codigo IN ('OPERACIONAL','ADMINISTRATIVO','LIDERANCA') AND v.numero_versao=1 AND v.aprovado_em_utc IS NOT NULL;
    IF (SELECT COUNT(*) FROM dbo.ciclo_questionario cq JOIN @cycles c ON c.id=cq.ciclo_avaliacao_id) <> 12
        THROW 51368, N'Os tres questionarios oficiais aprovados sao obrigatorios.', 1;
    INSERT INTO dbo.atribuicao_questionario_colaborador (ciclo_avaliacao_id,colaborador_id,ciclo_questionario_id,atribuido_por_usuario_id)
    SELECT cycle.id,person.colaborador_id,cq.ciclo_questionario_id,@rh FROM @cycles cycle CROSS JOIN @people person
    JOIN dbo.questionario q ON q.codigo=person.questionario
    JOIN dbo.versao_questionario v ON v.questionario_id=q.questionario_id AND v.numero_versao=1
    JOIN dbo.ciclo_questionario cq ON cq.ciclo_avaliacao_id=cycle.id AND cq.versao_questionario_id=v.versao_questionario_id;
    UPDATE cycle SET situacao='ABERTO',aberto_por_usuario_id=@rh,aberto_em_utc=SYSUTCDATETIME()
    FROM dbo.ciclo_avaliacao cycle JOIN @cycles c ON c.id=cycle.ciclo_avaliacao_id WHERE c.codigo <> 'DEV-COMPLETO-CONFIG';
    INSERT INTO dbo.transicao_ciclo_avaliacao (ciclo_avaliacao_id,situacao_origem,situacao_destino,ator_usuario_id,motivo_reduzido,request_id)
    SELECT id,'RASCUNHO','ABERTO',@rh,N'Abertura de cenario inteiramente ficticio.','ADC-DEV-002' FROM @cycles WHERE codigo <> 'DEV-COMPLETO-CONFIG';
    INSERT INTO dbo.evento_auditoria (ator_usuario_id,acao,tipo_recurso,recurso_id,resultado,request_id,detalhe_reduzido)
    SELECT @admin,'DADOS_TESTE.PREPARAR_MASSA_COMPLETA','CICLO_AVALIACAO',id,'SUCESSO','ADC-DEV-002',
        N'Massa ficticia DEV: conta tecnica, pessoas, lotacoes, vinculos e questionarios. Resultados somente pela API.'
    FROM @cycles WHERE codigo='DEV-COMPLETO-FLUXOS';
    COMMIT TRANSACTION;
    PRINT N'MASSA_BASE_DEV_CRIADA';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

historical_cycle:
BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @historical_rh uniqueidentifier = (SELECT usuario_id FROM dbo.usuario WHERE login_normalizado=N'teste.rh@avaliacao.test' AND situacao='ATIVO');
    IF @historical_rh IS NULL THROW 51369, N'Conta RH ficticia indisponivel.', 1;
    -- Recuperar apenas o rotulo da primeira execucao desta propria fixture.
    -- A janela aberta, a autoavaliacao e todo seu historico permanecem intactos.
    UPDATE c SET codigo=N'DEV-COMPLETO-FUTURO', nome=N'DEV COMPLETO - FUTURO'
    FROM dbo.ciclo_avaliacao c
    WHERE c.codigo=N'DEV-COMPLETO-ENCERRADO' AND c.nome=N'DEV COMPLETO - ENCERRADO'
      AND c.situacao='ABERTO' AND c.janela_encerramento_em_utc > SYSUTCDATETIME()
      AND EXISTS (SELECT 1 FROM dbo.transicao_ciclo_avaliacao t WHERE t.ciclo_avaliacao_id=c.ciclo_avaliacao_id AND t.request_id='ADC-DEV-002');

    IF NOT EXISTS (SELECT 1 FROM dbo.ciclo_avaliacao WHERE codigo=N'DEV-COMPLETO-ENCERRADO')
    BEGIN
        DECLARE @historical_id uniqueidentifier = NEWID();
        INSERT INTO dbo.ciclo_avaliacao (ciclo_avaliacao_id,codigo,nome,situacao,janela_abertura_em_utc,janela_encerramento_em_utc,
            fuso_horario_iana,autoavaliacao_habilitada)
        VALUES (@historical_id,N'DEV-COMPLETO-ENCERRADO',N'DEV COMPLETO - ENCERRADO','RASCUNHO',
            DATEADD(day,-30,SYSUTCDATETIME()),DATEADD(day,-1,SYSUTCDATETIME()),N'America/Sao_Paulo',1);
        INSERT INTO dbo.ciclo_questionario (ciclo_avaliacao_id,versao_questionario_id,configuracao_calculo_versao_id,matriz_classificacao_versao_id,criado_por_usuario_id)
        SELECT @historical_id,cq.versao_questionario_id,cq.configuracao_calculo_versao_id,cq.matriz_classificacao_versao_id,@historical_rh
        FROM dbo.ciclo_questionario cq JOIN dbo.ciclo_avaliacao c ON c.ciclo_avaliacao_id=cq.ciclo_avaliacao_id WHERE c.codigo=N'DEV-COMPLETO-FLUXOS';
        UPDATE dbo.ciclo_avaliacao SET situacao='ABERTO',aberto_por_usuario_id=@historical_rh,aberto_em_utc=DATEADD(day,-30,SYSUTCDATETIME()) WHERE ciclo_avaliacao_id=@historical_id;
        INSERT INTO dbo.transicao_ciclo_avaliacao (ciclo_avaliacao_id,situacao_origem,situacao_destino,ator_usuario_id,ocorrida_em_utc,motivo_reduzido,request_id)
        VALUES (@historical_id,'RASCUNHO','ABERTO',@historical_rh,DATEADD(day,-30,SYSUTCDATETIME()),N'Fixture historica ficticia para encerrar pela API.','ADC-DEV-002');
        INSERT INTO dbo.evento_auditoria (ator_usuario_id,acao,tipo_recurso,recurso_id,resultado,request_id,detalhe_reduzido)
        VALUES (@historical_rh,'DADOS_TESTE.PREPARAR_CICLO_HISTORICO','CICLO_AVALIACAO',@historical_id,'SUCESSO','ADC-DEV-002',N'Fixture ficticia com janela passada; nenhum prazo de ciclo aberto foi alterado.');
    END;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

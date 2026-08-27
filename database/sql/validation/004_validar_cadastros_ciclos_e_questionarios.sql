SET NOCOUNT ON;

DECLARE @tabelas_necessarias TABLE (nome sysname NOT NULL PRIMARY KEY);

INSERT INTO @tabelas_necessarias (nome)
VALUES
    (N'filial'),
    (N'area'),
    (N'colaborador'),
    (N'lotacao_colaborador'),
    (N'vinculo_gestor_colaborador'),
    (N'questionario'),
    (N'versao_questionario'),
    (N'competencia'),
    (N'versao_competencia'),
    (N'questionario_competencia'),
    (N'pergunta_questionario'),
    (N'opcao_resposta'),
    (N'ciclo_avaliacao'),
    (N'ciclo_questionario'),
    (N'transicao_ciclo_avaliacao');

IF NOT EXISTS (
    SELECT 1
    FROM dbo.schema_migrations
    WHERE version = N'V0003'
      AND script_name = N'V0003__cadastros_ciclos_e_questionarios'
)
    THROW 51060, N'Migration de cadastros, ciclos e questionarios ausente do historico.', 1;

IF EXISTS (
    SELECT 1
    FROM @tabelas_necessarias AS necessaria
    WHERE OBJECT_ID(N'dbo.' + necessaria.nome, N'U') IS NULL
)
    THROW 51061, N'Fundacao de cadastros, ciclos ou questionarios incompleta.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.vinculo_gestor_colaborador')
      AND name = N'UQ_vinculo_gestor_colaborador_relacao'
)
    THROW 51062, N'Chave de integridade do vinculo gestor-colaborador ausente.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_ciclo_questionario_versao'
)
    THROW 51063, N'Chave estrangeira entre ciclo e versao de questionario ausente.', 1;

SELECT
    (SELECT COUNT(*) FROM dbo.schema_migrations) AS migrations_aplicadas,
    (SELECT COUNT(*) FROM @tabelas_necessarias) AS tabelas_estruturais_validadas,
    (SELECT COUNT(*) FROM dbo.colaborador) AS colaboradores_cadastrados,
    (SELECT COUNT(*) FROM dbo.ciclo_avaliacao) AS ciclos_cadastrados;


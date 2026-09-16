/*
  ADC-COR-022. Execução manual somente após autorização do alvo, impacto e recuperação.
  Não é migration e não é executado pelos launchers.
  Concede DELETE somente em área/colaborador; a API exige inatividade e ausência
  de qualquer referência, mantendo auditoria. Nenhum registro é removido aqui.
  Registrar as permissões anteriores antes de executar. Para recuperar, revogar
  somente os grants novos desta operação, sem alterar concessões preexistentes.
*/
USE [AVALIACAO_PROD];
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'AVALIACAO_PROD'
    THROW 52030, N'Alvo de produção inesperado.', 1;
IF NOT EXISTS (
    SELECT 1 FROM sys.database_principals
    WHERE name = N'rodogarcia_adc_app'
      AND type_desc = N'SQL_USER'
      AND authentication_type_desc = N'INSTANCE'
)
    THROW 52031, N'Identidade SQL da aplicação não encontrada.', 1;
IF OBJECT_ID(N'dbo.area', N'U') IS NULL OR OBJECT_ID(N'dbo.colaborador', N'U') IS NULL
    THROW 52032, N'Cadastros esperados não encontrados.', 1;

-- Registrar este resultado como baseline protegido antes da alteração.
SELECT OBJECT_NAME(major_id) AS objeto, permission_name, state_desc
FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'rodogarcia_adc_app')
  AND class = 1 AND major_id IN (OBJECT_ID(N'dbo.area'), OBJECT_ID(N'dbo.colaborador'))
  AND permission_name = N'DELETE';

BEGIN TRANSACTION;
GRANT DELETE ON OBJECT::dbo.area TO [rodogarcia_adc_app];
GRANT DELETE ON OBJECT::dbo.colaborador TO [rodogarcia_adc_app];
COMMIT TRANSACTION;

PRINT N'Grants restritos de exclusão de cadastros reconciliados; nenhum dado foi removido.';

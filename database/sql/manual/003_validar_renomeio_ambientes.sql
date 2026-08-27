SET NOCOUNT ON;

SELECT
    name AS database_name,
    state_desc,
    user_access_desc
FROM sys.databases
WHERE name IN (
    N'AvaliacaoDesempenhoCompetencias',
    N'RodogarciaAvaliacaoDesempenho',
    N'AVALIACAO_DEV',
    N'AVALIACAO_PROD'
)
ORDER BY name;

SELECT
    DB_NAME(session.database_id) AS database_name,
    session.session_id,
    session.login_name,
    session.host_name,
    session.program_name
FROM sys.dm_exec_sessions AS session
WHERE session.is_user_process = 1
  AND DB_NAME(session.database_id) IN (
      N'AvaliacaoDesempenhoCompetencias',
      N'RodogarciaAvaliacaoDesempenho'
  )
ORDER BY database_name, session.session_id;

package br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationException;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationRepository;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleConfigurationDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleConfigurationDraft.AppliedQuestionnaireDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.SqlServerUtcDateTime;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** JDBC para configurar apenas ciclos em rascunho com artefatos previamente aprovados. */
@Repository
@ConditionalOnSqlServerPersistence
public class SqlServerEvaluationCycleAdministrationRepository
    implements EvaluationCycleAdministrationRepository {

  static final String OPEN_CYCLE_SQL =
      """
      UPDATE ciclo
      SET situacao = 'ABERTO',
          aberto_por_usuario_id = ?,
          aberto_em_utc = SYSUTCDATETIME(),
          atualizado_em_utc = SYSUTCDATETIME()
      FROM dbo.ciclo_avaliacao AS ciclo
      WHERE ciclo.ciclo_avaliacao_id = ?
        AND ciclo.situacao = ?
        AND ciclo.janela_abertura_em_utc IS NOT NULL
        AND ciclo.janela_encerramento_em_utc IS NOT NULL
        AND ciclo.janela_abertura_em_utc <= SYSUTCDATETIME()
        AND SYSUTCDATETIME() < ciclo.janela_encerramento_em_utc
        AND EXISTS (
            SELECT 1
            FROM dbo.ciclo_questionario
            WHERE ciclo_avaliacao_id = ciclo.ciclo_avaliacao_id
        )
      """;

  static final String CLOSE_CYCLE_SQL =
      """
      UPDATE dbo.ciclo_avaliacao
      SET situacao = 'ENCERRADO',
          encerrado_por_usuario_id = ?,
          encerrado_em_utc = SYSUTCDATETIME(),
          atualizado_em_utc = SYSUTCDATETIME()
      WHERE ciclo_avaliacao_id = ?
        AND situacao = ?
        AND janela_encerramento_em_utc IS NOT NULL
        AND SYSUTCDATETIME() >= janela_encerramento_em_utc
      """;

  private final JdbcTemplate jdbcTemplate;

  public SqlServerEvaluationCycleAdministrationRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "JdbcTemplate não pode ser nulo");
  }

  @Override
  public CreatedCycle createDraftCycle(
      EvaluationCycleDraft draft, UUID actorUserId, String requestId) {
    requireRequiredMigrations();
    UUID cycleId = UUID.randomUUID();
    insertDraftCycle(cycleId, draft);
    insertCreationTransition(cycleId, actorUserId, requestId);
    List<AppliedQuestionnaire> appliedQuestionnaires =
        insertQuestionnaires(cycleId, draft.configuration(), actorUserId);
    return new CreatedCycle(cycleId, appliedQuestionnaires);
  }

  @Override
  public boolean replaceDraftConfiguration(
      UUID cycleId, EvaluationCycleConfigurationDraft configuration, UUID actorUserId) {
    requireRequiredMigrations();
    if (!updateDraftCycle(cycleId, configuration)) {
      return false;
    }

    List<StoredAppliedQuestionnaire> existing = lockAppliedQuestionnaires(cycleId);
    List<StoredAppliedQuestionnaire> kept = new ArrayList<>();
    for (StoredAppliedQuestionnaire stored : existing) {
      if (contains(configuration.questionnaires(), stored)) {
        kept.add(stored);
      } else if (deleteAppliedQuestionnaire(cycleId, stored.cycleQuestionnaireId()) != 1) {
        throw conflict();
      }
    }

    for (AppliedQuestionnaireDraft desired : configuration.questionnaires()) {
      if (kept.stream().noneMatch(stored -> matches(desired, stored))) {
        insertAppliedQuestionnaire(cycleId, desired, actorUserId);
      }
    }
    return true;
  }

  @Override
  public Optional<EvaluationCycleStatus> lockCurrentStatus(UUID cycleId) {
    requireRequiredMigrations();
    List<EvaluationCycleStatus> statuses =
        jdbcTemplate.query(
            """
            SELECT situacao
            FROM dbo.ciclo_avaliacao WITH (UPDLOCK, HOLDLOCK)
            WHERE ciclo_avaliacao_id = ?
            """,
            (resultSet, rowNumber) ->
                EvaluationCycleStatus.valueOf(resultSet.getString("situacao")),
            cycleId);
    return statuses.stream().findFirst();
  }

  @Override
  public boolean transition(
      UUID cycleId,
      EvaluationCycleStatus sourceStatus,
      EvaluationCycleStatus targetStatus,
      UUID actorUserId,
      String requestId) {
    requireRequiredMigrations();
    int updated = updateCycleStatus(cycleId, sourceStatus, targetStatus, actorUserId);
    if (updated != 1) {
      return false;
    }
    int inserted =
        jdbcTemplate.update(
            """
            INSERT INTO dbo.transicao_ciclo_avaliacao (
                ciclo_avaliacao_id,
                situacao_origem,
                situacao_destino,
                ator_usuario_id,
                request_id
            ) VALUES (?, ?, ?, ?, ?)
            """,
            cycleId,
            sourceStatus.name(),
            targetStatus.name(),
            actorUserId,
            requestId);
    if (inserted != 1) {
      throw conflict();
    }
    return true;
  }

  @Override
  public void writeAdministrativeAudit(
      UUID actorUserId, String action, String resourceType, UUID resourceId, String requestId) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.evento_auditoria (
            ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id
        ) VALUES (?, ?, ?, ?, 'SUCESSO', ?)
        """,
        actorUserId,
        action,
        resourceType,
        resourceId,
        requestId);
  }

  private void insertDraftCycle(UUID cycleId, EvaluationCycleDraft draft) {
    EvaluationCycleConfigurationDraft configuration = draft.configuration();
    int inserted =
        jdbcTemplate.update(
            """
            INSERT INTO dbo.ciclo_avaliacao (
                ciclo_avaliacao_id,
                codigo,
                nome,
                situacao,
                janela_abertura_em_utc,
                janela_encerramento_em_utc,
                fuso_horario_iana,
                autoavaliacao_habilitada
            ) VALUES (?, ?, ?, 'RASCUNHO', ?, ?, ?, ?)
            """,
            cycleId,
            draft.code(),
            configuration.name(),
            SqlServerUtcDateTime.forBinding(configuration.openingAtUtc()),
            SqlServerUtcDateTime.forBinding(configuration.closingAtUtc()),
            configuration.timeZone(),
            configuration.selfAssessmentEnabled());
    if (inserted != 1) {
      throw conflict();
    }
  }

  private void insertCreationTransition(UUID cycleId, UUID actorUserId, String requestId) {
    int inserted =
        jdbcTemplate.update(
            """
            INSERT INTO dbo.transicao_ciclo_avaliacao (
                ciclo_avaliacao_id,
                situacao_origem,
                situacao_destino,
                ator_usuario_id,
                request_id
            ) VALUES (?, NULL, 'RASCUNHO', ?, ?)
            """,
            cycleId,
            actorUserId,
            requestId);
    if (inserted != 1) {
      throw conflict();
    }
  }

  private List<AppliedQuestionnaire> insertQuestionnaires(
      UUID cycleId, EvaluationCycleConfigurationDraft configuration, UUID actorUserId) {
    List<AppliedQuestionnaire> result = new ArrayList<>();
    for (AppliedQuestionnaireDraft desired : configuration.questionnaires()) {
      UUID cycleQuestionnaireId = insertAppliedQuestionnaire(cycleId, desired, actorUserId);
      result.add(new AppliedQuestionnaire(cycleQuestionnaireId, desired.questionnaireVersionId()));
    }
    return List.copyOf(result);
  }

  private UUID insertAppliedQuestionnaire(
      UUID cycleId, AppliedQuestionnaireDraft desired, UUID actorUserId) {
    UUID cycleQuestionnaireId = UUID.randomUUID();
    int inserted =
        jdbcTemplate.update(
            """
            INSERT INTO dbo.ciclo_questionario (
                ciclo_questionario_id,
                ciclo_avaliacao_id,
                versao_questionario_id,
                criado_por_usuario_id,
                configuracao_calculo_versao_id,
                matriz_classificacao_versao_id
            )
            SELECT ?, ciclo.ciclo_avaliacao_id, questionario.versao_questionario_id, ?,
                   configuracao.configuracao_calculo_versao_id,
                   matriz.matriz_classificacao_versao_id
            FROM dbo.ciclo_avaliacao AS ciclo
            INNER JOIN dbo.versao_questionario AS questionario
                ON questionario.versao_questionario_id = ?
            INNER JOIN dbo.configuracao_calculo_versao AS configuracao
                ON configuracao.configuracao_calculo_versao_id = ?
            INNER JOIN dbo.matriz_classificacao_versao AS matriz
                ON matriz.matriz_classificacao_versao_id = ?
               AND matriz.configuracao_calculo_versao_id
                    = configuracao.configuracao_calculo_versao_id
            WHERE ciclo.ciclo_avaliacao_id = ?
              AND ciclo.situacao = 'RASCUNHO'
              AND questionario.aprovado_em_utc IS NOT NULL
              AND configuracao.aprovado_em_utc IS NOT NULL
              AND matriz.aprovado_em_utc IS NOT NULL
            """,
            cycleQuestionnaireId,
            actorUserId,
            desired.questionnaireVersionId(),
            desired.calculationConfigurationVersionId(),
            desired.classificationMatrixVersionId(),
            cycleId);
    if (inserted != 1) {
      throw conflict();
    }
    return cycleQuestionnaireId;
  }

  private boolean updateDraftCycle(UUID cycleId, EvaluationCycleConfigurationDraft configuration) {
    return jdbcTemplate.update(
            """
            UPDATE dbo.ciclo_avaliacao
            SET nome = ?,
                janela_abertura_em_utc = ?,
                janela_encerramento_em_utc = ?,
                fuso_horario_iana = ?,
                autoavaliacao_habilitada = ?,
                atualizado_em_utc = SYSUTCDATETIME()
            WHERE ciclo_avaliacao_id = ? AND situacao = 'RASCUNHO'
            """,
            configuration.name(),
            SqlServerUtcDateTime.forBinding(configuration.openingAtUtc()),
            SqlServerUtcDateTime.forBinding(configuration.closingAtUtc()),
            configuration.timeZone(),
            configuration.selfAssessmentEnabled(),
            cycleId)
        == 1;
  }

  private int updateCycleStatus(
      UUID cycleId,
      EvaluationCycleStatus sourceStatus,
      EvaluationCycleStatus targetStatus,
      UUID actorUserId) {
    if (targetStatus == EvaluationCycleStatus.ABERTO) {
      if (sourceStatus != EvaluationCycleStatus.RASCUNHO) {
        throw conflict();
      }
      return jdbcTemplate.update(OPEN_CYCLE_SQL, actorUserId, cycleId, sourceStatus.name());
    }
    if (targetStatus == EvaluationCycleStatus.ENCERRADO) {
      if (sourceStatus != EvaluationCycleStatus.ABERTO) {
        throw conflict();
      }
      return jdbcTemplate.update(CLOSE_CYCLE_SQL, actorUserId, cycleId, sourceStatus.name());
    }
    throw conflict();
  }

  private List<StoredAppliedQuestionnaire> lockAppliedQuestionnaires(UUID cycleId) {
    return jdbcTemplate.query(
        """
        SELECT ciclo_questionario_id,
               versao_questionario_id,
               configuracao_calculo_versao_id,
               matriz_classificacao_versao_id
        FROM dbo.ciclo_questionario WITH (UPDLOCK, HOLDLOCK)
        WHERE ciclo_avaliacao_id = ?
        """,
        (resultSet, rowNumber) -> storedAppliedQuestionnaire(resultSet),
        cycleId);
  }

  private int deleteAppliedQuestionnaire(UUID cycleId, UUID cycleQuestionnaireId) {
    return jdbcTemplate.update(
        """
        DELETE FROM dbo.ciclo_questionario
        WHERE ciclo_questionario_id = ? AND ciclo_avaliacao_id = ?
        """,
        cycleQuestionnaireId,
        cycleId);
  }

  private void requireRequiredMigrations() {
    try {
      Integer applied =
          jdbcTemplate.queryForObject(
              """
              SELECT COUNT(*)
              FROM dbo.schema_migrations
              WHERE version IN ('V0003', 'V0005', 'V0007')
              """,
              Integer.class);
      if (applied == null || applied != 3) {
        throw unavailable();
      }
    } catch (DataAccessException exception) {
      throw unavailable();
    }
  }

  private static boolean contains(
      List<AppliedQuestionnaireDraft> desired, StoredAppliedQuestionnaire stored) {
    return desired.stream().anyMatch(item -> matches(item, stored));
  }

  private static boolean matches(
      AppliedQuestionnaireDraft desired, StoredAppliedQuestionnaire stored) {
    return desired.questionnaireVersionId().equals(stored.questionnaireVersionId())
        && desired
            .calculationConfigurationVersionId()
            .equals(stored.calculationConfigurationVersionId())
        && desired.classificationMatrixVersionId().equals(stored.classificationMatrixVersionId());
  }

  private static StoredAppliedQuestionnaire storedAppliedQuestionnaire(ResultSet resultSet)
      throws SQLException {
    return new StoredAppliedQuestionnaire(
        resultSet.getObject("ciclo_questionario_id", UUID.class),
        resultSet.getObject("versao_questionario_id", UUID.class),
        resultSet.getObject("configuracao_calculo_versao_id", UUID.class),
        resultSet.getObject("matriz_classificacao_versao_id", UUID.class));
  }

  private static EvaluationCycleAdministrationException conflict() {
    return new EvaluationCycleAdministrationException(
        EvaluationCycleAdministrationException.Reason.CONFLICT,
        "A operação conflita com o estado atual do ciclo.");
  }

  private static EvaluationCycleAdministrationException unavailable() {
    return new EvaluationCycleAdministrationException(
        EvaluationCycleAdministrationException.Reason.UNAVAILABLE,
        "A estrutura necessária para administrar ciclos ainda não está disponível.");
  }

  private record StoredAppliedQuestionnaire(
      UUID cycleQuestionnaireId,
      UUID questionnaireVersionId,
      UUID calculationConfigurationVersionId,
      UUID classificationMatrixVersionId) {}
}

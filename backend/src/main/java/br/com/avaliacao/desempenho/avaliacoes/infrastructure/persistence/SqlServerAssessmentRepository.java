package br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentConflictException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentConflictException.Reason;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentForbiddenException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentNotFoundException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRevision;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentValidationException;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentCycleAccessPolicy;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentCycleAccessPolicy.CycleState;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentLifecycle;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentResponseSet;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentResponseSet.AssessmentResponse;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentResult;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentResultCalculator;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentRuleViolation;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentScaleOption;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.PerformanceClassification;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.SqlServerUtcDateTime;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Adaptador SQL Server das avaliações v2024.1.
 *
 * <p>As alterações criam uma nova versão; nenhuma resposta, resultado ou versão anterior é
 * sobrescrita. O escopo de gestor/colaborador é conferido contra os vínculos atuais no banco em
 * cada operação que altera dados.
 */
@Repository
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.assessments", name = "enabled", havingValue = "true")
public class SqlServerAssessmentRepository implements AssessmentRepository {

  private static final String POLICY_VERSION = "2024.1";
  private static final int IDEMPOTENCY_KEY_MAXIMUM_LENGTH = 256;
  private static final int DRAFT_MAXIMUM_ANSWERS = 64;
  private static final int TEXT_MAXIMUM_LENGTH = 2000;
  private static final int REOPEN_REASON_MAXIMUM_LENGTH = 80;

  private final AssessmentCycleAccessPolicy cycleAccessPolicy = new AssessmentCycleAccessPolicy();

  private static final String ASSESSMENT_SELECT =
      """
      SELECT assessment.avaliacao_id,
             assessment.ciclo_avaliacao_id,
             assessment.ciclo_questionario_id,
             assessment.atribuicao_questionario_colaborador_id,
             assessment.colaborador_id,
             assessment.avaliador_usuario_id,
             assessment.vinculo_gestor_colaborador_id,
             assessment.vinculo_usuario_colaborador_id,
             assessment.tipo_avaliacao,
             assessment.situacao AS assessment_situacao,
             assessment.versao_atual_numero,
             assessment.atualizada_em_utc,
             cycle.nome AS cycle_name,
             cycle.situacao AS cycle_situation,
             cycle.janela_abertura_em_utc,
             cycle.janela_encerramento_em_utc,
             cycle_questionnaire.configuracao_calculo_versao_id,
             cycle_questionnaire.matriz_classificacao_versao_id,
             version.versao_avaliacao_id,
             version.row_version AS version_row_version,
             version.comentario,
             version.plano_acao
      FROM dbo.avaliacao AS assessment
      INNER JOIN dbo.ciclo_avaliacao AS cycle
          ON cycle.ciclo_avaliacao_id = assessment.ciclo_avaliacao_id
      INNER JOIN dbo.ciclo_questionario AS cycle_questionnaire
          ON cycle_questionnaire.ciclo_questionario_id = assessment.ciclo_questionario_id
      INNER JOIN dbo.versao_avaliacao AS version
          ON version.avaliacao_id = assessment.avaliacao_id
         AND version.numero = assessment.versao_atual_numero
      WHERE assessment.avaliacao_id = ?
      """;

  private static final String LOCKED_ASSESSMENT_SELECT =
      """
      SELECT assessment.avaliacao_id,
             assessment.ciclo_avaliacao_id,
             assessment.ciclo_questionario_id,
             assessment.atribuicao_questionario_colaborador_id,
             assessment.colaborador_id,
             assessment.avaliador_usuario_id,
             assessment.vinculo_gestor_colaborador_id,
             assessment.vinculo_usuario_colaborador_id,
             assessment.tipo_avaliacao,
             assessment.situacao AS assessment_situacao,
             assessment.versao_atual_numero,
             assessment.atualizada_em_utc,
             cycle.nome AS cycle_name,
             cycle.situacao AS cycle_situation,
             cycle.janela_abertura_em_utc,
             cycle.janela_encerramento_em_utc,
             cycle_questionnaire.configuracao_calculo_versao_id,
             cycle_questionnaire.matriz_classificacao_versao_id,
             version.versao_avaliacao_id,
             version.row_version AS version_row_version,
             version.comentario,
             version.plano_acao
      FROM dbo.avaliacao AS assessment WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN dbo.ciclo_avaliacao AS cycle WITH (UPDLOCK, HOLDLOCK)
          ON cycle.ciclo_avaliacao_id = assessment.ciclo_avaliacao_id
      INNER JOIN dbo.ciclo_questionario AS cycle_questionnaire WITH (UPDLOCK, HOLDLOCK)
          ON cycle_questionnaire.ciclo_questionario_id = assessment.ciclo_questionario_id
      INNER JOIN dbo.versao_avaliacao AS version WITH (UPDLOCK, HOLDLOCK)
          ON version.avaliacao_id = assessment.avaliacao_id
         AND version.numero = assessment.versao_atual_numero
      WHERE assessment.avaliacao_id = ?
      """;

  private static final String LIST_ACCESSIBLE_SQL =
      """
      SELECT TOP (?)
             assessment.avaliacao_id,
             assessment.ciclo_avaliacao_id,
             cycle.nome AS cycle_name,
             collaborator.nome_exibicao AS collaborator_display_name,
             assessment.tipo_avaliacao,
             assessment.situacao AS assessment_situation,
             version.row_version AS version_row_version,
             assessment.atualizada_em_utc
      FROM dbo.avaliacao AS assessment
      INNER JOIN dbo.ciclo_avaliacao AS cycle
          ON cycle.ciclo_avaliacao_id = assessment.ciclo_avaliacao_id
      INNER JOIN dbo.colaborador AS collaborator
          ON collaborator.colaborador_id = assessment.colaborador_id
      INNER JOIN dbo.versao_avaliacao AS version
          ON version.avaliacao_id = assessment.avaliacao_id
         AND version.numero = assessment.versao_atual_numero
      WHERE ((? = 1)
         OR (
             assessment.avaliador_usuario_id = ?
             AND (
                 (assessment.tipo_avaliacao = 'GESTOR' AND ? = 1 AND EXISTS (
                     SELECT 1
                     FROM dbo.vinculo_gestor_colaborador AS manager_link
                     WHERE manager_link.vinculo_gestor_colaborador_id
                               = assessment.vinculo_gestor_colaborador_id
                       AND manager_link.gestor_usuario_id = ?
                       AND manager_link.colaborador_id = assessment.colaborador_id
                       AND manager_link.revogado_em_utc IS NULL
                       AND (manager_link.inicio_vigencia IS NULL
                            OR manager_link.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME()))
                       AND (manager_link.fim_vigencia IS NULL
                            OR manager_link.fim_vigencia >= CONVERT(date, SYSUTCDATETIME()))
                 ))
                 OR (assessment.tipo_avaliacao = 'AUTOAVALIACAO' AND ? = 1 AND EXISTS (
                     SELECT 1
                     FROM dbo.vinculo_usuario_colaborador AS user_link
                     WHERE user_link.vinculo_usuario_colaborador_id
                               = assessment.vinculo_usuario_colaborador_id
                       AND user_link.usuario_id = ?
                       AND user_link.colaborador_id = assessment.colaborador_id
                       AND user_link.encerrado_em_utc IS NULL
                       AND user_link.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME())
                       AND (user_link.fim_vigencia IS NULL
                            OR user_link.fim_vigencia >= CONVERT(date, SYSUTCDATETIME()))
                 ))
             )
          ))
      AND (? IS NULL OR assessment.ciclo_avaliacao_id = ?)
      AND (? IS NULL OR assessment.colaborador_id = ?)
      """;

  private static final String LIST_ACCESSIBLE_AFTER_CURSOR_SQL =
      LIST_ACCESSIBLE_SQL
          + """
      AND (
          assessment.atualizada_em_utc < ?
          OR (assessment.atualizada_em_utc = ? AND assessment.avaliacao_id < ?)
      )
      ORDER BY assessment.atualizada_em_utc DESC, assessment.avaliacao_id DESC
      """;

  private static final String LIST_ACCESSIBLE_FIRST_PAGE_SQL =
      LIST_ACCESSIBLE_SQL
          + "ORDER BY assessment.atualizada_em_utc DESC, assessment.avaliacao_id DESC";

  static String accessibleListSql() {
    return LIST_ACCESSIBLE_SQL;
  }

  private static final String LIST_MANAGER_CREATION_OPTIONS_SQL =
      """
      SELECT assignment.colaborador_id AS collaborator_id,
             collaborator.nome_exibicao AS collaborator_display_name
      FROM dbo.ciclo_avaliacao AS cycle
      INNER JOIN dbo.atribuicao_questionario_colaborador AS assignment
          ON assignment.ciclo_avaliacao_id = cycle.ciclo_avaliacao_id
         AND assignment.revogado_em_utc IS NULL
      INNER JOIN dbo.colaborador AS collaborator
          ON collaborator.colaborador_id = assignment.colaborador_id
      INNER JOIN dbo.vinculo_gestor_colaborador AS manager_link
          ON manager_link.colaborador_id = assignment.colaborador_id
         AND manager_link.gestor_usuario_id = ?
         AND manager_link.revogado_em_utc IS NULL
         AND (manager_link.inicio_vigencia IS NULL
              OR manager_link.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME()))
         AND (manager_link.fim_vigencia IS NULL
              OR manager_link.fim_vigencia >= CONVERT(date, SYSUTCDATETIME()))
      INNER JOIN dbo.usuario AS actor_user
          ON actor_user.usuario_id = ?
         AND actor_user.situacao = 'ATIVO'
      WHERE cycle.ciclo_avaliacao_id = ?
        AND cycle.situacao = 'ABERTO'
        AND cycle.janela_abertura_em_utc <= SYSUTCDATETIME()
        AND cycle.janela_encerramento_em_utc > SYSUTCDATETIME()
        AND NOT EXISTS (
            SELECT 1
            FROM dbo.avaliacao AS assessment
            WHERE assessment.ciclo_avaliacao_id = cycle.ciclo_avaliacao_id
              AND assessment.colaborador_id = assignment.colaborador_id
              AND assessment.tipo_avaliacao = 'GESTOR'
        )
      ORDER BY collaborator.nome_exibicao, assignment.colaborador_id
      """;

  static String managerCreationOptionsSql() {
    return LIST_MANAGER_CREATION_OPTIONS_SQL;
  }

  private final JdbcTemplate jdbcTemplate;
  private final TransactionTemplate transactionTemplate;
  private final AssessmentLifecycle lifecycle = new AssessmentLifecycle();
  private final AssessmentResultCalculator resultCalculator = new AssessmentResultCalculator();

  public SqlServerAssessmentRepository(
      JdbcTemplate jdbcTemplate, TransactionTemplate transactionTemplate) {
    this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate não pode ser nulo");
    this.transactionTemplate =
        Objects.requireNonNull(transactionTemplate, "transactionTemplate não pode ser nulo");
  }

  @Override
  public AssessmentPageView listAccessible(
      AssessmentAccessContext actor,
      AssessmentListFilter filter,
      int limit,
      AssessmentCursor cursor) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    AssessmentListFilter safeFilter =
        Objects.requireNonNullElse(filter, AssessmentListFilter.none());
    if (!isActorActive(safeActor.userId())) {
      return new AssessmentPageView(List.of(), null);
    }
    List<AssessmentSummaryView> items =
        new java.util.ArrayList<>(
            cursor == null
                ? jdbcTemplate.query(
                    LIST_ACCESSIBLE_FIRST_PAGE_SQL,
                    (resultSet, rowNumber) -> mapSummary(resultSet),
                    limit + 1,
                    safeActor.has("AVALIACOES.VISUALIZAR_TODAS") ? 1 : 0,
                    safeActor.userId(),
                    safeActor.has("AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS") ? 1 : 0,
                    safeActor.userId(),
                    safeActor.has("AUTOAVALIACOES.VISUALIZAR_PROPRIA") ? 1 : 0,
                    safeActor.userId(),
                    safeFilter.cycleId(),
                    safeFilter.cycleId(),
                    safeFilter.collaboratorId(),
                    safeFilter.collaboratorId())
                : jdbcTemplate.query(
                    LIST_ACCESSIBLE_AFTER_CURSOR_SQL,
                    (resultSet, rowNumber) -> mapSummary(resultSet),
                    limit + 1,
                    safeActor.has("AVALIACOES.VISUALIZAR_TODAS") ? 1 : 0,
                    safeActor.userId(),
                    safeActor.has("AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS") ? 1 : 0,
                    safeActor.userId(),
                    safeActor.has("AUTOAVALIACOES.VISUALIZAR_PROPRIA") ? 1 : 0,
                    safeActor.userId(),
                    safeFilter.cycleId(),
                    safeFilter.cycleId(),
                    safeFilter.collaboratorId(),
                    safeFilter.collaboratorId(),
                    SqlServerUtcDateTime.forBinding(cursor.updatedAt()),
                    SqlServerUtcDateTime.forBinding(cursor.updatedAt()),
                    cursor.id()));
    AssessmentCursor nextCursor = null;
    if (items.size() > limit) {
      items.remove(items.size() - 1);
      AssessmentSummaryView last = items.get(items.size() - 1);
      nextCursor = new AssessmentCursor(last.updatedAt(), last.id());
    }
    return new AssessmentPageView(List.copyOf(items), nextCursor);
  }

  @Override
  public List<ManagerCreationOptionView> listManagerCreationOptions(
      UUID cycleId, AssessmentAccessContext actor) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    requirePermission(safeActor, "AVALIACOES.AVALIAR_VINCULADOS");
    return jdbcTemplate.query(
        LIST_MANAGER_CREATION_OPTIONS_SQL,
        (resultSet, rowNumber) ->
            new ManagerCreationOptionView(
                resultSet.getObject("collaborator_id", UUID.class),
                resultSet.getString("collaborator_display_name")),
        safeActor.userId(),
        safeActor.userId(),
        Objects.requireNonNull(cycleId, "cycleId não pode ser nulo"));
  }

  @Override
  public Optional<AssessmentDetailView> findAccessible(
      UUID assessmentId, AssessmentAccessContext actor) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    Optional<LockedAssessment> assessment = findAssessment(assessmentId, false);
    if (assessment.isEmpty() || !canView(assessment.get(), safeActor)) {
      return Optional.empty();
    }
    return Optional.of(toDetail(assessment.get()));
  }

  @Override
  public void recordPrint(UUID assessmentId, AssessmentAccessContext actor, String requestId) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    Optional<LockedAssessment> assessment = findAssessment(assessmentId, false);
    if (assessment.isEmpty() || !canView(assessment.get(), safeActor)) {
      safeDeniedAudit(safeActor.userId(), "AVALIACOES.IMPRIMIR", assessmentId, requestId);
      throw new AssessmentForbiddenException();
    }
    writeAudit(
        safeActor.userId(),
        "AVALIACOES.IMPRIMIR",
        assessmentId,
        "SUCESSO",
        requestId,
        POLICY_VERSION);
  }

  @Override
  public AssessmentDetailView createManagerDraft(
      UUID cycleId,
      UUID collaboratorId,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    try {
      return inTransaction(
          () -> {
            IdempotencyDecision decision =
                beginIdempotent(
                    safeActor,
                    "AVALIACOES.CRIAR_GESTOR",
                    idempotencyKey,
                    canonical(cycleId, collaboratorId));
            if (decision.replayedAssessmentId() != null) {
              LockedAssessment replay = requireLocked(decision.replayedAssessmentId());
              requireView(replay, safeActor);
              writeAudit(
                  safeActor.userId(),
                  "AVALIACOES.CRIAR_GESTOR",
                  replay.id(),
                  "SUCESSO",
                  requestId,
                  "REPETICAO_IDEMPOTENTE");
              return toDetail(replay);
            }

            CreationScope scope = requireManagerCreationScope(cycleId, collaboratorId, safeActor);
            UUID assessmentId = UUID.randomUUID();
            UUID versionId = UUID.randomUUID();
            insertAssessment(
                assessmentId,
                scope,
                safeActor.userId(),
                AssessmentType.GESTOR,
                scope.managerLinkId(),
                null);
            insertVersion(
                versionId,
                assessmentId,
                scope.cycleQuestionnaireId(),
                1,
                AssessmentStatus.RASCUNHO,
                "CRIACAO",
                safeActor.userId(),
                null,
                null);
            insertTransition(
                assessmentId,
                versionId,
                null,
                AssessmentStatus.RASCUNHO,
                "CRIACAO",
                safeActor.userId(),
                requestId,
                null);
            completeIdempotent(decision, 201, assessmentId);
            writeAudit(
                safeActor.userId(),
                "AVALIACOES.CRIAR_GESTOR",
                assessmentId,
                "SUCESSO",
                requestId,
                POLICY_VERSION);
            return toDetail(requireLocked(assessmentId));
          });
    } catch (AssessmentForbiddenException exception) {
      safeDeniedAudit(safeActor.userId(), "AVALIACOES.CRIAR_GESTOR", null, requestId);
      throw exception;
    } catch (DataIntegrityViolationException exception) {
      throw new AssessmentConflictException(
          Reason.DUPLICATE_EVALUATION, "A avaliação já existe para este ciclo e colaborador.");
    }
  }

  @Override
  public AssessmentDetailView createSelfAssessmentDraft(
      UUID cycleId, AssessmentAccessContext actor, String idempotencyKey, String requestId) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    try {
      return inTransaction(
          () -> {
            IdempotencyDecision decision =
                beginIdempotent(
                    safeActor, "AUTOAVALIACOES.CRIAR", idempotencyKey, canonical(cycleId));
            if (decision.replayedAssessmentId() != null) {
              LockedAssessment replay = requireLocked(decision.replayedAssessmentId());
              requireView(replay, safeActor);
              writeAudit(
                  safeActor.userId(),
                  "AUTOAVALIACOES.CRIAR",
                  replay.id(),
                  "SUCESSO",
                  requestId,
                  "REPETICAO_IDEMPOTENTE");
              return toDetail(replay);
            }

            CreationScope scope = requireSelfCreationScope(cycleId, safeActor);
            UUID assessmentId = UUID.randomUUID();
            UUID versionId = UUID.randomUUID();
            insertAssessment(
                assessmentId,
                scope,
                safeActor.userId(),
                AssessmentType.AUTOAVALIACAO,
                null,
                scope.userCollaboratorLinkId());
            insertVersion(
                versionId,
                assessmentId,
                scope.cycleQuestionnaireId(),
                1,
                AssessmentStatus.RASCUNHO,
                "CRIACAO",
                safeActor.userId(),
                null,
                null);
            insertTransition(
                assessmentId,
                versionId,
                null,
                AssessmentStatus.RASCUNHO,
                "CRIACAO",
                safeActor.userId(),
                requestId,
                null);
            completeIdempotent(decision, 201, assessmentId);
            writeAudit(
                safeActor.userId(),
                "AUTOAVALIACOES.CRIAR",
                assessmentId,
                "SUCESSO",
                requestId,
                POLICY_VERSION);
            return toDetail(requireLocked(assessmentId));
          });
    } catch (AssessmentForbiddenException exception) {
      safeDeniedAudit(safeActor.userId(), "AUTOAVALIACOES.CRIAR", null, requestId);
      throw exception;
    } catch (DataIntegrityViolationException exception) {
      throw new AssessmentConflictException(
          Reason.DUPLICATE_EVALUATION, "A autoavaliação já existe para este ciclo.");
    }
  }

  @Override
  public AssessmentDetailView replaceDraft(
      UUID assessmentId,
      DraftContent draft,
      String expectedRevision,
      AssessmentAccessContext actor,
      String requestId) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    try {
      return inTransaction(
          () -> {
            LockedAssessment current = requireLocked(assessmentId);
            requireEditable(current, safeActor);
            requireRevision(expectedRevision, current.versionRowVersion());
            DraftContent normalizedDraft = normalizeDraft(draft);
            QuestionnaireCatalog catalog = loadQuestionnaireCatalog(current.cycleQuestionnaireId());
            validateDraftAnswers(normalizedDraft.answers(), catalog);

            UUID versionId = UUID.randomUUID();
            int nextVersionNumber = nextVersionNumber(current);
            insertVersion(
                versionId,
                current.id(),
                current.cycleQuestionnaireId(),
                nextVersionNumber,
                AssessmentStatus.RASCUNHO,
                "EDICAO",
                safeActor.userId(),
                normalizedDraft.comment(),
                normalizedDraft.actionPlan());
            insertAnswers(versionId, normalizedDraft.answers());
            updateCurrentVersion(current, nextVersionNumber, AssessmentStatus.RASCUNHO);
            writeAudit(
                safeActor.userId(),
                actionFor(current.type(), "EDITAR"),
                current.id(),
                "SUCESSO",
                requestId,
                POLICY_VERSION);
            return toDetail(requireLocked(current.id()));
          });
    } catch (AssessmentForbiddenException exception) {
      safeDeniedAudit(safeActor.userId(), "AVALIACOES.EDITAR", assessmentId, requestId);
      throw exception;
    }
  }

  @Override
  public AssessmentDetailView submit(
      UUID assessmentId,
      String expectedRevision,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    try {
      return inTransaction(
          () -> {
            IdempotencyDecision decision =
                beginIdempotent(
                    safeActor,
                    "AVALIACOES.ENVIAR",
                    idempotencyKey,
                    canonical(assessmentId, expectedRevision));
            if (decision.replayedAssessmentId() != null) {
              LockedAssessment replay = requireLocked(decision.replayedAssessmentId());
              requireView(replay, safeActor);
              writeAudit(
                  safeActor.userId(),
                  actionFor(replay.type(), "ENVIAR"),
                  replay.id(),
                  "SUCESSO",
                  requestId,
                  "REPETICAO_IDEMPOTENTE");
              return toDetail(replay);
            }

            LockedAssessment current = requireLocked(assessmentId);
            requireSubmit(current, safeActor);
            requireRevision(expectedRevision, current.versionRowVersion());
            QuestionnaireCatalog catalog = loadQuestionnaireCatalog(current.cycleQuestionnaireId());
            List<PersistedAnswer> answers = loadPersistedAnswers(current.versionId());
            validatePersistedAnswers(answers, catalog);
            AssessmentResponseSet responseSet =
                AssessmentResponseSet.from(
                    answers.stream()
                        .map(
                            answer ->
                                new AssessmentResponse(answer.questionId(), answer.optionId()))
                        .toList());
            try {
              lifecycle.submit(
                  current.status(), responseSet, new ArrayList<>(catalog.questionIds()));
            } catch (AssessmentRuleViolation exception) {
              throw new AssessmentConflictException(
                  Reason.INVALID_STATE_TRANSITION,
                  "A avaliação não pode ser enviada no estado atual.");
            }
            AssessmentResult result =
                resultCalculator.calculate(
                    answers.stream().map(answer -> optionForPoints(answer.points())).toList(),
                    catalog.questionIds().size());

            UUID versionId = UUID.randomUUID();
            int nextVersionNumber = nextVersionNumber(current);
            insertVersion(
                versionId,
                current.id(),
                current.cycleQuestionnaireId(),
                nextVersionNumber,
                AssessmentStatus.ENVIADA,
                "ENVIO",
                safeActor.userId(),
                current.comment(),
                current.actionPlan());
            copyAnswers(current.versionId(), versionId);
            insertResult(
                current.id(),
                versionId,
                current.calculationConfigurationId(),
                current.classificationMatrixId(),
                result);
            updateCurrentVersion(current, nextVersionNumber, AssessmentStatus.ENVIADA);
            insertTransition(
                current.id(),
                versionId,
                AssessmentStatus.RASCUNHO,
                AssessmentStatus.ENVIADA,
                "ENVIO",
                safeActor.userId(),
                requestId,
                null);
            completeIdempotent(decision, 200, current.id());
            writeAudit(
                safeActor.userId(),
                actionFor(current.type(), "ENVIAR"),
                current.id(),
                "SUCESSO",
                requestId,
                POLICY_VERSION);
            return toDetail(requireLocked(current.id()));
          });
    } catch (AssessmentForbiddenException exception) {
      safeDeniedAudit(safeActor.userId(), "AVALIACOES.ENVIAR", assessmentId, requestId);
      throw exception;
    }
  }

  @Override
  public AssessmentDetailView publish(
      UUID assessmentId, AssessmentAccessContext actor, String idempotencyKey, String requestId) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    try {
      return inTransaction(
          () -> {
            IdempotencyDecision decision =
                beginIdempotent(
                    safeActor, "AVALIACOES.PUBLICAR", idempotencyKey, canonical(assessmentId));
            if (decision.replayedAssessmentId() != null) {
              LockedAssessment replay = requireLocked(decision.replayedAssessmentId());
              requireView(replay, safeActor);
              writeAudit(
                  safeActor.userId(),
                  "AVALIACOES.PUBLICAR",
                  replay.id(),
                  "SUCESSO",
                  requestId,
                  "REPETICAO_IDEMPOTENTE");
              return toDetail(replay);
            }

            LockedAssessment current = requireLocked(assessmentId);
            requirePublish(current, safeActor);
            try {
              lifecycle.publish(current.status());
            } catch (AssessmentRuleViolation exception) {
              throw new AssessmentConflictException(
                  Reason.INVALID_STATE_TRANSITION,
                  "A avaliação não pode ser publicada no estado atual.");
            }
            StoredResult result = requireStoredResult(current.versionId());
            UUID versionId = UUID.randomUUID();
            int nextVersionNumber = nextVersionNumber(current);
            insertVersion(
                versionId,
                current.id(),
                current.cycleQuestionnaireId(),
                nextVersionNumber,
                AssessmentStatus.PUBLICADA,
                "PUBLICACAO",
                safeActor.userId(),
                current.comment(),
                current.actionPlan());
            copyAnswers(current.versionId(), versionId);
            copyResult(current.id(), versionId, result);
            updateCurrentVersion(current, nextVersionNumber, AssessmentStatus.PUBLICADA);
            insertTransition(
                current.id(),
                versionId,
                AssessmentStatus.ENVIADA,
                AssessmentStatus.PUBLICADA,
                "PUBLICACAO",
                safeActor.userId(),
                requestId,
                null);
            completeIdempotent(decision, 200, current.id());
            writeAudit(
                safeActor.userId(),
                "AVALIACOES.PUBLICAR",
                current.id(),
                "SUCESSO",
                requestId,
                POLICY_VERSION);
            return toDetail(requireLocked(current.id()));
          });
    } catch (AssessmentForbiddenException exception) {
      safeDeniedAudit(safeActor.userId(), "AVALIACOES.PUBLICAR", assessmentId, requestId);
      throw exception;
    }
  }

  @Override
  public AssessmentDetailView reopen(
      UUID assessmentId,
      String reason,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor não pode ser nulo");
    String normalizedReason = normalizeReason(reason);
    try {
      return inTransaction(
          () -> {
            IdempotencyDecision decision =
                beginIdempotent(
                    safeActor,
                    "AVALIACOES.REABRIR",
                    idempotencyKey,
                    canonical(assessmentId, normalizedReason));
            if (decision.replayedAssessmentId() != null) {
              LockedAssessment replay = requireLocked(decision.replayedAssessmentId());
              requireView(replay, safeActor);
              writeAudit(
                  safeActor.userId(),
                  "AVALIACOES.REABRIR",
                  replay.id(),
                  "SUCESSO",
                  requestId,
                  "REPETICAO_IDEMPOTENTE");
              return toDetail(replay);
            }

            LockedAssessment current = requireLocked(assessmentId);
            requireReopen(current, safeActor);
            try {
              lifecycle.reopen(current.status());
            } catch (AssessmentRuleViolation exception) {
              throw new AssessmentConflictException(
                  Reason.INVALID_STATE_TRANSITION,
                  "A avaliação não pode ser reaberta no estado atual.");
            }
            UUID versionId = UUID.randomUUID();
            int nextVersionNumber = nextVersionNumber(current);
            insertVersion(
                versionId,
                current.id(),
                current.cycleQuestionnaireId(),
                nextVersionNumber,
                AssessmentStatus.RASCUNHO,
                "REABERTURA",
                safeActor.userId(),
                null,
                null);
            updateCurrentVersion(current, nextVersionNumber, AssessmentStatus.RASCUNHO);
            insertTransition(
                current.id(),
                versionId,
                AssessmentStatus.PUBLICADA,
                AssessmentStatus.RASCUNHO,
                "REABERTURA",
                safeActor.userId(),
                requestId,
                normalizedReason);
            completeIdempotent(decision, 200, current.id());
            writeAudit(
                safeActor.userId(),
                "AVALIACOES.REABRIR",
                current.id(),
                "SUCESSO",
                requestId,
                POLICY_VERSION);
            return toDetail(requireLocked(current.id()));
          });
    } catch (AssessmentForbiddenException exception) {
      safeDeniedAudit(safeActor.userId(), "AVALIACOES.REABRIR", assessmentId, requestId);
      throw exception;
    }
  }

  private CreationScope requireManagerCreationScope(
      UUID cycleId, UUID collaboratorId, AssessmentAccessContext actor) {
    requirePermission(actor, "AVALIACOES.AVALIAR_VINCULADOS");
    Optional<CreationScope> scope =
        jdbcTemplate.query(
            """
            SELECT cycle.ciclo_avaliacao_id AS cycle_id,
                   assignment.atribuicao_questionario_colaborador_id,
                   assignment.ciclo_questionario_id,
                   assignment.colaborador_id,
                   manager_link.vinculo_gestor_colaborador_id
            FROM dbo.ciclo_avaliacao AS cycle WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.atribuicao_questionario_colaborador AS assignment WITH (UPDLOCK, HOLDLOCK)
                ON assignment.ciclo_avaliacao_id = cycle.ciclo_avaliacao_id
               AND assignment.colaborador_id = ?
               AND assignment.revogado_em_utc IS NULL
            INNER JOIN dbo.vinculo_gestor_colaborador AS manager_link WITH (UPDLOCK, HOLDLOCK)
                ON manager_link.colaborador_id = assignment.colaborador_id
               AND manager_link.gestor_usuario_id = ?
               AND manager_link.revogado_em_utc IS NULL
               AND (manager_link.inicio_vigencia IS NULL
                    OR manager_link.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME()))
               AND (manager_link.fim_vigencia IS NULL
                    OR manager_link.fim_vigencia >= CONVERT(date, SYSUTCDATETIME()))
            INNER JOIN dbo.usuario AS actor_user WITH (UPDLOCK, HOLDLOCK)
                ON actor_user.usuario_id = ?
               AND actor_user.situacao = 'ATIVO'
            WHERE cycle.ciclo_avaliacao_id = ?
              AND cycle.situacao = 'ABERTO'
              AND cycle.janela_abertura_em_utc <= SYSUTCDATETIME()
              AND cycle.janela_encerramento_em_utc > SYSUTCDATETIME()
            """,
            resultSet ->
                resultSet.next()
                    ? Optional.of(mapManagerCreationScope(resultSet))
                    : Optional.empty(),
            collaboratorId,
            actor.userId(),
            actor.userId(),
            cycleId);
    return scope.orElseThrow(AssessmentForbiddenException::new);
  }

  private CreationScope requireSelfCreationScope(UUID cycleId, AssessmentAccessContext actor) {
    requirePermission(actor, "AUTOAVALIACOES.PREENCHER_PROPRIA");
    Optional<CreationScope> scope =
        jdbcTemplate.query(
            """
            SELECT cycle.ciclo_avaliacao_id AS cycle_id,
                   assignment.atribuicao_questionario_colaborador_id,
                   assignment.ciclo_questionario_id,
                   assignment.colaborador_id,
                   user_link.vinculo_usuario_colaborador_id
            FROM dbo.ciclo_avaliacao AS cycle WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.vinculo_usuario_colaborador AS user_link WITH (UPDLOCK, HOLDLOCK)
                ON user_link.usuario_id = ?
               AND user_link.encerrado_em_utc IS NULL
               AND user_link.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME())
               AND (user_link.fim_vigencia IS NULL
                    OR user_link.fim_vigencia >= CONVERT(date, SYSUTCDATETIME()))
            INNER JOIN dbo.atribuicao_questionario_colaborador AS assignment WITH (UPDLOCK, HOLDLOCK)
                ON assignment.ciclo_avaliacao_id = cycle.ciclo_avaliacao_id
               AND assignment.colaborador_id = user_link.colaborador_id
               AND assignment.revogado_em_utc IS NULL
            INNER JOIN dbo.usuario AS actor_user WITH (UPDLOCK, HOLDLOCK)
                ON actor_user.usuario_id = ?
               AND actor_user.situacao = 'ATIVO'
            WHERE cycle.ciclo_avaliacao_id = ?
              AND cycle.situacao = 'ABERTO'
              AND cycle.autoavaliacao_habilitada = 1
              AND cycle.janela_abertura_em_utc <= SYSUTCDATETIME()
              AND cycle.janela_encerramento_em_utc > SYSUTCDATETIME()
            """,
            resultSet ->
                resultSet.next() ? Optional.of(mapSelfCreationScope(resultSet)) : Optional.empty(),
            actor.userId(),
            actor.userId(),
            cycleId);
    return scope.orElseThrow(AssessmentForbiddenException::new);
  }

  private void requireEditable(LockedAssessment assessment, AssessmentAccessContext actor) {
    requireActiveActor(actor.userId());
    requireContributionWindow(assessment);
    try {
      lifecycle.requireDraftEditable(assessment.status());
    } catch (AssessmentRuleViolation exception) {
      throw invalidTransition();
    }
    if (assessment.type() == AssessmentType.GESTOR) {
      requirePermission(actor, "AVALIACOES.AVALIAR_VINCULADOS");
      requireAuthor(assessment, actor);
      requireActiveManagerLink(assessment, actor.userId());
      return;
    }
    requirePermission(actor, "AUTOAVALIACOES.PREENCHER_PROPRIA");
    requireAuthor(assessment, actor);
    requireActiveUserCollaboratorLink(assessment, actor.userId());
  }

  private void requireSubmit(LockedAssessment assessment, AssessmentAccessContext actor) {
    requireActiveActor(actor.userId());
    requireContributionWindow(assessment);
    requireAuthor(assessment, actor);
    if (assessment.type() == AssessmentType.GESTOR) {
      requirePermission(actor, "AVALIACOES.AVALIAR_VINCULADOS");
      requireActiveManagerLink(assessment, actor.userId());
      return;
    }
    requirePermission(actor, "AUTOAVALIACOES.ENVIAR_PROPRIA");
    requireActiveUserCollaboratorLink(assessment, actor.userId());
  }

  private void requirePublish(LockedAssessment assessment, AssessmentAccessContext actor) {
    requireActiveActor(actor.userId());
    requirePermission(actor, "AVALIACOES.PUBLICAR");
    requireAdministrativeDecisionRole(actor);
    requireAdministrativeDecisionWindow(assessment);
    if (assessment.type() != AssessmentType.GESTOR) {
      throw new AssessmentForbiddenException();
    }
  }

  private void requireReopen(LockedAssessment assessment, AssessmentAccessContext actor) {
    requireActiveActor(actor.userId());
    requirePermission(actor, "AVALIACOES.REABRIR");
    requireAdministrativeDecisionRole(actor);
    requireAdministrativeDecisionWindow(assessment);
    if (assessment.type() != AssessmentType.GESTOR) {
      throw new AssessmentForbiddenException();
    }
  }

  private static void requireAdministrativeDecisionRole(AssessmentAccessContext actor) {
    if (actor.hasRole("ADMINISTRADOR_PLATAFORMA")
        || (!actor.hasRole("GERENCIA_RH") && !actor.hasRole("DIRETORIA"))) {
      throw new AssessmentForbiddenException();
    }
  }

  private void requireView(LockedAssessment assessment, AssessmentAccessContext actor) {
    if (!canView(assessment, actor)) {
      throw new AssessmentForbiddenException();
    }
  }

  private boolean canView(LockedAssessment assessment, AssessmentAccessContext actor) {
    if (!isActorActive(actor.userId())) {
      return false;
    }
    if (actor.has("AVALIACOES.VISUALIZAR_TODAS")) {
      return true;
    }
    if (!assessment.authorUserId().equals(actor.userId())) {
      return false;
    }
    if (assessment.type() == AssessmentType.GESTOR) {
      return actor.has("AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS")
          && hasActiveManagerLink(assessment, actor.userId());
    }
    return actor.has("AUTOAVALIACOES.VISUALIZAR_PROPRIA")
        && hasActiveUserCollaboratorLink(assessment, actor.userId());
  }

  private void requireActiveActor(UUID actorId) {
    if (!isActorActive(actorId)) {
      throw new AssessmentForbiddenException();
    }
  }

  private boolean isActorActive(UUID actorId) {
    return Boolean.TRUE.equals(
        jdbcTemplate.query(
            """
            SELECT CAST(CASE WHEN EXISTS (
                SELECT 1 FROM dbo.usuario
                WHERE usuario_id = ? AND situacao = 'ATIVO'
            ) THEN 1 ELSE 0 END AS bit)
            """,
            resultSet -> resultSet.next() && resultSet.getBoolean(1),
            actorId));
  }

  private void requireAuthor(LockedAssessment assessment, AssessmentAccessContext actor) {
    if (!assessment.authorUserId().equals(actor.userId())) {
      throw new AssessmentForbiddenException();
    }
  }

  private void requirePermission(AssessmentAccessContext actor, String permission) {
    if (!actor.has(permission)) {
      throw new AssessmentForbiddenException();
    }
  }

  private void requireActiveManagerLink(LockedAssessment assessment, UUID actorId) {
    if (!hasActiveManagerLink(assessment, actorId)) {
      throw new AssessmentForbiddenException();
    }
  }

  private boolean hasActiveManagerLink(LockedAssessment assessment, UUID actorId) {
    if (assessment.managerLinkId() == null) {
      return false;
    }
    return Boolean.TRUE.equals(
        jdbcTemplate.query(
            """
            SELECT CAST(CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.vinculo_gestor_colaborador AS manager_link WITH (UPDLOCK, HOLDLOCK)
                WHERE manager_link.vinculo_gestor_colaborador_id = ?
                  AND manager_link.gestor_usuario_id = ?
                  AND manager_link.colaborador_id = ?
                  AND manager_link.revogado_em_utc IS NULL
                  AND (manager_link.inicio_vigencia IS NULL
                       OR manager_link.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME()))
                  AND (manager_link.fim_vigencia IS NULL
                       OR manager_link.fim_vigencia >= CONVERT(date, SYSUTCDATETIME()))
            ) THEN 1 ELSE 0 END AS bit)
            """,
            resultSet -> resultSet.next() && resultSet.getBoolean(1),
            assessment.managerLinkId(),
            actorId,
            assessment.collaboratorId()));
  }

  private void requireActiveUserCollaboratorLink(LockedAssessment assessment, UUID actorId) {
    if (!hasActiveUserCollaboratorLink(assessment, actorId)) {
      throw new AssessmentForbiddenException();
    }
  }

  private boolean hasActiveUserCollaboratorLink(LockedAssessment assessment, UUID actorId) {
    if (assessment.userCollaboratorLinkId() == null) {
      return false;
    }
    return Boolean.TRUE.equals(
        jdbcTemplate.query(
            """
            SELECT CAST(CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.vinculo_usuario_colaborador AS user_link WITH (UPDLOCK, HOLDLOCK)
                WHERE user_link.vinculo_usuario_colaborador_id = ?
                  AND user_link.usuario_id = ?
                  AND user_link.colaborador_id = ?
                  AND user_link.encerrado_em_utc IS NULL
                  AND user_link.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME())
                  AND (user_link.fim_vigencia IS NULL
                       OR user_link.fim_vigencia >= CONVERT(date, SYSUTCDATETIME()))
            ) THEN 1 ELSE 0 END AS bit)
            """,
            resultSet -> resultSet.next() && resultSet.getBoolean(1),
            assessment.userCollaboratorLinkId(),
            actorId,
            assessment.collaboratorId()));
  }

  private void requireContributionWindow(LockedAssessment assessment) {
    if (cycleAccessPolicy.permitsRegularContribution(
        assessment.cycleState(), assessment.opensAt(), assessment.closesAt(), Instant.now())) {
      return;
    }
    if (assessment.cycleState() == CycleState.CLOSED
        && cycleAccessPolicy.permitsPostClosingReopenedContribution(
            assessment.cycleState(),
            assessment.type(),
            assessment.status(),
            hasAdministrativeReopen(assessment.id()))) {
      return;
    }
    throw invalidTransition();
  }

  private void requireAdministrativeDecisionWindow(LockedAssessment assessment) {
    if (!cycleAccessPolicy.permitsAdministrativeDecision(assessment.cycleState())) {
      throw invalidTransition();
    }
  }

  private boolean hasAdministrativeReopen(UUID assessmentId) {
    return Boolean.TRUE.equals(
        jdbcTemplate.query(
            """
            SELECT CAST(CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.transicao_avaliacao
                WHERE avaliacao_id = ? AND acao = 'REABERTURA'
            ) THEN 1 ELSE 0 END AS bit)
            """,
            resultSet -> resultSet.next() && resultSet.getBoolean(1),
            assessmentId));
  }

  private AssessmentConflictException invalidTransition() {
    return new AssessmentConflictException(
        Reason.INVALID_STATE_TRANSITION, "A operação não é permitida no estado atual.");
  }

  private void requireRevision(String expectedRevision, byte[] actualRowVersion) {
    if (!AssessmentRevision.matches(expectedRevision, actualRowVersion)) {
      throw new AssessmentConflictException(
          Reason.REVISION_MISMATCH, "A revisão informada não é a revisão atual.");
    }
  }

  private DraftContent normalizeDraft(DraftContent draft) {
    if (draft == null || draft.answers() == null) {
      throw new AssessmentValidationException("O rascunho exige a coleção de respostas.");
    }
    if (draft.answers().size() > DRAFT_MAXIMUM_ANSWERS) {
      throw new AssessmentValidationException("O rascunho excede o limite de respostas.");
    }
    List<AnswerView> answers = List.copyOf(draft.answers());
    try {
      AssessmentResponseSet.from(
          answers.stream()
              .map(answer -> new AssessmentResponse(answer.questionId(), answer.optionId()))
              .toList());
    } catch (AssessmentRuleViolation | NullPointerException exception) {
      throw new AssessmentValidationException("As respostas do rascunho são inválidas.");
    }
    return new DraftContent(
        answers, normalizeOptionalText(draft.comment()), normalizeOptionalText(draft.actionPlan()));
  }

  private String normalizeOptionalText(String text) {
    if (text == null) {
      return null;
    }
    String normalized = text.strip();
    if (normalized.isEmpty()) {
      return null;
    }
    if (normalized.length() > TEXT_MAXIMUM_LENGTH) {
      throw new AssessmentValidationException("O texto do rascunho excede o limite permitido.");
    }
    return normalized;
  }

  private String normalizeReason(String reason) {
    if (reason == null || reason.isBlank()) {
      throw new AssessmentValidationException("A reabertura exige motivo.");
    }
    String normalized = reason.strip();
    if (normalized.length() > REOPEN_REASON_MAXIMUM_LENGTH) {
      throw new AssessmentValidationException("O motivo da reabertura excede o limite permitido.");
    }
    return normalized;
  }

  private void validateDraftAnswers(Collection<AnswerView> answers, QuestionnaireCatalog catalog) {
    for (AnswerView answer : answers) {
      if (answer == null
          || answer.questionId() == null
          || answer.optionId() == null
          || !catalog.questionIds().contains(answer.questionId())
          || !catalog.optionPoints().containsKey(answer.optionId())) {
        throw new AssessmentValidationException(
            "Uma resposta não pertence ao questionário atribuído.");
      }
    }
  }

  private void validatePersistedAnswers(
      List<PersistedAnswer> answers, QuestionnaireCatalog catalog) {
    if (answers.size() != catalog.questionIds().size()) {
      throw new AssessmentConflictException(
          Reason.INVALID_STATE_TRANSITION, "A avaliação não possui todas as respostas exigidas.");
    }
    Set<UUID> questions = new LinkedHashSet<>();
    for (PersistedAnswer answer : answers) {
      if (!catalog.questionIds().contains(answer.questionId())
          || !catalog.optionPoints().containsKey(answer.optionId())
          || !questions.add(answer.questionId())) {
        throw new AssessmentConflictException(
            Reason.INVALID_STATE_TRANSITION, "A avaliação possui respostas inconsistentes.");
      }
    }
    if (!questions.equals(catalog.questionIds())) {
      throw new AssessmentConflictException(
          Reason.INVALID_STATE_TRANSITION, "A avaliação não possui todas as respostas exigidas.");
    }
  }

  private QuestionnaireCatalog loadQuestionnaireCatalog(UUID cycleQuestionnaireId) {
    List<QuestionDefinition> questions =
        jdbcTemplate.query(
            """
            SELECT question.pergunta_questionario_id, question.obrigatoria
            FROM dbo.ciclo_questionario AS cycle_questionnaire
            INNER JOIN dbo.questionario_competencia AS questionnaire_competency
                ON questionnaire_competency.versao_questionario_id
                    = cycle_questionnaire.versao_questionario_id
            INNER JOIN dbo.pergunta_questionario AS question
                ON question.questionario_competencia_id
                    = questionnaire_competency.questionario_competencia_id
            WHERE cycle_questionnaire.ciclo_questionario_id = ?
            ORDER BY questionnaire_competency.ordem, question.ordem
            """,
            (resultSet, rowNumber) ->
                new QuestionDefinition(
                    resultSet.getObject("pergunta_questionario_id", UUID.class),
                    resultSet.getBoolean("obrigatoria")),
            cycleQuestionnaireId);
    Map<UUID, Integer> options =
        jdbcTemplate.query(
            """
            SELECT option_answer.opcao_resposta_id, option_answer.pontos
            FROM dbo.ciclo_questionario AS cycle_questionnaire
            INNER JOIN dbo.opcao_resposta AS option_answer
                ON option_answer.versao_questionario_id
                    = cycle_questionnaire.versao_questionario_id
            WHERE cycle_questionnaire.ciclo_questionario_id = ?
            ORDER BY option_answer.ordem
            """,
            resultSet -> {
              Map<UUID, Integer> values = new LinkedHashMap<>();
              while (resultSet.next()) {
                values.put(
                    resultSet.getObject("opcao_resposta_id", UUID.class),
                    resultSet.getInt("pontos"));
              }
              return values;
            },
            cycleQuestionnaireId);
    Set<UUID> questionIds = new LinkedHashSet<>();
    for (QuestionDefinition question : questions) {
      if (!question.required() || !questionIds.add(question.id())) {
        throw new AssessmentValidationException(
            "O questionário atribuído não atende à regra 2024.1.");
      }
    }
    if (questionIds.isEmpty() || options.size() != AssessmentScaleOption.values().length) {
      throw new AssessmentValidationException(
          "O questionário atribuído não atende à regra 2024.1.");
    }
    for (int points : options.values()) {
      optionForPoints(points);
    }
    return new QuestionnaireCatalog(Set.copyOf(questionIds), Map.copyOf(options));
  }

  private List<PersistedAnswer> loadPersistedAnswers(UUID versionId) {
    return jdbcTemplate.query(
        """
        SELECT answer.pergunta_questionario_id, answer.opcao_resposta_id, option_answer.pontos
        FROM dbo.resposta_avaliacao AS answer
        INNER JOIN dbo.opcao_resposta AS option_answer
            ON option_answer.opcao_resposta_id = answer.opcao_resposta_id
        WHERE answer.versao_avaliacao_id = ?
        ORDER BY answer.pergunta_questionario_id
        """,
        (resultSet, rowNumber) ->
            new PersistedAnswer(
                resultSet.getObject("pergunta_questionario_id", UUID.class),
                resultSet.getObject("opcao_resposta_id", UUID.class),
                resultSet.getInt("pontos")),
        versionId);
  }

  private void insertAssessment(
      UUID assessmentId,
      CreationScope scope,
      UUID actorId,
      AssessmentType type,
      UUID managerLinkId,
      UUID userCollaboratorLinkId) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.avaliacao (
            avaliacao_id,
            ciclo_questionario_id,
            colaborador_id,
            avaliador_usuario_id,
            vinculo_gestor_colaborador_id,
            tipo_avaliacao,
            situacao,
            versao_atual_numero,
            criada_por_usuario_id,
            ciclo_avaliacao_id,
            vinculo_usuario_colaborador_id,
            atribuicao_questionario_colaborador_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'RASCUNHO', 1, ?, ?, ?, ?)
        """,
        assessmentId,
        scope.cycleQuestionnaireId(),
        scope.collaboratorId(),
        actorId,
        managerLinkId,
        type.name(),
        actorId,
        scope.cycleId(),
        userCollaboratorLinkId,
        scope.assignmentId());
  }

  private void insertVersion(
      UUID versionId,
      UUID assessmentId,
      UUID cycleQuestionnaireId,
      int number,
      AssessmentStatus status,
      String origin,
      UUID actorId,
      String comment,
      String actionPlan) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.versao_avaliacao (
            versao_avaliacao_id,
            avaliacao_id,
            ciclo_questionario_id,
            numero,
            situacao,
            origem,
            criada_por_usuario_id,
            comentario,
            plano_acao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        versionId,
        assessmentId,
        cycleQuestionnaireId,
        number,
        status.name(),
        origin,
        actorId,
        comment,
        actionPlan);
  }

  private void insertAnswers(UUID versionId, Collection<AnswerView> answers) {
    for (AnswerView answer : answers) {
      jdbcTemplate.update(
          """
          INSERT INTO dbo.resposta_avaliacao (
              versao_avaliacao_id, pergunta_questionario_id, opcao_resposta_id
          ) VALUES (?, ?, ?)
          """,
          versionId,
          answer.questionId(),
          answer.optionId());
    }
  }

  private void copyAnswers(UUID sourceVersionId, UUID destinationVersionId) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.resposta_avaliacao (
            versao_avaliacao_id, pergunta_questionario_id, opcao_resposta_id
        )
        SELECT ?, pergunta_questionario_id, opcao_resposta_id
        FROM dbo.resposta_avaliacao
        WHERE versao_avaliacao_id = ?
        """,
        destinationVersionId,
        sourceVersionId);
  }

  private void insertResult(
      UUID assessmentId,
      UUID versionId,
      UUID calculationConfigurationId,
      UUID classificationMatrixId,
      AssessmentResult result) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.resultado_avaliacao (
            avaliacao_id,
            versao_avaliacao_id,
            configuracao_calculo_versao_id,
            matriz_classificacao_versao_id,
            soma_pontos,
            quantidade_respostas,
            nota_final,
            classificacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        assessmentId,
        versionId,
        calculationConfigurationId,
        classificationMatrixId,
        Math.toIntExact(result.totalPoints()),
        result.responseCount(),
        result.finalScore(),
        databaseClassification(result.classification()));
  }

  private void copyResult(UUID assessmentId, UUID destinationVersionId, StoredResult result) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.resultado_avaliacao (
            avaliacao_id,
            versao_avaliacao_id,
            configuracao_calculo_versao_id,
            matriz_classificacao_versao_id,
            soma_pontos,
            quantidade_respostas,
            nota_final,
            classificacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        assessmentId,
        destinationVersionId,
        result.calculationConfigurationId(),
        result.classificationMatrixId(),
        result.totalPoints(),
        result.responseCount(),
        result.finalScore(),
        result.classification());
  }

  private StoredResult requireStoredResult(UUID versionId) {
    Optional<StoredResult> result =
        jdbcTemplate.query(
            """
            SELECT configuracao_calculo_versao_id,
                   matriz_classificacao_versao_id,
                   soma_pontos,
                   quantidade_respostas,
                   nota_final,
                   classificacao
            FROM dbo.resultado_avaliacao WITH (UPDLOCK, HOLDLOCK)
            WHERE versao_avaliacao_id = ?
            """,
            resultSet ->
                resultSet.next() ? Optional.of(mapStoredResult(resultSet)) : Optional.empty(),
            versionId);
    return result.orElseThrow(
        () ->
            new AssessmentConflictException(
                Reason.INVALID_STATE_TRANSITION,
                "A avaliação enviada não possui resultado calculado."));
  }

  private void updateCurrentVersion(
      LockedAssessment current, int nextVersionNumber, AssessmentStatus nextStatus) {
    int updated =
        jdbcTemplate.update(
            """
            UPDATE dbo.avaliacao
            SET versao_atual_numero = ?, situacao = ?, atualizada_em_utc = SYSUTCDATETIME()
            WHERE avaliacao_id = ? AND versao_atual_numero = ? AND situacao = ?
            """,
            nextVersionNumber,
            nextStatus.name(),
            current.id(),
            current.versionNumber(),
            current.status().name());
    if (updated != 1) {
      throw new AssessmentConflictException(
          Reason.REVISION_MISMATCH, "A avaliação foi alterada por outra solicitação.");
    }
  }

  private void insertTransition(
      UUID assessmentId,
      UUID versionId,
      AssessmentStatus source,
      AssessmentStatus destination,
      String action,
      UUID actorId,
      String requestId,
      String reopenReason) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.transicao_avaliacao (
            avaliacao_id,
            versao_avaliacao_id,
            situacao_origem,
            situacao_destino,
            acao,
            ator_usuario_id,
            request_id,
            motivo_codigo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        assessmentId,
        versionId,
        source == null ? null : source.name(),
        destination.name(),
        action,
        actorId,
        normalizedRequestId(requestId),
        reopenReason);
  }

  private IdempotencyDecision beginIdempotent(
      AssessmentAccessContext actor, String operation, String key, String requestFingerprint) {
    String normalizedKey = normalizeIdempotencyKey(key);
    String keyHash = sha256(normalizedKey);
    String requestHash = sha256(requestFingerprint);
    Optional<IdempotencyRecord> existing =
        jdbcTemplate.query(
            """
            SELECT chave_idempotencia_id,
                   requisicao_hash,
                   status_resposta,
                   recurso_resposta_id,
                   expira_em_utc
            FROM dbo.chave_idempotencia WITH (UPDLOCK, HOLDLOCK)
            WHERE ator_usuario_id = ? AND operacao = ? AND chave_hash = ?
            """,
            resultSet ->
                resultSet.next() ? Optional.of(mapIdempotencyRecord(resultSet)) : Optional.empty(),
            actor.userId(),
            operation,
            keyHash);
    if (existing.isPresent()) {
      IdempotencyRecord record = existing.get();
      if (record.expiresAt().isAfter(Instant.now())) {
        if (!record.requestHash().equals(requestHash)) {
          throw new AssessmentConflictException(
              Reason.IDEMPOTENCY_KEY_REUSED,
              "A chave de idempotência já foi usada com outra solicitação.");
        }
        if (record.responseAssessmentId() == null) {
          throw new AssessmentConflictException(
              Reason.CONFLICT, "A solicitação idempotente ainda não foi concluída.");
        }
        return IdempotencyDecision.replay(record.responseAssessmentId());
      }
      int renewed =
          jdbcTemplate.update(
              """
              UPDATE dbo.chave_idempotencia
              SET requisicao_hash = ?,
                  status_resposta = NULL,
                  recurso_resposta_id = NULL,
                  criada_em_utc = SYSUTCDATETIME(),
                  expira_em_utc = DATEADD(hour, 24, SYSUTCDATETIME())
              WHERE chave_idempotencia_id = ? AND expira_em_utc <= SYSUTCDATETIME()
              """,
              requestHash,
              record.id());
      if (renewed != 1) {
        throw new AssessmentConflictException(
            Reason.CONFLICT, "A solicitação idempotente não pôde ser reservada.");
      }
      return IdempotencyDecision.execute(record.id());
    }

    UUID idempotencyId = UUID.randomUUID();
    jdbcTemplate.update(
        """
        INSERT INTO dbo.chave_idempotencia (
            chave_idempotencia_id,
            ator_usuario_id,
            operacao,
            chave_hash,
            requisicao_hash,
            expira_em_utc
        ) VALUES (?, ?, ?, ?, ?, DATEADD(hour, 24, SYSUTCDATETIME()))
        """,
        idempotencyId,
        actor.userId(),
        operation,
        keyHash,
        requestHash);
    return IdempotencyDecision.execute(idempotencyId);
  }

  private void completeIdempotent(IdempotencyDecision decision, int status, UUID assessmentId) {
    if (decision.idempotencyId() == null) {
      return;
    }
    int updated =
        jdbcTemplate.update(
            """
            UPDATE dbo.chave_idempotencia
            SET status_resposta = ?, recurso_resposta_id = ?
            WHERE chave_idempotencia_id = ? AND status_resposta IS NULL
            """,
            status,
            assessmentId,
            decision.idempotencyId());
    if (updated != 1) {
      throw new AssessmentConflictException(
          Reason.CONFLICT, "A solicitação idempotente não pôde ser concluída.");
    }
  }

  private void writeAudit(
      UUID actorId,
      String action,
      UUID assessmentId,
      String result,
      String requestId,
      String detail) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.evento_auditoria (
            ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
        ) VALUES (?, ?, 'AVALIACAO', ?, ?, ?, ?)
        """,
        actorId,
        action,
        assessmentId,
        result,
        normalizedRequestId(requestId),
        detail);
  }

  private void safeDeniedAudit(UUID actorId, String action, UUID assessmentId, String requestId) {
    try {
      writeAudit(actorId, action, assessmentId, "NEGADO", requestId, POLICY_VERSION);
    } catch (RuntimeException ignored) {
      // Uma auditoria negada não pode revelar disponibilidade de infraestrutura nem trocar o erro.
    }
  }

  private AssessmentDetailView toDetail(LockedAssessment assessment) {
    AssessmentSummaryView summary =
        new AssessmentSummaryView(
            assessment.id(),
            assessment.cycleId(),
            assessment.cycleName(),
            collaboratorDisplayName(assessment.collaboratorId()),
            assessment.type(),
            assessment.status().name(),
            AssessmentRevision.encode(assessment.versionRowVersion()),
            assessment.updatedAt());
    List<OptionView> options = loadOptions(assessment.cycleQuestionnaireId());
    List<CompetencyView> competencies =
        loadCompetencies(assessment.cycleQuestionnaireId(), options);
    List<AnswerView> answers =
        jdbcTemplate.query(
            """
            SELECT pergunta_questionario_id, opcao_resposta_id
            FROM dbo.resposta_avaliacao
            WHERE versao_avaliacao_id = ?
            ORDER BY pergunta_questionario_id
            """,
            (resultSet, rowNumber) ->
                new AnswerView(
                    resultSet.getObject("pergunta_questionario_id", UUID.class),
                    resultSet.getObject("opcao_resposta_id", UUID.class)),
            assessment.versionId());
    ResultView result = loadVisibleResult(assessment.versionId());
    return new AssessmentDetailView(
        summary,
        questionnaireVersion(assessment.cycleQuestionnaireId()),
        competencies,
        answers,
        assessment.comment(),
        assessment.actionPlan(),
        result,
        result == null ? List.of() : loadCompetencyScores(assessment.versionId()));
  }

  private String collaboratorDisplayName(UUID collaboratorId) {
    return jdbcTemplate.query(
        "SELECT nome_exibicao FROM dbo.colaborador WHERE colaborador_id = ?",
        resultSet -> resultSet.next() ? resultSet.getString(1) : "",
        collaboratorId);
  }

  private String questionnaireVersion(UUID cycleQuestionnaireId) {
    return jdbcTemplate.query(
        """
        SELECT questionnaire.codigo, questionnaire_version.numero_versao
        FROM dbo.ciclo_questionario AS cycle_questionnaire
        INNER JOIN dbo.versao_questionario AS questionnaire_version
            ON questionnaire_version.versao_questionario_id
                = cycle_questionnaire.versao_questionario_id
        INNER JOIN dbo.questionario AS questionnaire
            ON questionnaire.questionario_id = questionnaire_version.questionario_id
        WHERE cycle_questionnaire.ciclo_questionario_id = ?
        """,
        resultSet ->
            resultSet.next()
                ? resultSet.getString("codigo") + " v" + resultSet.getInt("numero_versao")
                : "",
        cycleQuestionnaireId);
  }

  private List<OptionView> loadOptions(UUID cycleQuestionnaireId) {
    return jdbcTemplate.query(
        """
        SELECT option_answer.opcao_resposta_id, option_answer.rotulo, option_answer.pontos
        FROM dbo.ciclo_questionario AS cycle_questionnaire
        INNER JOIN dbo.opcao_resposta AS option_answer
            ON option_answer.versao_questionario_id
                = cycle_questionnaire.versao_questionario_id
        WHERE cycle_questionnaire.ciclo_questionario_id = ?
        ORDER BY option_answer.ordem
        """,
        (resultSet, rowNumber) ->
            new OptionView(
                resultSet.getObject("opcao_resposta_id", UUID.class),
                resultSet.getString("rotulo"),
                resultSet.getInt("pontos")),
        cycleQuestionnaireId);
  }

  private List<CompetencyView> loadCompetencies(
      UUID cycleQuestionnaireId, List<OptionView> options) {
    Map<UUID, MutableCompetency> competencies = new LinkedHashMap<>();
    jdbcTemplate.query(
        """
        SELECT competency_version.competencia_id,
               competency_version.nome AS competency_name,
               question.pergunta_questionario_id,
               question.texto,
               question.descricao,
               question.obrigatoria
        FROM dbo.ciclo_questionario AS cycle_questionnaire
        INNER JOIN dbo.questionario_competencia AS questionnaire_competency
            ON questionnaire_competency.versao_questionario_id
                = cycle_questionnaire.versao_questionario_id
        INNER JOIN dbo.versao_competencia AS competency_version
            ON competency_version.versao_competencia_id
                = questionnaire_competency.versao_competencia_id
        INNER JOIN dbo.pergunta_questionario AS question
            ON question.questionario_competencia_id
                = questionnaire_competency.questionario_competencia_id
        WHERE cycle_questionnaire.ciclo_questionario_id = ?
        ORDER BY questionnaire_competency.ordem, question.ordem
        """,
        (RowCallbackHandler)
            resultSet -> {
              while (resultSet.next()) {
                UUID competencyId = resultSet.getObject("competencia_id", UUID.class);
                MutableCompetency competency =
                    competencies.computeIfAbsent(
                        competencyId,
                        id ->
                            new MutableCompetency(
                                id, resultSetString(resultSet, "competency_name")));
                competency.questions.add(
                    new QuestionView(
                        resultSet.getObject("pergunta_questionario_id", UUID.class),
                        resultSet.getString("texto"),
                        resultSet.getString("descricao"),
                        resultSet.getBoolean("obrigatoria"),
                        options));
              }
            },
        cycleQuestionnaireId);
    return competencies.values().stream().map(MutableCompetency::toView).toList();
  }

  private ResultView loadVisibleResult(UUID versionId) {
    return jdbcTemplate.query(
        """
        SELECT nota_final, classificacao
        FROM dbo.resultado_avaliacao
        WHERE versao_avaliacao_id = ?
        """,
        resultSet -> {
          if (!resultSet.next()) {
            return null;
          }
          PerformanceClassification classification =
              performanceClassification(resultSet.getString("classificacao"));
          BigDecimal finalScore = resultSet.getBigDecimal("nota_final");
          return new ResultView(
              finalScore.toPlainString(), classification.name(), classification.guidance());
        },
        versionId);
  }

  private List<CompetencyScoreView> loadCompetencyScores(UUID versionId) {
    return jdbcTemplate.query(
        """
        SELECT competency_version.competencia_id,
               competency_version.nome AS competency_name,
               AVG(CAST(option_answer.pontos AS decimal(19, 4))) AS competency_score
        FROM dbo.resposta_avaliacao AS answer
        INNER JOIN dbo.pergunta_questionario AS question
            ON question.pergunta_questionario_id = answer.pergunta_questionario_id
        INNER JOIN dbo.questionario_competencia AS questionnaire_competency
            ON questionnaire_competency.questionario_competencia_id
                = question.questionario_competencia_id
        INNER JOIN dbo.versao_competencia AS competency_version
            ON competency_version.versao_competencia_id
                = questionnaire_competency.versao_competencia_id
        INNER JOIN dbo.opcao_resposta AS option_answer
            ON option_answer.opcao_resposta_id = answer.opcao_resposta_id
        WHERE answer.versao_avaliacao_id = ?
        GROUP BY competency_version.competencia_id, competency_version.nome,
                 questionnaire_competency.ordem
        ORDER BY questionnaire_competency.ordem, competency_version.competencia_id
        """,
        (resultSet, rowNumber) ->
            new CompetencyScoreView(
                resultSet.getObject("competencia_id", UUID.class),
                resultSet.getString("competency_name"),
                resultSet.getBigDecimal("competency_score").setScale(1, RoundingMode.HALF_UP)),
        versionId);
  }

  private Optional<LockedAssessment> findAssessment(UUID assessmentId, boolean locked) {
    if (assessmentId == null) {
      return Optional.empty();
    }
    return jdbcTemplate.query(
        locked ? LOCKED_ASSESSMENT_SELECT : ASSESSMENT_SELECT,
        resultSet -> resultSet.next() ? Optional.of(mapAssessment(resultSet)) : Optional.empty(),
        assessmentId);
  }

  private LockedAssessment requireLocked(UUID assessmentId) {
    return findAssessment(assessmentId, true)
        .orElseThrow(() -> new AssessmentNotFoundException(assessmentId));
  }

  private int nextVersionNumber(LockedAssessment current) {
    try {
      return Math.addExact(current.versionNumber(), 1);
    } catch (ArithmeticException exception) {
      throw new AssessmentConflictException(
          Reason.CONFLICT, "A avaliação excedeu versões permitidas.");
    }
  }

  private <T> T inTransaction(Supplier<T> action) {
    T result = transactionTemplate.execute(status -> action.get());
    return Objects.requireNonNull(result, "a transação de avaliação não retornou resultado");
  }

  static AssessmentSummaryView mapSummary(ResultSet resultSet) throws SQLException {
    return new AssessmentSummaryView(
        resultSet.getObject("avaliacao_id", UUID.class),
        resultSet.getObject("ciclo_avaliacao_id", UUID.class),
        resultSet.getString("cycle_name"),
        resultSet.getString("collaborator_display_name"),
        assessmentType(resultSet.getString("tipo_avaliacao")),
        resultSet.getString("assessment_situation"),
        AssessmentRevision.encode(resultSet.getBytes("version_row_version")),
        instant(resultSet, "atualizada_em_utc"));
  }

  private static LockedAssessment mapAssessment(ResultSet resultSet) throws SQLException {
    return new LockedAssessment(
        resultSet.getObject("avaliacao_id", UUID.class),
        resultSet.getObject("ciclo_avaliacao_id", UUID.class),
        resultSet.getObject("ciclo_questionario_id", UUID.class),
        resultSet.getObject("atribuicao_questionario_colaborador_id", UUID.class),
        resultSet.getObject("colaborador_id", UUID.class),
        resultSet.getObject("avaliador_usuario_id", UUID.class),
        resultSet.getObject("vinculo_gestor_colaborador_id", UUID.class),
        resultSet.getObject("vinculo_usuario_colaborador_id", UUID.class),
        assessmentType(resultSet.getString("tipo_avaliacao")),
        assessmentStatus(resultSet.getString("assessment_situacao")),
        resultSet.getInt("versao_atual_numero"),
        resultSet.getObject("versao_avaliacao_id", UUID.class),
        resultSet.getBytes("version_row_version"),
        resultSet.getString("comentario"),
        resultSet.getString("plano_acao"),
        resultSet.getObject("configuracao_calculo_versao_id", UUID.class),
        resultSet.getObject("matriz_classificacao_versao_id", UUID.class),
        resultSet.getString("cycle_name"),
        cycleState(resultSet.getString("cycle_situation")),
        instant(resultSet, "janela_abertura_em_utc"),
        instant(resultSet, "janela_encerramento_em_utc"),
        instant(resultSet, "atualizada_em_utc"));
  }

  private static CreationScope mapManagerCreationScope(ResultSet resultSet) throws SQLException {
    return new CreationScope(
        resultSet.getObject("cycle_id", UUID.class),
        resultSet.getObject("ciclo_questionario_id", UUID.class),
        resultSet.getObject("atribuicao_questionario_colaborador_id", UUID.class),
        resultSet.getObject("colaborador_id", UUID.class),
        resultSet.getObject("vinculo_gestor_colaborador_id", UUID.class),
        null);
  }

  private static CreationScope mapSelfCreationScope(ResultSet resultSet) throws SQLException {
    return new CreationScope(
        resultSet.getObject("cycle_id", UUID.class),
        resultSet.getObject("ciclo_questionario_id", UUID.class),
        resultSet.getObject("atribuicao_questionario_colaborador_id", UUID.class),
        resultSet.getObject("colaborador_id", UUID.class),
        null,
        resultSet.getObject("vinculo_usuario_colaborador_id", UUID.class));
  }

  private static StoredResult mapStoredResult(ResultSet resultSet) throws SQLException {
    return new StoredResult(
        resultSet.getObject("configuracao_calculo_versao_id", UUID.class),
        resultSet.getObject("matriz_classificacao_versao_id", UUID.class),
        resultSet.getInt("soma_pontos"),
        resultSet.getInt("quantidade_respostas"),
        resultSet.getBigDecimal("nota_final"),
        resultSet.getString("classificacao"));
  }

  private static IdempotencyRecord mapIdempotencyRecord(ResultSet resultSet) throws SQLException {
    return new IdempotencyRecord(
        resultSet.getObject("chave_idempotencia_id", UUID.class),
        resultSet.getString("requisicao_hash"),
        (Integer) resultSet.getObject("status_resposta"),
        resultSet.getObject("recurso_resposta_id", UUID.class),
        instant(resultSet, "expira_em_utc"));
  }

  private static AssessmentType assessmentType(String value) {
    try {
      return AssessmentType.valueOf(value);
    } catch (IllegalArgumentException exception) {
      throw new IllegalStateException("Tipo de avaliação persistido desconhecido.");
    }
  }

  private static AssessmentStatus assessmentStatus(String value) {
    try {
      return AssessmentStatus.valueOf(value);
    } catch (IllegalArgumentException exception) {
      throw new IllegalStateException("Situação de avaliação persistida desconhecida.");
    }
  }

  private static CycleState cycleState(String value) {
    return switch (value) {
      case "RASCUNHO" -> CycleState.DRAFT;
      case "ABERTO" -> CycleState.OPEN;
      case "ENCERRADO" -> CycleState.CLOSED;
      default -> CycleState.OTHER;
    };
  }

  private static AssessmentScaleOption optionForPoints(int points) {
    for (AssessmentScaleOption option : AssessmentScaleOption.values()) {
      if (option.points() == points) {
        return option;
      }
    }
    throw new AssessmentValidationException("A opção persistida não pertence à escala 2024.1.");
  }

  private static String databaseClassification(PerformanceClassification classification) {
    return switch (classification) {
      case REFERENCE -> "REFERENCIA";
      case EXCEEDS_EXPECTATIONS -> "SUPERA_EXPECTATIVAS";
      case WITHIN_EXPECTATIONS -> "DENTRO_EXPECTATIVAS";
      case IN_DEVELOPMENT -> "EM_DESENVOLVIMENTO";
      case BELOW_EXPECTATIONS -> "ABAIXO_ESPERADO";
    };
  }

  private static PerformanceClassification performanceClassification(String classification) {
    return switch (classification) {
      case "REFERENCIA" -> PerformanceClassification.REFERENCE;
      case "SUPERA_EXPECTATIVAS" -> PerformanceClassification.EXCEEDS_EXPECTATIONS;
      case "DENTRO_EXPECTATIVAS" -> PerformanceClassification.WITHIN_EXPECTATIONS;
      case "EM_DESENVOLVIMENTO" -> PerformanceClassification.IN_DEVELOPMENT;
      case "ABAIXO_ESPERADO" -> PerformanceClassification.BELOW_EXPECTATIONS;
      default -> throw new IllegalStateException("Classificação persistida desconhecida.");
    };
  }

  private static String actionFor(AssessmentType type, String action) {
    return type == AssessmentType.AUTOAVALIACAO
        ? "AUTOAVALIACOES." + action
        : "AVALIACOES." + action;
  }

  private static String normalizeIdempotencyKey(String key) {
    if (key == null || key.isBlank()) {
      throw new AssessmentValidationException("Idempotency-Key é obrigatório.");
    }
    String normalized = key.strip();
    if (normalized.length() > IDEMPOTENCY_KEY_MAXIMUM_LENGTH) {
      throw new AssessmentValidationException("Idempotency-Key excede o limite permitido.");
    }
    return normalized;
  }

  private static String normalizedRequestId(String requestId) {
    if (requestId == null || requestId.isBlank() || requestId.length() > 64) {
      return null;
    }
    return requestId;
  }

  private static String canonical(Object... values) {
    StringBuilder canonical = new StringBuilder();
    for (Object value : values) {
      String part = String.valueOf(value);
      canonical.append(part.length()).append(':').append(part).append('|');
    }
    return canonical.toString();
  }

  private static String sha256(String value) {
    try {
      byte[] hash =
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder(hash.length * 2);
      for (byte item : hash) {
        hex.append(String.format("%02x", item));
      }
      return hex.toString();
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 não está disponível no runtime.", exception);
    }
  }

  private static Instant instant(ResultSet resultSet, String column) throws SQLException {
    return SqlServerUtcDateTime.read(resultSet, column);
  }

  private static String resultSetString(ResultSet resultSet, String column) {
    try {
      return resultSet.getString(column);
    } catch (SQLException exception) {
      throw new IllegalStateException("Não foi possível ler resultado SQL.", exception);
    }
  }

  private record LockedAssessment(
      UUID id,
      UUID cycleId,
      UUID cycleQuestionnaireId,
      UUID assignmentId,
      UUID collaboratorId,
      UUID authorUserId,
      UUID managerLinkId,
      UUID userCollaboratorLinkId,
      AssessmentType type,
      AssessmentStatus status,
      int versionNumber,
      UUID versionId,
      byte[] versionRowVersion,
      String comment,
      String actionPlan,
      UUID calculationConfigurationId,
      UUID classificationMatrixId,
      String cycleName,
      CycleState cycleState,
      Instant opensAt,
      Instant closesAt,
      Instant updatedAt) {}

  private record CreationScope(
      UUID cycleId,
      UUID cycleQuestionnaireId,
      UUID assignmentId,
      UUID collaboratorId,
      UUID managerLinkId,
      UUID userCollaboratorLinkId) {}

  private record QuestionDefinition(UUID id, boolean required) {}

  private record QuestionnaireCatalog(Set<UUID> questionIds, Map<UUID, Integer> optionPoints) {}

  private record PersistedAnswer(UUID questionId, UUID optionId, int points) {}

  private record StoredResult(
      UUID calculationConfigurationId,
      UUID classificationMatrixId,
      int totalPoints,
      int responseCount,
      BigDecimal finalScore,
      String classification) {}

  private record IdempotencyRecord(
      UUID id,
      String requestHash,
      Integer responseStatus,
      UUID responseAssessmentId,
      Instant expiresAt) {}

  private record IdempotencyDecision(UUID idempotencyId, UUID replayedAssessmentId) {
    static IdempotencyDecision execute(UUID idempotencyId) {
      return new IdempotencyDecision(idempotencyId, null);
    }

    static IdempotencyDecision replay(UUID assessmentId) {
      return new IdempotencyDecision(null, assessmentId);
    }
  }

  private static final class MutableCompetency {

    private final UUID id;
    private final String name;
    private final List<QuestionView> questions = new ArrayList<>();

    private MutableCompetency(UUID id, String name) {
      this.id = id;
      this.name = name;
    }

    private CompetencyView toView() {
      return new CompetencyView(id, name, List.copyOf(questions));
    }
  }
}

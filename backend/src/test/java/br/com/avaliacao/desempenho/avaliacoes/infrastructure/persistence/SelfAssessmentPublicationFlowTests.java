package br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentConflictException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentForbiddenException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository.AnswerView;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository.CompetencyScoreView;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository.ResultView;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentCycleAccessPolicy.CycleState;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.mockito.invocation.InvocationOnMock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

/** Exercises the public repository operation with synthetic JDBC responses, without a database. */
class SelfAssessmentPublicationFlowTests {

  @Test
  void publishesTheSubmittedSelfAssessmentAndReplaysWithoutCreatingAnotherVersion()
      throws Exception {
    var fixture = new Fixture();
    var published =
        fixture.repository.publish(
            fixture.assessmentId, fixture.actor, "self-publish", "request-1");

    assertThat(published.summary().status()).isEqualTo("PUBLICADA");
    assertThat(published.summary().feedbackStatus()).isEqualTo(FeedbackStatus.NAO_APLICAVEL);
    assertThat(published.result()).isEqualTo(fixture.visibleResult);
    assertThat(published.answers()).isEqualTo(fixture.answers);
    assertThat(published.allowedActions().publish()).isFalse();
    assertThat(fixture.versionsInserted).isEqualTo(1);
    assertThat(fixture.transitionsInserted).isEqualTo(1);
    assertThat(fixture.answersCopied).isEqualTo(1);
    assertThat(fixture.resultsCopied).isEqualTo(1);
    assertThat(fixture.feedbackInserted).containsExactly("NAO_APLICAVEL");
    assertThat(fixture.auditDetails).containsExactly("SUCESSO:2024.1");

    var replay =
        fixture.repository.publish(
            fixture.assessmentId, fixture.actor, "self-publish", "request-2");

    assertThat(replay).isEqualTo(published);
    assertThat(fixture.versionsInserted).isEqualTo(1);
    assertThat(fixture.transitionsInserted).isEqualTo(1);
    assertThat(fixture.answersCopied).isEqualTo(1);
    assertThat(fixture.resultsCopied).isEqualTo(1);
    assertThat(fixture.feedbackInserted).containsExactly("NAO_APLICAVEL");
    assertThat(fixture.auditDetails)
        .containsExactly("SUCESSO:2024.1", "SUCESSO:REPETICAO_IDEMPOTENTE");
    verify(fixture.transactionTemplate, org.mockito.Mockito.times(2)).execute(any());
  }

  @Test
  void refusesTheFirstPublicationAndItsReplayWhenTheOwnLinkIsRevoked() throws Exception {
    var denied = new Fixture();
    denied.linked = false;
    assertThatThrownBy(
            () ->
                denied.repository.publish(
                    denied.assessmentId, denied.actor, "self-denied", "request-denied"))
        .isInstanceOf(AssessmentForbiddenException.class);
    assertThat(denied.versionsInserted).isZero();
    assertThat(denied.transitionsInserted).isZero();
    assertThat(denied.auditDetails).containsExactly("NEGADO:2024.1");

    var fixture = new Fixture();
    fixture.repository.publish(fixture.assessmentId, fixture.actor, "self-publish", "request-1");
    fixture.linked = false;
    assertThatThrownBy(
            () ->
                fixture.repository.publish(
                    fixture.assessmentId, fixture.actor, "self-publish", "request-2"))
        .isInstanceOf(AssessmentForbiddenException.class);
    assertThat(fixture.versionsInserted).isEqualTo(1);
    assertThat(fixture.transitionsInserted).isEqualTo(1);
    assertThat(fixture.auditDetails).containsExactly("SUCESSO:2024.1", "NEGADO:2024.1");
  }

  @Test
  void neverPublishesADraftAndKeepsTheOptimisticConcurrencyGuard() throws Exception {
    var draft = new Fixture();
    draft.status = AssessmentStatus.RASCUNHO;
    assertThatThrownBy(
            () ->
                draft.repository.publish(
                    draft.assessmentId, draft.actor, "self-draft", "request-draft"))
        .isInstanceOfSatisfying(
            AssessmentConflictException.class,
            exception ->
                assertThat(exception.reason())
                    .isEqualTo(AssessmentConflictException.Reason.INVALID_STATE_TRANSITION));
    assertThat(draft.versionsInserted).isZero();
    assertThat(draft.transitionsInserted).isZero();

    var concurrent = new Fixture();
    concurrent.optimisticUpdateSucceeds = false;
    assertThatThrownBy(
            () ->
                concurrent.repository.publish(
                    concurrent.assessmentId, concurrent.actor, "self-race", "request-race"))
        .isInstanceOfSatisfying(
            AssessmentConflictException.class,
            exception ->
                assertThat(exception.reason())
                    .isEqualTo(AssessmentConflictException.Reason.REVISION_MISMATCH));
    assertThat(concurrent.transitionsInserted).isZero();
    assertThat(concurrent.auditDetails).isEmpty();
    verify(concurrent.transactionTemplate).execute(any());
  }

  private static final class Fixture {
    private final UUID actorId = UUID.randomUUID();
    private final UUID assessmentId = UUID.randomUUID();
    private final UUID collaboratorId = UUID.randomUUID();
    private final UUID cycleId = UUID.randomUUID();
    private final UUID cycleQuestionnaireId = UUID.randomUUID();
    private final UUID ownLinkId = UUID.randomUUID();
    private final UUID calculationId = UUID.randomUUID();
    private final UUID classificationId = UUID.randomUUID();
    private final UUID competencyId = UUID.randomUUID();
    private final Instant updatedAt = Instant.parse("2026-10-21T12:00:00Z");
    private final List<AnswerView> answers =
        List.of(new AnswerView(UUID.randomUUID(), UUID.randomUUID()));
    private final ResultView visibleResult =
        new ResultView("100.0", "WITHIN_EXPECTATIONS", "Acelerar e desenvolver");
    private final AssessmentAccessContext actor =
        new AssessmentAccessContext(
            actorId,
            Set.of("AUTOAVALIACOES.ENVIAR_PROPRIA", "AUTOAVALIACOES.VISUALIZAR_PROPRIA"),
            Set.of("COLABORADOR"));
    private final TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
    private final SqlServerAssessmentRepository repository;
    private final List<String> feedbackInserted = new ArrayList<>();
    private final List<String> auditDetails = new ArrayList<>();
    private UUID versionId = UUID.randomUUID();
    private UUID insertedVersionId;
    private AssessmentStatus status = AssessmentStatus.ENVIADA;
    private int versionNumber = 2;
    private boolean linked = true;
    private boolean optimisticUpdateSucceeds = true;
    private int versionsInserted;
    private int transitionsInserted;
    private int answersCopied;
    private int resultsCopied;
    private UUID idempotencyId;
    private String idempotencyKeyHash;
    private String requestHash;
    private UUID completedAssessmentId;

    private Fixture() {
      var jdbc = mock(JdbcTemplate.class, this::jdbcCall);
      repository = new SqlServerAssessmentRepository(jdbc, transactionTemplate);
      doAnswer(
              invocation ->
                  invocation
                      .<TransactionCallback<?>>getArgument(0)
                      .doInTransaction(mock(TransactionStatus.class)))
          .when(transactionTemplate)
          .execute(any());
    }

    private Object jdbcCall(InvocationOnMock invocation) throws Throwable {
      String method = invocation.getMethod().getName();
      if (!method.equals("query") && !method.equals("update")) {
        return Answers.RETURNS_DEFAULTS.answer(invocation);
      }
      String sql = invocation.getArgument(0);
      Object[] arguments = invocation.getArguments();
      if (method.equals("update")) {
        return update(sql, Arrays.copyOfRange(arguments, 1, arguments.length));
      }
      if (sql.contains("FROM dbo.chave_idempotencia")) {
        assertThat(sql).contains("WITH (UPDLOCK, HOLDLOCK)");
        assertThat(invocation.<UUID>getArgument(2)).isEqualTo(actorId);
        assertThat(invocation.<String>getArgument(3)).isEqualTo("AVALIACOES.PUBLICAR");
        if (idempotencyId == null) {
          return Optional.empty();
        }
        assertThat(invocation.<String>getArgument(4)).isEqualTo(idempotencyKeyHash);
        return Optional.of(
            record(
                "IdempotencyRecord",
                call ->
                    switch (call.getMethod().getName()) {
                      case "id" -> idempotencyId;
                      case "requestHash" -> requestHash;
                      case "responseAssessmentId" -> completedAssessmentId;
                      case "responseStatus" -> completedAssessmentId == null ? null : 200;
                      case "expiresAt" -> Instant.now().plusSeconds(3600);
                      default -> Answers.RETURNS_DEFAULTS.answer(call);
                    }));
      }
      if (sql.contains("FROM dbo.avaliacao AS assessment")) {
        assertThat(sql).contains("WITH (UPDLOCK, HOLDLOCK)");
        assertThat(invocation.<UUID>getArgument(2)).isEqualTo(assessmentId);
        return Optional.of(assessmentSnapshot());
      }
      if (sql.contains("FROM dbo.usuario")) {
        return true;
      }
      if (sql.contains("FROM dbo.vinculo_usuario_colaborador")) {
        assertThat(invocation.<UUID>getArgument(2)).isEqualTo(ownLinkId);
        assertThat(invocation.<UUID>getArgument(3)).isEqualTo(actorId);
        assertThat(invocation.<UUID>getArgument(4)).isEqualTo(collaboratorId);
        return linked;
      }
      if (sql.contains("FROM dbo.resultado_avaliacao WITH")) {
        return Optional.of(
            record(
                "StoredResult",
                call ->
                    switch (call.getMethod().getName()) {
                      case "calculationConfigurationId" -> calculationId;
                      case "classificationMatrixId" -> classificationId;
                      case "totalPoints" -> 100;
                      case "responseCount" -> 1;
                      case "finalScore" -> new BigDecimal("100.0");
                      case "classification" -> "DENTRO_EXPECTATIVAS";
                      default -> Answers.RETURNS_DEFAULTS.answer(call);
                    }));
      }
      if (sql.contains("FROM dbo.colaborador")) {
        return "Pessoa fictícia";
      }
      if (sql.contains("option_answer.rotulo")) {
        return List.of();
      }
      if (sql.contains("questionnaire.codigo")) {
        return "FICTICIO v1";
      }
      if (sql.contains("question.texto")) {
        return null;
      }
      if (sql.contains("FROM dbo.resposta_avaliacao") && !sql.contains("AVG(")) {
        return answers;
      }
      if (sql.contains("FROM dbo.resultado_avaliacao")) {
        return visibleResult;
      }
      if (sql.contains("AVG(")) {
        return List.of(
            new CompetencyScoreView(competencyId, "Competência fictícia", new BigDecimal("100.0")));
      }
      throw new AssertionError("Unexpected query in synthetic publication fixture");
    }

    private int update(String sql, Object[] values) {
      if (sql.contains("INSERT INTO dbo.chave_idempotencia")) {
        idempotencyId = (UUID) values[0];
        assertThat(values[1]).isEqualTo(actorId);
        assertThat(values[2]).isEqualTo("AVALIACOES.PUBLICAR");
        idempotencyKeyHash = (String) values[3];
        requestHash = (String) values[4];
      } else if (sql.contains("INSERT INTO dbo.versao_avaliacao")) {
        insertedVersionId = (UUID) values[0];
        assertThat(values[1]).isEqualTo(assessmentId);
        assertThat(values[4]).isEqualTo("PUBLICADA");
        assertThat(values[5]).isEqualTo("PUBLICACAO");
        assertThat(values[6]).isEqualTo(actorId);
        versionsInserted++;
      } else if (sql.contains("INSERT INTO dbo.resposta_avaliacao")) {
        assertThat(sql).contains("SELECT ?, pergunta_questionario_id, opcao_resposta_id");
        assertThat(values).containsExactly(insertedVersionId, versionId);
        answersCopied++;
      } else if (sql.contains("INSERT INTO dbo.resultado_avaliacao")) {
        assertThat(values)
            .containsExactly(
                assessmentId,
                insertedVersionId,
                calculationId,
                classificationId,
                100,
                1,
                new BigDecimal("100.0"),
                "DENTRO_EXPECTATIVAS");
        resultsCopied++;
      } else if (sql.contains("INSERT INTO dbo.feedback_avaliacao")) {
        feedbackInserted.add((String) values[2]);
      } else if (sql.contains("UPDATE dbo.avaliacao")) {
        assertThat(sql).contains("AND versao_atual_numero = ? AND situacao = ?");
        assertThat(values)
            .containsExactly(
                versionNumber + 1, "PUBLICADA", assessmentId, versionNumber, "ENVIADA");
        if (!optimisticUpdateSucceeds) {
          return 0;
        }
        versionNumber++;
        versionId = insertedVersionId;
        status = AssessmentStatus.PUBLICADA;
      } else if (sql.contains("INSERT INTO dbo.transicao_avaliacao")) {
        assertThat(values[2]).isEqualTo("ENVIADA");
        assertThat(values[3]).isEqualTo("PUBLICADA");
        assertThat(values[4]).isEqualTo("PUBLICACAO");
        assertThat(values[5]).isEqualTo(actorId);
        transitionsInserted++;
      } else if (sql.contains("UPDATE dbo.chave_idempotencia")) {
        assertThat(values[0]).isEqualTo(200);
        assertThat(values[2]).isEqualTo(idempotencyId);
        completedAssessmentId = (UUID) values[1];
      } else if (sql.contains("INSERT INTO dbo.evento_auditoria")) {
        assertThat(values[0]).isEqualTo(actorId);
        assertThat(values[1]).isEqualTo("AVALIACOES.PUBLICAR");
        assertThat(values[2]).isEqualTo(assessmentId);
        auditDetails.add(values[3] + ":" + values[5]);
      } else {
        throw new AssertionError("Unexpected update in synthetic publication fixture");
      }
      return 1;
    }

    private Object assessmentSnapshot() throws ClassNotFoundException {
      UUID snapshotVersion = versionId;
      int snapshotNumber = versionNumber;
      AssessmentStatus snapshotStatus = status;
      return record(
          "LockedAssessment",
          call ->
              switch (call.getMethod().getName()) {
                case "id" -> assessmentId;
                case "cycleId" -> cycleId;
                case "cycleQuestionnaireId" -> cycleQuestionnaireId;
                case "collaboratorId" -> collaboratorId;
                case "authorUserId" -> actorId;
                case "userCollaboratorLinkId" -> ownLinkId;
                case "type" -> AssessmentType.AUTOAVALIACAO;
                case "status" -> snapshotStatus;
                case "feedbackStatus" -> FeedbackStatus.NAO_APLICAVEL;
                case "versionNumber" -> snapshotNumber;
                case "versionId" -> snapshotVersion;
                case "versionRowVersion" -> new byte[8];
                case "cycleName" -> "Ciclo fictício";
                case "cycleState" -> CycleState.CLOSED;
                case "updatedAt" -> updatedAt;
                default -> Answers.RETURNS_DEFAULTS.answer(call);
              });
    }

    private static Object record(String type, org.mockito.stubbing.Answer<Object> answer)
        throws ClassNotFoundException {
      return mock(
          Class.forName(SqlServerAssessmentRepository.class.getName() + "$" + type), answer);
    }
  }
}

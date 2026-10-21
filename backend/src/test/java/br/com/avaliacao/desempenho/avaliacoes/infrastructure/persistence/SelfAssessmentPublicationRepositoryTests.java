package br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence;

import static br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAuthorizationPolicy.SUBMIT_OWN_SELF_ASSESSMENT;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentConflictException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentForbiddenException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository.AllowedActionsView;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentCycleAccessPolicy.CycleState;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

class SelfAssessmentPublicationRepositoryTests {

  @Test
  void advertisesPublicationOnlyForTheSubmittedOwnSelfAssessment() throws Exception {
    var fixture = new Fixture();
    var actions = fixture.actions();
    assertThat(actions.publish()).isTrue();
    assertThat(actions.edit()).isFalse();
    assertThat(actions.submit()).isFalse();
    assertThat(actions.reopen()).isFalse();
    assertThat(actions.completeFeedback()).isFalse();

    fixture.status = AssessmentStatus.RASCUNHO;
    assertThat(fixture.actions().publish()).isFalse();
    fixture.status = AssessmentStatus.PUBLICADA;
    assertThat(fixture.actions().publish()).isFalse();
  }

  @Test
  void revalidatesActiveIdentityAuthorPermissionAndItsOwnCurrentCollaboratorLink()
      throws Exception {
    var fixture = new Fixture();
    fixture.authorizePublication();

    fixture.active = false;
    assertThatThrownBy(fixture::authorizePublication)
        .isInstanceOf(AssessmentForbiddenException.class);
    fixture.active = true;
    fixture.linked = false;
    assertThatThrownBy(fixture::authorizePublication)
        .isInstanceOf(AssessmentForbiddenException.class);
    assertThat(fixture.actions().publish()).isFalse();
    fixture.linked = true;
    fixture.linkId = null;
    assertThatThrownBy(fixture::authorizePublication)
        .isInstanceOf(AssessmentForbiddenException.class);
    fixture.linkId = UUID.randomUUID();
    fixture.author = UUID.randomUUID();
    assertThatThrownBy(fixture::authorizePublication)
        .isInstanceOf(AssessmentForbiddenException.class);
    fixture.author = fixture.actorId;
    fixture.actor = new AssessmentAccessContext(fixture.actorId, Set.of(), Set.of("COLABORADOR"));
    assertThatThrownBy(fixture::authorizePublication)
        .isInstanceOf(AssessmentForbiddenException.class);
    fixture.actor =
        new AssessmentAccessContext(
            fixture.actorId,
            Set.of(SUBMIT_OWN_SELF_ASSESSMENT),
            Set.of("ADMINISTRADOR_PLATAFORMA", "GESTOR"));
    assertThatThrownBy(fixture::authorizePublication)
        .isInstanceOf(AssessmentForbiddenException.class);
  }

  @Test
  void publishesPendingSubmissionsAfterTheDeadlineButKeepsTheSubmissionDeadline() throws Exception {
    var fixture = new Fixture();
    fixture.closesAt = Instant.now().minusSeconds(3600);
    fixture.authorizePublication();
    assertThat(fixture.actions().publish()).isTrue();
    assertThatThrownBy(fixture::authorizeSubmission)
        .isInstanceOf(AssessmentConflictException.class);

    fixture.cycle = CycleState.CLOSED;
    fixture.authorizePublication();
    assertThat(fixture.actions().publish()).isTrue();
    assertThatThrownBy(fixture::authorizeSubmission)
        .isInstanceOf(AssessmentConflictException.class);

    for (CycleState state : Set.of(CycleState.DRAFT, CycleState.OTHER)) {
      fixture.cycle = state;
      assertThatThrownBy(fixture::authorizePublication)
          .isInstanceOf(AssessmentConflictException.class);
      assertThat(fixture.actions().publish()).isFalse();
    }
  }

  @Test
  void keepsAdministrativePublicationWithoutRequiringTheAdministratorsOwnCollaboratorLink()
      throws Exception {
    var fixture = new Fixture();
    fixture.author = UUID.randomUUID();
    fixture.linkId = null;
    fixture.linked = false;
    fixture.cycle = CycleState.CLOSED;
    for (String role : Set.of("GERENCIA_RH", "DIRETORIA")) {
      fixture.actor =
          new AssessmentAccessContext(fixture.actorId, Set.of("AVALIACOES.PUBLICAR"), Set.of(role));
      fixture.authorizePublication();
      assertThat(fixture.actions().publish()).isTrue();
    }
  }

  private static final class Fixture {
    private final UUID actorId = UUID.randomUUID();
    private final UUID collaboratorId = UUID.randomUUID();
    private final SqlServerAssessmentRepository repository;
    private final Object assessment;
    private UUID author = actorId;
    private UUID linkId = UUID.randomUUID();
    private boolean active = true;
    private boolean linked = true;
    private CycleState cycle = CycleState.OPEN;
    private AssessmentStatus status = AssessmentStatus.ENVIADA;
    private final Instant opensAt = Instant.now().minusSeconds(7200);
    private Instant closesAt = Instant.now().plusSeconds(7200);
    private AssessmentAccessContext actor =
        new AssessmentAccessContext(
            actorId, Set.of(SUBMIT_OWN_SELF_ASSESSMENT), Set.of("COLABORADOR"));

    private Fixture() throws ClassNotFoundException {
      var jdbc = mock(JdbcTemplate.class);
      repository = new SqlServerAssessmentRepository(jdbc, mock(TransactionTemplate.class));
      var type = Class.forName(SqlServerAssessmentRepository.class.getName() + "$LockedAssessment");
      assessment =
          mock(
              type,
              invocation ->
                  switch (invocation.getMethod().getName()) {
                    case "authorUserId" -> author;
                    case "collaboratorId" -> collaboratorId;
                    case "userCollaboratorLinkId" -> linkId;
                    case "type" -> AssessmentType.AUTOAVALIACAO;
                    case "status" -> status;
                    case "feedbackStatus" -> FeedbackStatus.NAO_APLICAVEL;
                    case "cycleState" -> cycle;
                    case "opensAt" -> opensAt;
                    case "closesAt" -> closesAt;
                    default -> Answers.RETURNS_DEFAULTS.answer(invocation);
                  });
      doAnswer(
              invocation -> {
                String sql = invocation.getArgument(0);
                if (sql.contains("dbo.vinculo_usuario_colaborador")) {
                  assertThat(sql)
                      .contains(
                          "WITH (UPDLOCK, HOLDLOCK)",
                          "user_link.vinculo_usuario_colaborador_id = ?",
                          "user_link.usuario_id = ?",
                          "user_link.colaborador_id = ?",
                          "user_link.encerrado_em_utc IS NULL",
                          "user_link.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME())",
                          "user_link.fim_vigencia >= CONVERT(date, SYSUTCDATETIME())");
                  assertThat(invocation.<UUID>getArgument(2)).isEqualTo(linkId);
                  assertThat(invocation.<UUID>getArgument(3)).isEqualTo(actorId);
                  assertThat(invocation.<UUID>getArgument(4)).isEqualTo(collaboratorId);
                  return linked;
                }
                if (sql.contains("FROM dbo.transicao_avaliacao")) {
                  return false;
                }
                assertThat(sql).contains("FROM dbo.usuario", "situacao = 'ATIVO'");
                assertThat(invocation.<UUID>getArgument(2)).isEqualTo(actorId);
                return active;
              })
          .when(jdbc)
          .query(
              anyString(),
              org.mockito.ArgumentMatchers.<ResultSetExtractor<Boolean>>any(),
              any(Object[].class));
    }

    private void authorizePublication() {
      ReflectionTestUtils.invokeMethod(repository, "requirePublish", assessment, actor);
    }

    private void authorizeSubmission() {
      ReflectionTestUtils.invokeMethod(repository, "requireSubmit", assessment, actor);
    }

    private AllowedActionsView actions() {
      return ReflectionTestUtils.invokeMethod(repository, "allowedActions", assessment, actor);
    }
  }
}

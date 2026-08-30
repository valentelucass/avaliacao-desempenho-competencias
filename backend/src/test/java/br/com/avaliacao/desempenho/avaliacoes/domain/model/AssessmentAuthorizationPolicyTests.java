package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AssessmentAuthorizationPolicyTests {

  private final AssessmentAuthorizationPolicy policy = new AssessmentAuthorizationPolicy();

  @Test
  void managerCanViewOnlyAnAssessmentItAuthored() {
    UUID manager = UUID.randomUUID();
    AssessmentAccessContext actor =
        new AssessmentAccessContext(
            manager, Set.of(AssessmentAuthorizationPolicy.VIEW_OWN_RESPONSES));

    assertThat(
            policy.canView(
                actor,
                new AssessmentAuthorizationPolicy.AssessmentOwnership(
                    manager, AssessmentType.GESTOR)))
        .isTrue();
    assertThat(
            policy.canView(
                actor,
                new AssessmentAuthorizationPolicy.AssessmentOwnership(
                    UUID.randomUUID(), AssessmentType.GESTOR)))
        .isFalse();
  }

  @Test
  void collaboratorCannotViewTheManagerAssessment() {
    UUID collaborator = UUID.randomUUID();
    AssessmentAccessContext actor =
        new AssessmentAccessContext(
            collaborator, Set.of(AssessmentAuthorizationPolicy.VIEW_OWN_SELF_ASSESSMENT));

    assertThat(
            policy.canView(
                actor,
                new AssessmentAuthorizationPolicy.AssessmentOwnership(
                    collaborator, AssessmentType.GESTOR)))
        .isFalse();
  }

  @Test
  void publicationAndReopeningAreAvailableForEveryAssessmentTypeToRhAndDirectorate() {
    AssessmentAccessContext rh =
        new AssessmentAccessContext(
            UUID.randomUUID(),
            Set.of(AssessmentAuthorizationPolicy.PUBLISH, AssessmentAuthorizationPolicy.REOPEN),
            Set.of("GERENCIA_RH"));

    assertThat(policy.canPublish(rh, AssessmentType.AUTOAVALIACAO)).isTrue();
    assertThat(policy.canReopen(rh, AssessmentType.AUTOAVALIACAO)).isTrue();
    assertThat(policy.canPublish(rh, AssessmentType.GESTOR)).isTrue();
    assertThat(policy.canReopen(rh, AssessmentType.GESTOR)).isTrue();
    assertThat(policy.canPublish(rh, AssessmentType.DIRETORIA_GERENCIA)).isTrue();
    assertThat(policy.canReopen(rh, AssessmentType.DIRETORIA_GERENCIA)).isTrue();

    AssessmentAccessContext technicalAdministrator =
        new AssessmentAccessContext(
            UUID.randomUUID(),
            Set.of(AssessmentAuthorizationPolicy.PUBLISH, AssessmentAuthorizationPolicy.REOPEN),
            Set.of("ADMINISTRADOR_PLATAFORMA", "GERENCIA_RH"));

    assertThat(policy.canPublish(technicalAdministrator, AssessmentType.GESTOR)).isFalse();
    assertThat(policy.canReopen(technicalAdministrator, AssessmentType.GESTOR)).isFalse();
  }

  @Test
  void feedbackRequiresTheOriginalEvaluatorAndDoesNotApplyToSelfAssessment() {
    UUID director = UUID.randomUUID();
    AssessmentAccessContext authorizedDirector =
        new AssessmentAccessContext(
            director,
            Set.of(
                AssessmentAuthorizationPolicy.EVALUATE_LINKED_MANAGERS,
                AssessmentAuthorizationPolicy.RECORD_OWN_FEEDBACK),
            Set.of("DIRETORIA"));

    assertThat(
            policy.canRecordOwnFeedback(
                authorizedDirector,
                new AssessmentAuthorizationPolicy.AssessmentOwnership(
                    director, AssessmentType.DIRETORIA_GERENCIA),
                FeedbackStatus.PENDENTE))
        .isTrue();
    assertThat(
            policy.canRecordOwnFeedback(
                authorizedDirector,
                new AssessmentAuthorizationPolicy.AssessmentOwnership(
                    director, AssessmentType.AUTOAVALIACAO),
                FeedbackStatus.PENDENTE))
        .isFalse();
    assertThat(
            policy.canRecordOwnFeedback(
                authorizedDirector,
                new AssessmentAuthorizationPolicy.AssessmentOwnership(
                    UUID.randomUUID(), AssessmentType.DIRETORIA_GERENCIA),
                FeedbackStatus.PENDENTE))
        .isFalse();
  }
}

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
  void publicationAndReopeningAreNeverAvailableForSelfAssessments() {
    AssessmentAccessContext rh =
        new AssessmentAccessContext(
            UUID.randomUUID(),
            Set.of(AssessmentAuthorizationPolicy.PUBLISH, AssessmentAuthorizationPolicy.REOPEN),
            Set.of("GERENCIA_RH"));

    assertThat(policy.canPublish(rh, AssessmentType.AUTOAVALIACAO)).isFalse();
    assertThat(policy.canReopen(rh, AssessmentType.AUTOAVALIACAO)).isFalse();
    assertThat(policy.canPublish(rh, AssessmentType.GESTOR)).isTrue();
    assertThat(policy.canReopen(rh, AssessmentType.GESTOR)).isTrue();

    AssessmentAccessContext technicalAdministrator =
        new AssessmentAccessContext(
            UUID.randomUUID(),
            Set.of(AssessmentAuthorizationPolicy.PUBLISH, AssessmentAuthorizationPolicy.REOPEN),
            Set.of("ADMINISTRADOR_PLATAFORMA", "GERENCIA_RH"));

    assertThat(policy.canPublish(technicalAdministrator, AssessmentType.GESTOR)).isFalse();
    assertThat(policy.canReopen(technicalAdministrator, AssessmentType.GESTOR)).isFalse();
  }
}

package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentCycleAccessPolicy.CycleState;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class AssessmentCycleAccessPolicyTests {

  private final AssessmentCycleAccessPolicy policy = new AssessmentCycleAccessPolicy();

  @Test
  void permitsRegularContributionsOnlyInsideAnOpenCycleWindow() {
    Instant opening = Instant.parse("2026-09-01T03:00:00Z");
    Instant closing = Instant.parse("2026-09-16T03:00:00Z");

    assertThat(policy.permitsRegularContribution(CycleState.OPEN, opening, closing, opening))
        .isTrue();
    assertThat(policy.permitsRegularContribution(CycleState.OPEN, opening, closing, closing))
        .isFalse();
    assertThat(policy.permitsRegularContribution(CycleState.CLOSED, opening, closing, opening))
        .isFalse();
  }

  @Test
  void permitsTheExplicitReopenExceptionAfterClosingOnlyForManagerDrafts() {
    assertThat(
            policy.permitsPostClosingReopenedContribution(
                CycleState.CLOSED, AssessmentType.GESTOR, AssessmentStatus.RASCUNHO, true))
        .isTrue();
    assertThat(
            policy.permitsPostClosingReopenedContribution(
                CycleState.CLOSED, AssessmentType.AUTOAVALIACAO, AssessmentStatus.RASCUNHO, true))
        .isFalse();
    assertThat(
            policy.permitsPostClosingReopenedContribution(
                CycleState.CLOSED, AssessmentType.GESTOR, AssessmentStatus.RASCUNHO, false))
        .isFalse();
  }

  @Test
  void permitsPublicationAndReopeningAfterTheCycleHasClosed() {
    assertThat(policy.permitsAdministrativeDecision(CycleState.OPEN)).isTrue();
    assertThat(policy.permitsAdministrativeDecision(CycleState.CLOSED)).isTrue();
    assertThat(policy.permitsAdministrativeDecision(CycleState.DRAFT)).isFalse();
  }
}

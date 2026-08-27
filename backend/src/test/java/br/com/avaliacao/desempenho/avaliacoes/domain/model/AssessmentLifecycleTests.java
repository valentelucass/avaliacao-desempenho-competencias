package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AssessmentLifecycleTests {

  private final AssessmentLifecycle lifecycle = new AssessmentLifecycle();

  @Test
  void submitsOnlyACompleteDraft() {
    UUID firstQuestion = UUID.randomUUID();
    UUID secondQuestion = UUID.randomUUID();
    AssessmentResponseSet completeResponses =
        AssessmentResponseSet.from(
            List.of(
                new AssessmentResponseSet.AssessmentResponse(firstQuestion, UUID.randomUUID()),
                new AssessmentResponseSet.AssessmentResponse(secondQuestion, UUID.randomUUID())));

    assertThat(
            lifecycle.submit(
                AssessmentStatus.RASCUNHO,
                completeResponses,
                List.of(firstQuestion, secondQuestion)))
        .isEqualTo(AssessmentStatus.ENVIADA);
  }

  @Test
  void rejectsAnIncompleteOrNonDraftSubmission() {
    UUID firstQuestion = UUID.randomUUID();
    UUID secondQuestion = UUID.randomUUID();
    AssessmentResponseSet incompleteResponses =
        AssessmentResponseSet.from(
            List.of(
                new AssessmentResponseSet.AssessmentResponse(firstQuestion, UUID.randomUUID())));

    assertThatThrownBy(
            () ->
                lifecycle.submit(
                    AssessmentStatus.RASCUNHO,
                    incompleteResponses,
                    List.of(firstQuestion, secondQuestion)))
        .isInstanceOf(AssessmentRuleViolation.class)
        .hasMessageContaining("todas as respostas obrigatórias");

    assertThatThrownBy(
            () ->
                lifecycle.submit(
                    AssessmentStatus.ENVIADA,
                    incompleteResponses,
                    List.of(firstQuestion, secondQuestion)))
        .isInstanceOf(AssessmentRuleViolation.class)
        .hasMessageContaining("enviar");
  }

  @Test
  void rejectsDuplicateAnswersForTheSameQuestion() {
    UUID question = UUID.randomUUID();

    assertThatThrownBy(
            () ->
                AssessmentResponseSet.from(
                    List.of(
                        new AssessmentResponseSet.AssessmentResponse(question, UUID.randomUUID()),
                        new AssessmentResponseSet.AssessmentResponse(question, UUID.randomUUID()))))
        .isInstanceOf(AssessmentRuleViolation.class)
        .hasMessageContaining("duas respostas");
  }

  @Test
  void publishesOnlySubmissionsAndReopensOnlyPublishedAssessments() {
    assertThat(lifecycle.publish(AssessmentStatus.ENVIADA)).isEqualTo(AssessmentStatus.PUBLICADA);
    assertThat(lifecycle.reopen(AssessmentStatus.PUBLICADA)).isEqualTo(AssessmentStatus.RASCUNHO);

    assertThatThrownBy(() -> lifecycle.publish(AssessmentStatus.RASCUNHO))
        .isInstanceOf(AssessmentRuleViolation.class)
        .hasMessageContaining("publicar");
    assertThatThrownBy(() -> lifecycle.reopen(AssessmentStatus.ENVIADA))
        .isInstanceOf(AssessmentRuleViolation.class)
        .hasMessageContaining("reabrir");
  }

  @Test
  void acceptsOnlyFinalScoresInsideTheApprovedDomainRange() {
    assertThat(new FinalAssessmentScore(new BigDecimal("80"))).isNotNull();
    assertThat(new FinalAssessmentScore(new BigDecimal("120"))).isNotNull();

    assertThatThrownBy(() -> new FinalAssessmentScore(new BigDecimal("79.999")))
        .isInstanceOf(AssessmentRuleViolation.class)
        .hasMessageContaining("80 e 120");
    assertThatThrownBy(() -> new FinalAssessmentScore(new BigDecimal("120.001")))
        .isInstanceOf(AssessmentRuleViolation.class)
        .hasMessageContaining("80 e 120");
  }
}

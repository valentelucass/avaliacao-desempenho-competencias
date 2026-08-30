package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class FeedbackLifecycleTests {

  private final FeedbackLifecycle lifecycle = new FeedbackLifecycle();

  @Test
  void marksPublishedManagerAndDirectorAssessmentsAsPending() {
    assertThat(lifecycle.statusAtPublication(AssessmentType.GESTOR))
        .isEqualTo(FeedbackStatus.PENDENTE);
    assertThat(lifecycle.statusAtPublication(AssessmentType.DIRETORIA_GERENCIA))
        .isEqualTo(FeedbackStatus.PENDENTE);
    assertThat(lifecycle.statusAtPublication(AssessmentType.AUTOAVALIACAO))
        .isEqualTo(FeedbackStatus.NAO_APLICAVEL);
  }

  @Test
  void completesOnlyPendingFeedbackForAPublishedAssessment() {
    assertThat(lifecycle.complete(AssessmentStatus.PUBLICADA, FeedbackStatus.PENDENTE))
        .isEqualTo(FeedbackStatus.CONCLUIDO);

    assertThatThrownBy(() -> lifecycle.complete(AssessmentStatus.ENVIADA, FeedbackStatus.PENDENTE))
        .isInstanceOf(AssessmentRuleViolation.class);
    assertThatThrownBy(
            () -> lifecycle.complete(AssessmentStatus.PUBLICADA, FeedbackStatus.CONCLUIDO))
        .isInstanceOf(AssessmentRuleViolation.class);
  }
}

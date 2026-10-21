package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class EvaluationCycleWindowStatusTests {
  private final Instant opening = Instant.parse("2026-09-16T17:00:00Z");
  private final Instant closing = Instant.parse("2026-10-17T02:59:00Z");

  @Test
  void openingIsInclusiveAndClosingIsExclusiveAtTheConfiguredBrazilianTimes() {
    assertThat(EvaluationCycleWindowStatus.at(opening, closing, opening.minusNanos(1)))
        .isEqualTo(EvaluationCycleWindowStatus.AGUARDANDO_ABERTURA);
    assertThat(EvaluationCycleWindowStatus.at(opening, closing, opening))
        .isEqualTo(EvaluationCycleWindowStatus.VIGENTE);
    assertThat(EvaluationCycleWindowStatus.at(opening, closing, closing.minusNanos(1)))
        .isEqualTo(EvaluationCycleWindowStatus.VIGENTE);
    assertThat(EvaluationCycleWindowStatus.at(opening, closing, closing))
        .isEqualTo(EvaluationCycleWindowStatus.PRAZO_ENCERRADO);
    assertThat(EvaluationCycleWindowStatus.at(opening, closing, closing.plusNanos(1)))
        .isEqualTo(EvaluationCycleWindowStatus.PRAZO_ENCERRADO);
  }

  @Test
  void incompleteOrInvalidWindowsNeverLookAvailable() {
    assertThat(EvaluationCycleWindowStatus.at(null, closing, opening))
        .isEqualTo(EvaluationCycleWindowStatus.SEM_JANELA);
    assertThat(EvaluationCycleWindowStatus.at(opening, null, opening))
        .isEqualTo(EvaluationCycleWindowStatus.SEM_JANELA);
    assertThat(EvaluationCycleWindowStatus.at(null, null, opening))
        .isEqualTo(EvaluationCycleWindowStatus.SEM_JANELA);
    assertThat(EvaluationCycleWindowStatus.at(closing, opening, opening))
        .isEqualTo(EvaluationCycleWindowStatus.SEM_JANELA);
    assertThat(EvaluationCycleWindowStatus.at(opening, opening, opening))
        .isEqualTo(EvaluationCycleWindowStatus.SEM_JANELA);
  }
}

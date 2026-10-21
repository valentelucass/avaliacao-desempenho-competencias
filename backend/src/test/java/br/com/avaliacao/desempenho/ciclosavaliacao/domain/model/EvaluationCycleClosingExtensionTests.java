package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import static org.assertj.core.api.Assertions.*;

import java.time.Instant;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class EvaluationCycleClosingExtensionTests {
  private final Instant expected = Instant.parse("2026-10-17T02:59:00.1234567Z");
  private final LocalDateTime closing = LocalDateTime.parse("2026-10-30T23:59:00");

  @Test
  void convertsOnlyTheNewBrazilianTimeAndPreservesTheExactExpectedUtcToken() {
    var extension =
        new EvaluationCycleClosingExtension(closing, expected, "  Motivo\npara prorrogar\tQA  ");
    assertThat(extension.closingAtUtc()).isEqualTo(Instant.parse("2026-10-31T02:59:00Z"));
    assertThat(extension.expectedClosingAt()).isEqualTo(expected);
    assertThat(extension.reason()).isEqualTo("Motivo para prorrogar QA");
  }

  @Test
  void rejectsEmptyShortOversizedAndControlCharacterReasons() {
    for (String reason :
        new String[] {null, "          ", "Curto", "x".repeat(501), "Motivo com \u0000 controle"}) {
      assertThatThrownBy(() -> new EvaluationCycleClosingExtension(closing, expected, reason))
          .isInstanceOf(CycleAdministrationRuleViolation.class)
          .extracting(error -> ((CycleAdministrationRuleViolation) error).reasonCode())
          .isEqualTo("CYCLE_EXTENSION_REASON_INVALID");
    }
  }

  @Test
  void rejectsPrecisionThatThePersistedColumnOrSqlTokenCannotRepresentExactly() {
    assertThatThrownBy(
            () ->
                new EvaluationCycleClosingExtension(
                    closing.withNano(1), expected, "Motivo fictício QA"))
        .isInstanceOf(CycleAdministrationRuleViolation.class);
    assertThatThrownBy(
            () ->
                new EvaluationCycleClosingExtension(
                    closing, expected.plusNanos(1), "Motivo fictício QA"))
        .isInstanceOf(CycleAdministrationRuleViolation.class);
  }

  @Test
  void rejectsDatesOutsideTheSqlServerRangeBeforePersistence() {
    assertThatThrownBy(
            () ->
                new EvaluationCycleClosingExtension(
                    closing.withYear(10000), expected, "Motivo fictício QA"))
        .isInstanceOf(CycleAdministrationRuleViolation.class);
    assertThatThrownBy(
            () -> new EvaluationCycleClosingExtension(closing, Instant.MAX, "Motivo fictício QA"))
        .isInstanceOf(CycleAdministrationRuleViolation.class);
  }
}

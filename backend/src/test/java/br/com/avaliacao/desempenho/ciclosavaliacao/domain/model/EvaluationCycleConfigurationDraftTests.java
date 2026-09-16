package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class EvaluationCycleConfigurationDraftTests {

  @Test
  void preservesTheOriginalSeptemberWindowAndConvertsItToUtc() {
    EvaluationCycleConfigurationDraft configuration = validConfiguration();

    assertThat(configuration.name()).isEqualTo("Ciclo 2026");
    assertThat(configuration.openingAtUtc()).isEqualTo(Instant.parse("2026-09-01T03:00:00Z"));
    assertThat(configuration.closingAtUtc()).isEqualTo(Instant.parse("2026-09-16T03:00:00Z"));
  }

  @ParameterizedTest
  @CsvSource({
    "2026-09-16T14:00,2026-10-16T23:59,2026-09-16T17:00:00Z,2026-10-17T02:59:00Z",
    "2026-12-20T09:30,2027-01-20T18:15,2026-12-20T12:30:00Z,2027-01-20T21:15:00Z"
  })
  void acceptsConfiguredDatesAcrossMonthsAndYears(
      String opening, String closing, String openingUtc, String closingUtc) {
    var configuration =
        new EvaluationCycleConfigurationDraft(
            "Ciclo 2026",
            LocalDateTime.parse(opening),
            LocalDateTime.parse(closing),
            EvaluationCycleConfigurationDraft.TIME_ZONE,
            true,
            List.of(appliedQuestionnaire()));

    assertThat(configuration.openingAtUtc()).isEqualTo(Instant.parse(openingUtc));
    assertThat(configuration.closingAtUtc()).isEqualTo(Instant.parse(closingUtc));
    assertThat(configuration.selfAssessmentEnabled()).isTrue();
  }

  @ParameterizedTest
  @CsvSource({
    "2026-09-16T14:00,2026-09-16T14:00",
    "2026-10-17T14:00,2026-10-16T23:59",
    // A ordem também deve ser válida nos instantes UTC, inclusive no horário de verão histórico.
    "2018-11-04T00:45,2018-11-04T01:15"
  })
  void rejectsClosingAtOrBeforeOpening(String opening, String closing) {
    assertThatThrownBy(
            () ->
                new EvaluationCycleConfigurationDraft(
                    "Ciclo 2026",
                    LocalDateTime.parse(opening),
                    LocalDateTime.parse(closing),
                    EvaluationCycleConfigurationDraft.TIME_ZONE,
                    true,
                    List.of(appliedQuestionnaire())))
        .isInstanceOf(CycleAdministrationRuleViolation.class)
        .hasMessageContaining("posterior à abertura")
        .satisfies(
            error ->
                assertThat(((CycleAdministrationRuleViolation) error).reasonCode())
                    .isEqualTo("CYCLE_WINDOW_ORDER_INVALID"));
  }

  @Test
  void rejectsApplyingTheSameQuestionnaireVersionTwice() {
    UUID questionnaireVersionId = UUID.randomUUID();

    assertThatThrownBy(
            () ->
                new EvaluationCycleConfigurationDraft(
                    "Ciclo 2026",
                    LocalDateTime.of(2026, 9, 1, 0, 0),
                    LocalDateTime.of(2026, 9, 16, 0, 0),
                    EvaluationCycleConfigurationDraft.TIME_ZONE,
                    false,
                    List.of(
                        new EvaluationCycleConfigurationDraft.AppliedQuestionnaireDraft(
                            questionnaireVersionId, UUID.randomUUID(), UUID.randomUUID()),
                        new EvaluationCycleConfigurationDraft.AppliedQuestionnaireDraft(
                            questionnaireVersionId, UUID.randomUUID(), UUID.randomUUID()))))
        .isInstanceOf(CycleAdministrationRuleViolation.class)
        .hasMessageContaining("só pode ser aplicada uma vez");
  }

  private static EvaluationCycleConfigurationDraft validConfiguration() {
    return new EvaluationCycleConfigurationDraft(
        "  Ciclo 2026 ",
        LocalDateTime.of(2026, 9, 1, 0, 0),
        LocalDateTime.of(2026, 9, 16, 0, 0),
        EvaluationCycleConfigurationDraft.TIME_ZONE,
        true,
        List.of(appliedQuestionnaire()));
  }

  private static EvaluationCycleConfigurationDraft.AppliedQuestionnaireDraft
      appliedQuestionnaire() {
    return new EvaluationCycleConfigurationDraft.AppliedQuestionnaireDraft(
        UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
  }
}

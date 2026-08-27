package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EvaluationCycleConfigurationDraftTests {

  @Test
  void acceptsTheConfirmedAnnualWindowAndConvertsItToUtc() {
    EvaluationCycleConfigurationDraft configuration = validConfiguration();

    assertThat(configuration.name()).isEqualTo("Ciclo 2026");
    assertThat(configuration.openingAtUtc()).isEqualTo(Instant.parse("2026-09-01T03:00:00Z"));
    assertThat(configuration.closingAtUtc()).isEqualTo(Instant.parse("2026-09-16T03:00:00Z"));
  }

  @Test
  void rejectsAnyWindowOtherThanTheConfirmedSeptemberDates() {
    assertThatThrownBy(
            () ->
                new EvaluationCycleConfigurationDraft(
                    "Ciclo 2026",
                    LocalDateTime.of(2026, 9, 2, 0, 0),
                    LocalDateTime.of(2026, 9, 16, 0, 0),
                    EvaluationCycleConfigurationDraft.TIME_ZONE,
                    true,
                    List.of(appliedQuestionnaire())))
        .isInstanceOf(CycleAdministrationRuleViolation.class)
        .hasMessageContaining("1º de setembro");
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

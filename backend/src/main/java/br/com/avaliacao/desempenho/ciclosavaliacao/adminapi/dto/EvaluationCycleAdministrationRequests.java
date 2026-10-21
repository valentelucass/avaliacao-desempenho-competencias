package br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.dto;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleClosingExtension;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleConfigurationDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleDraft;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** Escritas administrativas de ciclo; os ids representam versões previamente aprovadas. */
public final class EvaluationCycleAdministrationRequests {

  private EvaluationCycleAdministrationRequests() {}

  public record CreateCycle(
      @NotBlank @Size(max = 100) String code, @NotNull @Valid Configuration configuration) {

    public EvaluationCycleDraft toDraft() {
      return new EvaluationCycleDraft(code, configuration.toDraft());
    }
  }

  public record UpdateCycle(@NotNull @Valid Configuration configuration) {

    public EvaluationCycleConfigurationDraft toDraft() {
      return configuration.toDraft();
    }
  }

  public record ExtendClosing(
      @NotBlank @Size(max = 40) String closingAtLocal,
      @NotNull Instant expectedClosingAt,
      @NotBlank @Size(min = 10, max = 500) String reason) {

    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
      throw new IllegalArgumentException("O pedido de prorrogação contém um campo não permitido.");
    }

    public EvaluationCycleClosingExtension toExtension() {
      try {
        return new EvaluationCycleClosingExtension(
            LocalDateTime.parse(
                closingAtLocal, java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME),
            expectedClosingAt,
            reason);
      } catch (java.time.format.DateTimeParseException exception) {
        throw new br.com.avaliacao.desempenho.ciclosavaliacao.domain.model
            .CycleAdministrationRuleViolation(
            "CYCLE_EXTENSION_DATE_INVALID",
            "Informe o novo encerramento no horário local de Brasília, sem fuso ou deslocamento.");
      }
    }
  }

  public record Configuration(
      @NotBlank @Size(max = 200) String name,
      @NotNull LocalDateTime openingAtLocal,
      @NotNull LocalDateTime closingAtLocal,
      @NotBlank @Size(max = 100) String timeZone,
      boolean selfAssessmentEnabled,
      @NotEmpty @Size(max = 20) List<@NotNull @Valid AppliedQuestionnaire> questionnaires) {

    private EvaluationCycleConfigurationDraft toDraft() {
      return new EvaluationCycleConfigurationDraft(
          name,
          openingAtLocal,
          closingAtLocal,
          timeZone,
          selfAssessmentEnabled,
          questionnaires.stream().map(AppliedQuestionnaire::toDraft).toList());
    }
  }

  public record AppliedQuestionnaire(
      @NotNull UUID questionnaireVersionId,
      @NotNull UUID calculationConfigurationVersionId,
      @NotNull UUID classificationMatrixVersionId) {

    private EvaluationCycleConfigurationDraft.AppliedQuestionnaireDraft toDraft() {
      return new EvaluationCycleConfigurationDraft.AppliedQuestionnaireDraft(
          questionnaireVersionId, calculationConfigurationVersionId, classificationMatrixVersionId);
    }
  }
}

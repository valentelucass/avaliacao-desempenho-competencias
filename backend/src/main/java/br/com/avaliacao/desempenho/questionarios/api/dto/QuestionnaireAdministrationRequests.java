package br.com.avaliacao.desempenho.questionarios.api.dto;

import br.com.avaliacao.desempenho.questionarios.domain.model.QuestionnaireVersionDraft;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Contratos de escrita; as cinco opções e a matriz 2024.1 são definidas no servidor. */
public final class QuestionnaireAdministrationRequests {

  private QuestionnaireAdministrationRequests() {}

  public record CreateVersion(
      @NotNull @Valid Questionnaire questionnaire,
      @Min(1) int versionNumber,
      @NotBlank @Size(max = 200) String title,
      @Size(max = 1000) String description,
      @NotNull @Valid Calculation calculation,
      @Min(1) int classificationMatrixVersionNumber,
      @NotEmpty @Size(max = 100) List<@NotNull @Valid Competency> competencies) {

    public QuestionnaireVersionDraft toDraft() {
      return new QuestionnaireVersionDraft(
          new QuestionnaireVersionDraft.QuestionnaireDraft(
              questionnaire.code(), questionnaire.name()),
          versionNumber,
          title,
          description,
          new QuestionnaireVersionDraft.CalculationDraft(
              calculation.code(), calculation.versionNumber()),
          classificationMatrixVersionNumber,
          competencies.stream().map(Competency::toDraft).toList());
    }
  }

  public record Questionnaire(
      @NotBlank @Size(max = 100) String code, @NotBlank @Size(max = 200) String name) {}

  public record Calculation(@NotBlank @Size(max = 100) String code, @Min(1) int versionNumber) {}

  public record Competency(
      @NotBlank @Size(max = 100) String code,
      @NotBlank @Size(max = 200) String name,
      @Min(1) int versionNumber,
      @Size(max = 2000) String description,
      @Min(1) int order,
      @NotEmpty @Size(max = 1000) List<@NotNull @Valid Question> questions) {

    private QuestionnaireVersionDraft.CompetencyDraft toDraft() {
      return new QuestionnaireVersionDraft.CompetencyDraft(
          code,
          name,
          versionNumber,
          description,
          order,
          questions.stream().map(Question::toDraft).toList());
    }
  }

  public record Question(
      @NotBlank @Size(max = 100) String code,
      @NotBlank @Size(max = 1000) String text,
      @Size(max = 4000) String description,
      @Min(1) int order) {

    private QuestionnaireVersionDraft.QuestionDraft toDraft() {
      return new QuestionnaireVersionDraft.QuestionDraft(code, text, description, order);
    }
  }
}

package br.com.avaliacao.desempenho.ciclosavaliacao.api.dto;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository.AppliedQuestionnaireView;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository.CompetencyView;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository.EvaluationCyclePage;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository.EvaluationCycleView;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository.OptionView;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository.QuestionView;
import java.util.Objects;

/** Converte projeções de leitura em DTOs de API sem expor o modelo de persistência. */
public final class EvaluationCycleResponseMapper {

  public EvaluationCycleListResponse toListResponse(EvaluationCyclePage page, int limit) {
    EvaluationCyclePage result = Objects.requireNonNull(page, "página não pode ser nula");
    return new EvaluationCycleListResponse(
        result.items().stream().map(this::toCycleResponse).toList(),
        new EvaluationCycleListResponse.EvaluationCyclePageResponse(
            limit, result.nextCursor() == null ? null : result.nextCursor().toString()));
  }

  public AppliedQuestionnaireResponse toAppliedQuestionnaireResponse(
      AppliedQuestionnaireView view) {
    AppliedQuestionnaireView questionnaire =
        Objects.requireNonNull(view, "questionário aplicado não pode ser nulo");
    return new AppliedQuestionnaireResponse(
        questionnaire.cycleQuestionnaireId(),
        questionnaire.questionnaireVersionId(),
        questionnaire.questionnaireCode(),
        questionnaire.questionnaireVersionNumber(),
        questionnaire.title(),
        questionnaire.competencies().stream().map(this::toCompetencyResponse).toList());
  }

  private EvaluationCycleResponse toCycleResponse(EvaluationCycleView view) {
    return new EvaluationCycleResponse(view.id(), view.name(), view.status().name());
  }

  private AppliedQuestionnaireResponse.CompetencyResponse toCompetencyResponse(
      CompetencyView view) {
    return new AppliedQuestionnaireResponse.CompetencyResponse(
        view.id(), view.name(), view.questions().stream().map(this::toQuestionResponse).toList());
  }

  private AppliedQuestionnaireResponse.QuestionResponse toQuestionResponse(QuestionView view) {
    return new AppliedQuestionnaireResponse.QuestionResponse(
        view.id(),
        view.text(),
        view.description(),
        view.required(),
        view.options().stream().map(this::toOptionResponse).toList());
  }

  private AppliedQuestionnaireResponse.OptionResponse toOptionResponse(OptionView view) {
    return new AppliedQuestionnaireResponse.OptionResponse(view.id(), view.label());
  }
}

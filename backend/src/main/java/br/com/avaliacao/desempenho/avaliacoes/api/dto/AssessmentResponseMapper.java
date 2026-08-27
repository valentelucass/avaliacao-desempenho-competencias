package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.PerformanceClassification;
import java.math.BigDecimal;
import java.util.Objects;

/** Converte as visões da aplicação em DTOs HTTP sem expor modelos SQL. */
public final class AssessmentResponseMapper {

  public AssessmentSummaryResponse toSummary(AssessmentRepository.AssessmentSummaryView source) {
    AssessmentRepository.AssessmentSummaryView safeSource =
        Objects.requireNonNull(source, "resumo não pode ser nulo");
    return new AssessmentSummaryResponse(
        safeSource.id(),
        new AssessmentSummaryResponse.CycleResponse(safeSource.cycleId(), safeSource.cycleName()),
        new AssessmentSummaryResponse.EvaluatedResponse(safeSource.evaluatedDisplayName()),
        safeSource.type().name(),
        safeSource.status(),
        safeSource.revision(),
        safeSource.updatedAt());
  }

  public AssessmentDetailResponse toDetail(AssessmentRepository.AssessmentDetailView source) {
    AssessmentRepository.AssessmentDetailView safeSource =
        Objects.requireNonNull(source, "detalhe não pode ser nulo");
    return new AssessmentDetailResponse(
        safeSource.summary().id(),
        new AssessmentSummaryResponse.CycleResponse(
            safeSource.summary().cycleId(), safeSource.summary().cycleName()),
        new AssessmentSummaryResponse.EvaluatedResponse(
            safeSource.summary().evaluatedDisplayName()),
        safeSource.summary().type().name(),
        safeSource.summary().status(),
        safeSource.summary().revision(),
        safeSource.summary().updatedAt(),
        new AssessmentDetailResponse.QuestionnaireResponse(
            safeSource.questionnaireVersion(),
            safeSource.competencies().stream().map(this::toCompetency).toList()),
        safeSource.answers().stream().map(this::toAnswer).toList(),
        safeSource.comment(),
        safeSource.actionPlan(),
        safeSource.result() == null ? null : toResult(safeSource.result()));
  }

  private AssessmentDetailResponse.CompetencyResponse toCompetency(
      AssessmentRepository.CompetencyView source) {
    return new AssessmentDetailResponse.CompetencyResponse(
        source.id(), source.name(), source.questions().stream().map(this::toQuestion).toList());
  }

  private AssessmentDetailResponse.QuestionResponse toQuestion(
      AssessmentRepository.QuestionView source) {
    return new AssessmentDetailResponse.QuestionResponse(
        source.id(),
        source.text(),
        source.description(),
        source.required(),
        source.options().stream().map(this::toOption).toList());
  }

  private AssessmentDetailResponse.OptionResponse toOption(AssessmentRepository.OptionView source) {
    return new AssessmentDetailResponse.OptionResponse(
        source.id(), source.label(), source.points());
  }

  private AssessmentDetailResponse.AnswerResponse toAnswer(AssessmentRepository.AnswerView source) {
    return new AssessmentDetailResponse.AnswerResponse(source.questionId(), source.optionId());
  }

  private AssessmentDetailResponse.ResultResponse toResult(AssessmentRepository.ResultView source) {
    PerformanceClassification classification =
        PerformanceClassification.valueOf(source.classification());
    return new AssessmentDetailResponse.ResultResponse(
        new BigDecimal(source.finalScore()),
        new AssessmentDetailResponse.ClassificationResponse(
            classification.label(), source.guidance()));
  }
}

package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Detalhe de uma versão autorizada; respostas e textos livres nunca autorizam transições. */
public record AssessmentDetailResponse(
    UUID id,
    AssessmentSummaryResponse.CycleResponse cycle,
    AssessmentSummaryResponse.EvaluatedResponse evaluated,
    String type,
    String status,
    String revision,
    Instant updatedAt,
    QuestionnaireResponse questionnaire,
    List<AnswerResponse> answers,
    String comment,
    String actionPlan,
    ResultResponse result,
    List<CompetencyScoreResponse> competencyScores) {

  public record QuestionnaireResponse(String version, List<CompetencyResponse> competencies) {}

  public record CompetencyResponse(UUID id, String name, List<QuestionResponse> questions) {}

  public record QuestionResponse(
      UUID id, String text, String description, boolean required, List<OptionResponse> options) {}

  public record OptionResponse(UUID id, String label, int points) {}

  public record AnswerResponse(UUID questionId, UUID optionId) {}

  public record ResultResponse(BigDecimal finalScore, ClassificationResponse classification) {}

  public record CompetencyScoreResponse(UUID id, String name, BigDecimal score) {}

  public record ClassificationResponse(String label, String guidance) {}
}

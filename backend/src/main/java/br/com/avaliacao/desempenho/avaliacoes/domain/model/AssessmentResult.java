package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.math.BigDecimal;
import java.util.Objects;

/** Resultado servidor-side reconstituível por soma e quantidade de respostas. */
public record AssessmentResult(
    long totalPoints,
    int responseCount,
    BigDecimal finalScore,
    PerformanceClassification classification) {

  public AssessmentResult {
    if (responseCount < 1) {
      throw new AssessmentRuleViolation("O resultado exige ao menos uma resposta.");
    }
    Objects.requireNonNull(finalScore, "nota final não pode ser nula");
    Objects.requireNonNull(classification, "classificação não pode ser nula");
    new FinalAssessmentScore(finalScore);
    if (finalScore.scale() != 1) {
      throw new AssessmentRuleViolation("A nota final persistida deve ter uma casa decimal.");
    }
  }
}

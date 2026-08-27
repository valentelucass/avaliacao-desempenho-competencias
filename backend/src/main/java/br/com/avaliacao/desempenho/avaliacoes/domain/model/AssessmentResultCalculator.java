package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.util.Collection;
import java.util.Objects;

/** Calcula o resultado v2024.1 apenas a partir de opções validadas pelo servidor. */
public final class AssessmentResultCalculator {

  private final AssessmentClassificationPolicy classificationPolicy;

  public AssessmentResultCalculator() {
    this(new AssessmentClassificationPolicy());
  }

  public AssessmentResultCalculator(AssessmentClassificationPolicy classificationPolicy) {
    this.classificationPolicy =
        Objects.requireNonNull(classificationPolicy, "política de classificação não pode ser nula");
  }

  public AssessmentResult calculate(
      Collection<AssessmentScaleOption> selectedOptions, int expectedResponseCount) {
    SimpleAverageScore average = SimpleAverageScore.from(selectedOptions, expectedResponseCount);
    return new AssessmentResult(
        average.totalPoints(),
        average.responseCount(),
        average.roundedToOneDecimal(),
        classificationPolicy.classify(average));
  }
}

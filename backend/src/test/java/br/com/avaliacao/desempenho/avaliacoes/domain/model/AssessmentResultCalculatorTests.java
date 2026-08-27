package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class AssessmentResultCalculatorTests {

  private final AssessmentResultCalculator calculator = new AssessmentResultCalculator();

  @Test
  void preservesTheExactComponentsAndClassifiesTheRoundedFinalScore() {
    AssessmentResult result =
        calculator.calculate(
            List.of(
                AssessmentScaleOption.BELOW_EXPECTATIONS,
                AssessmentScaleOption.WITHIN_EXPECTATIONS,
                AssessmentScaleOption.REFERENCE),
            3);

    assertThat(result.totalPoints()).isEqualTo(300);
    assertThat(result.responseCount()).isEqualTo(3);
    assertThat(result.finalScore()).isEqualByComparingTo("100.0");
    assertThat(result.classification()).isEqualTo(PerformanceClassification.WITHIN_EXPECTATIONS);
  }

  @Test
  void refusesIncompleteResponsesBeforeCreatingAnyResult() {
    assertThatThrownBy(
            () -> calculator.calculate(List.of(AssessmentScaleOption.WITHIN_EXPECTATIONS), 2))
        .isInstanceOf(AssessmentRuleViolation.class)
        .hasMessageContaining("todas as respostas");
  }
}

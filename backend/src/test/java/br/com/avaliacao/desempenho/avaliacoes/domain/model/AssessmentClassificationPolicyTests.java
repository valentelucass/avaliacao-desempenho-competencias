package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class AssessmentClassificationPolicyTests {

  private final AssessmentClassificationPolicy policy = new AssessmentClassificationPolicy();

  @Test
  void classifiesEveryBoundaryOfTheGeneralMatrix() {
    assertThat(policy.classify(average(11, 9, 0, 0, 0)))
        .isEqualTo(PerformanceClassification.BELOW_EXPECTATIONS);
    assertThat(policy.classify(average(10, 10, 0, 0, 0)))
        .isEqualTo(PerformanceClassification.IN_DEVELOPMENT);
    assertThat(policy.classify(average(0, 10, 10, 0, 0)))
        .isEqualTo(PerformanceClassification.WITHIN_EXPECTATIONS);
    assertThat(policy.classify(average(0, 0, 10, 10, 0)))
        .isEqualTo(PerformanceClassification.EXCEEDS_EXPECTATIONS);
    assertThat(policy.classify(average(0, 0, 0, 10, 10)))
        .isEqualTo(PerformanceClassification.REFERENCE);
  }

  @Test
  void usesTheRoundedFinalScoreWhenClassifying() {
    SimpleAverageScore average = average(0, 0, 1, 19, 0);

    assertThat(average.roundedToOneDecimal()).isEqualByComparingTo("109.5");
    assertThat(policy.classify(average)).isEqualTo(PerformanceClassification.EXCEEDS_EXPECTATIONS);
  }

  private SimpleAverageScore average(
      int belowExpectations,
      int inDevelopment,
      int withinExpectations,
      int exceedsExpectations,
      int reference) {
    List<AssessmentScaleOption> responses = new ArrayList<>();
    add(responses, AssessmentScaleOption.BELOW_EXPECTATIONS, belowExpectations);
    add(responses, AssessmentScaleOption.IN_DEVELOPMENT, inDevelopment);
    add(responses, AssessmentScaleOption.WITHIN_EXPECTATIONS, withinExpectations);
    add(responses, AssessmentScaleOption.EXCEEDS_EXPECTATIONS, exceedsExpectations);
    add(responses, AssessmentScaleOption.REFERENCE, reference);
    return SimpleAverageScore.from(responses, responses.size());
  }

  private void add(List<AssessmentScaleOption> responses, AssessmentScaleOption option, int times) {
    for (int index = 0; index < times; index++) {
      responses.add(option);
    }
  }
}

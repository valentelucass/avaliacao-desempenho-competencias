package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class SimpleAverageScoreTests {

  @Test
  void keepsTheExactAverageForAuditAndRoundsTheFinalScoreToOneDecimal() {
    SimpleAverageScore average =
        SimpleAverageScore.from(
            List.of(
                AssessmentScaleOption.BELOW_EXPECTATIONS,
                AssessmentScaleOption.BELOW_EXPECTATIONS,
                AssessmentScaleOption.WITHIN_EXPECTATIONS),
            3);

    assertThat(average.totalPoints()).isEqualTo(260);
    assertThat(average.responseCount()).isEqualTo(3);
    assertThat(average.isAtLeast(86)).isTrue();
    assertThat(average.isAtLeast(87)).isFalse();
    assertThat(average.isWithinInclusive(80, 120)).isTrue();
    assertThat(average.roundedToOneDecimal()).isEqualByComparingTo("86.7");
  }

  @Test
  void requiresEveryExpectedAnswerBeforeCreatingAFinalScore() {
    assertThatThrownBy(
            () -> SimpleAverageScore.from(List.of(AssessmentScaleOption.BELOW_EXPECTATIONS), 2))
        .isInstanceOf(AssessmentRuleViolation.class)
        .hasMessageContaining("todas as respostas obrigatórias");
  }

  @Test
  void mapsOnlyTheFiveScaleValuesExtractedFromTheMacro() {
    assertThat(AssessmentScaleOption.values())
        .extracting(AssessmentScaleOption::points)
        .containsExactly(80, 90, 100, 110, 120);
  }
}

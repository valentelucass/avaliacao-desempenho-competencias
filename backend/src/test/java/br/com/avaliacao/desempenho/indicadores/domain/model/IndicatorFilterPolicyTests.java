package br.com.avaliacao.desempenho.indicadores.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class IndicatorFilterPolicyTests {

  private final IndicatorFilterPolicy policy = new IndicatorFilterPolicy();

  @Test
  void acceptsOnePopulationDimensionAndKeepsItInTheSqlCriteria() {
    UUID cycleId = UUID.randomUUID();
    UUID areaId = UUID.randomUUID();

    IndicatorQueryPlan plan =
        policy.planFor(
            new IndicatorQuery(
                cycleId, IndicatorMetric.FINAL_SCORE_AVERAGE, null, areaId, null, null, null));

    assertThat(plan.requiresInsufficientDataResponse()).isFalse();
    assertThat(plan.aggregateCriteria().cycleId()).isEqualTo(cycleId);
    assertThat(plan.aggregateCriteria().populationDimension())
        .isEqualTo(IndicatorPopulationDimension.AREA);
    assertThat(plan.aggregateCriteria().populationId()).isEqualTo(areaId);
  }

  @Test
  void rejectsCombinationsOfPopulationDimensionsBeforeAggregation() {
    assertThatThrownBy(
            () ->
                policy.planFor(
                    new IndicatorQuery(
                        UUID.randomUUID(),
                        IndicatorMetric.FINAL_SCORE_AVERAGE,
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        null,
                        null,
                        null)))
        .isInstanceOf(IndicatorFilterViolation.class)
        .hasMessageContaining("não podem ser combinados");
  }

  @Test
  void requiresCompetencyOnlyForTheCompetencyMetric() {
    assertThatThrownBy(
            () ->
                policy.planFor(
                    new IndicatorQuery(
                        UUID.randomUUID(),
                        IndicatorMetric.COMPETENCY_SCORE_AVERAGE,
                        null,
                        null,
                        null,
                        null,
                        null)))
        .isInstanceOf(IndicatorFilterViolation.class)
        .hasMessageContaining("exige competência");

    assertThatThrownBy(
            () ->
                policy.planFor(
                    new IndicatorQuery(
                        UUID.randomUUID(),
                        IndicatorMetric.CLASSIFICATION_DISTRIBUTION,
                        null,
                        null,
                        null,
                        null,
                        UUID.randomUUID())))
        .isInstanceOf(IndicatorFilterViolation.class)
        .hasMessageContaining("só pode selecionar");
  }

  @Test
  void turnsEveryIndividualFilterIntoAnInsufficientDataPlan() {
    IndicatorQueryPlan plan =
        policy.planFor(
            new IndicatorQuery(
                UUID.randomUUID(),
                IndicatorMetric.FINAL_SCORE_AVERAGE,
                null,
                null,
                null,
                UUID.randomUUID(),
                null));

    assertThat(plan.requiresInsufficientDataResponse()).isTrue();
    assertThat(plan.aggregateCriteria().populationDimension())
        .isEqualTo(IndicatorPopulationDimension.OVERALL);
    assertThat(plan.aggregateCriteria().populationId()).isNull();
  }
}

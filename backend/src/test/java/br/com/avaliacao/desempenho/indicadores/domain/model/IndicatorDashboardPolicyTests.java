package br.com.avaliacao.desempenho.indicadores.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Kind;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class IndicatorDashboardPolicyTests {

  private final IndicatorDashboardPolicy policy = new IndicatorDashboardPolicy();

  @Test
  void suppressesGroupsUnderFiveCollaborators() {
    var dashboard =
        policy.publish(
            List.of(
                new IndicatorDashboardAggregate(Kind.COLLABORATORS, null, 4, 4, 0, null),
                score(Kind.AVERAGE, null, 4, "120"),
                score(Kind.ITEM, "Grupo protegido", 3, "120")));
    assertThat(dashboard.hasData()).isFalse();
    assertThat(dashboard.metrics().collaborators()).isNull();
    assertThat(dashboard.byItem()).isEmpty();
  }

  @Test
  void normalizesPercentagesAndProtectsTheRemainderOfTheBranchPartition() {
    var dashboard =
        policy.publish(
            List.of(
                new IndicatorDashboardAggregate(Kind.FEEDBACK, null, 5, 0, 5, null),
                new IndicatorDashboardAggregate(Kind.FINALIZED, null, 5, 11, 15, null),
                score(Kind.AVERAGE, null, 13, "104.61538"),
                score(Kind.BRANCH, "A", 6, "90"),
                score(Kind.BRANCH, "B", 6, "120"),
                score(Kind.BRANCH, "Filial protegida", 1, "100"),
                score(Kind.ITEM, "Item de amostra suficiente", 5, "80")));
    assertThat(dashboard.metrics().averagePercent()).isEqualByComparingTo("87.2");
    assertThat(dashboard.metrics().finalizedPercent()).isEqualByComparingTo("73.3");
    assertThat(dashboard.metrics().feedbackPercent()).isEqualByComparingTo("0.0");
    assertThat(dashboard.byBranch())
        .containsExactly(new IndicatorDashboard.Point("B", new BigDecimal("100.0")));
    assertThat(dashboard.byItem())
        .containsExactly(
            new IndicatorDashboard.Point("Item de amostra suficiente", new BigDecimal("66.7")));
  }

  private static IndicatorDashboardAggregate score(
      Kind kind, String label, int people, String value) {
    return new IndicatorDashboardAggregate(kind, label, people, 0, 0, new BigDecimal(value));
  }
}

package br.com.avaliacao.desempenho.indicadores.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Kind;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Scope;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class IndicatorDashboardPolicyTests {

  private final IndicatorDashboardPolicy policy = new IndicatorDashboardPolicy();
  private static final IndicatorDashboardPeriods PERIODS =
      IndicatorDashboardPeriods.at(Instant.parse("2026-11-26T16:20:00Z"));

  @Test
  void suppressesGroupsUnderFiveCollaborators() {
    var dashboard =
        policy.publish(
            List.of(
                new IndicatorDashboardAggregate(Kind.COLLABORATORS, null, 4, 4, 0, null),
                score(Kind.AVERAGE, null, 4, "120"),
                score(Kind.ITEM, "Grupo protegido", 3, "120")),
            PERIODS);
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
                score(Kind.ITEM, "Item de amostra suficiente", 5, "80")),
            PERIODS);
    assertThat(dashboard.metrics().averagePercent()).isEqualByComparingTo("87.2");
    assertThat(dashboard.metrics().finalizedPercent()).isEqualByComparingTo("73.3");
    assertThat(dashboard.metrics().feedbackPercent()).isEqualByComparingTo("0.0");
    assertThat(dashboard.byBranch())
        .containsExactly(new IndicatorDashboard.Point("B", new BigDecimal("100.0")));
    assertThat(dashboard.byItem())
        .containsExactly(
            new IndicatorDashboard.Point("Item de amostra suficiente", new BigDecimal("66.7")));
  }

  @Test
  void comparesMonthlyCountsRelativelyAndRatesInPercentagePoints() {
    var changes =
        policy
            .publish(
                List.of(
                    row(Kind.COLLABORATORS, Scope.CURRENT_MONTH, null, 50, 50, 0, null),
                    row(Kind.COLLABORATORS, Scope.PREVIOUS_MONTH, null, 40, 40, 0, null),
                    row(Kind.ASSESSMENTS, Scope.CURRENT_MONTH, null, 8, 8, 0, null),
                    row(Kind.ASSESSMENTS, Scope.PREVIOUS_MONTH, null, 10, 10, 0, null),
                    row(Kind.MANAGERS, Scope.CURRENT_MONTH, null, 8, 3, 0, null),
                    row(Kind.MANAGERS, Scope.PREVIOUS_MONTH, null, 10, 3, 0, null),
                    row(Kind.MANAGER_SELF_ASSESSMENTS, Scope.CURRENT_MONTH, null, 5, 5, 0, null),
                    row(Kind.MANAGER_SELF_ASSESSMENTS, Scope.PREVIOUS_MONTH, null, 4, 4, 0, null),
                    row(Kind.AVERAGE, Scope.CURRENT_MONTH, null, 8, 0, 0, "111"),
                    row(Kind.AVERAGE, Scope.PREVIOUS_MONTH, null, 10, 0, 0, "108"),
                    row(Kind.FINALIZED, Scope.CURRENT_MONTH, null, 8, 4, 8, null),
                    row(Kind.FINALIZED, Scope.PREVIOUS_MONTH, null, 10, 7, 10, null),
                    row(Kind.FEEDBACK, Scope.CURRENT_MONTH, null, 5, 2, 5, null),
                    row(Kind.FEEDBACK, Scope.PREVIOUS_MONTH, null, 5, 0, 5, null)),
                PERIODS)
            .comparison()
            .changes();
    assertThat(changes.collaborators()).isEqualByComparingTo("25.0");
    assertThat(changes.assessments()).isEqualByComparingTo("-20.0");
    assertThat(changes.managers()).isEqualByComparingTo("0.0");
    assertThat(changes.managerSelfAssessments()).isNull();
    assertThat(changes.averagePercent()).isEqualByComparingTo("2.5");
    assertThat(changes.finalizedPercent()).isEqualByComparingTo("-20.0");
    assertThat(changes.feedbackPercent()).isEqualByComparingTo("40.0");
  }

  @Test
  void keepsAreaTableAndChartInSyncAndProtectsTheRemainderOfWeeklyScores() {
    var dashboard =
        policy.publish(
            List.of(
                row(Kind.COLLABORATORS, Scope.AREA, "A", 10, 10, 0, null),
                row(Kind.AVERAGE, Scope.AREA, "A", 5, 0, 0, "90"),
                row(Kind.ASSESSMENTS, Scope.AREA, "A", 6, 7, 0, null),
                row(Kind.ASSESSMENTS, Scope.AREA, "C", 4, 4, 0, null),
                row(Kind.AVERAGE, Scope.AREA, "B", 6, 0, 0, "120"),
                row(Kind.AVERAGE, Scope.AREA, "C", 1, 0, 0, "100"),
                row(Kind.AVERAGE, Scope.WEEK, "2026-11-09", 6, 0, 0, "90"),
                row(Kind.AVERAGE, Scope.WEEK, "2026-11-02", 7, 0, 0, "120"),
                row(Kind.AVERAGE, Scope.WEEK, "2026-11-16", 1, 0, 0, "100")),
            PERIODS);
    assertThat(dashboard.areaSummary())
        .containsExactly(
            new IndicatorDashboard.AreaSummary("A", 10L, null, null, null, null),
            new IndicatorDashboard.AreaSummary(
                "B", null, null, new BigDecimal("100.0"), null, null));
    assertThat(dashboard.byArea())
        .containsExactly(new IndicatorDashboard.Point("B", new BigDecimal("100.0")));
    assertThat(dashboard.evolution())
        .containsExactly(
            new IndicatorDashboard.WeekAverage(
                LocalDate.parse("2026-11-02"), new BigDecimal("100.0")));
  }

  @Test
  void comparesInBrasiliaAndUsesTheWholePreviousMonthWhenItHasFewerDays() {
    var periods = IndicatorDashboardPeriods.at(Instant.parse("2026-03-31T01:30:00Z"));
    assertThat(periods.current().firstDay()).isEqualTo("2026-03-01");
    assertThat(periods.current().lastDay()).isEqualTo("2026-03-30");
    assertThat(periods.previous().lastDay()).isEqualTo("2026-02-28");
    assertThat(periods.previous().cutoffUtc()).isEqualTo(LocalDateTime.parse("2026-03-01T03:00"));
    assertThat(PERIODS.previous().cutoffUtc()).isEqualTo(LocalDateTime.parse("2026-10-26T16:20"));
  }

  private static IndicatorDashboardAggregate score(
      Kind kind, String label, int people, String value) {
    return new IndicatorDashboardAggregate(kind, label, people, 0, 0, new BigDecimal(value));
  }

  private static IndicatorDashboardAggregate row(
      Kind kind, Scope scope, String label, int people, long total, long eligible, String value) {
    return new IndicatorDashboardAggregate(
        kind, label, people, total, eligible, value == null ? null : new BigDecimal(value), scope);
  }
}

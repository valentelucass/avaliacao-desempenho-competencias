package br.com.avaliacao.desempenho.indicadores.domain.model;

import static br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Kind.*;
import static br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Scope.*;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentScaleOption;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboard.AreaSummary;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboard.Comparison;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboard.ComparisonPeriod;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboard.Metrics;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboard.WeekAverage;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Kind;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Scope;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public final class IndicatorDashboardPolicy {

  private static final BigDecimal MAX_SCORE =
      BigDecimal.valueOf(AssessmentScaleOption.REFERENCE.points());

  private final GroupedIndicatorPrivacyPolicy privacy = new GroupedIndicatorPrivacyPolicy();
  private final IndicatorRoundingPolicy rounding = new IndicatorRoundingPolicy();

  public IndicatorDashboard publish(
      List<IndicatorDashboardAggregate> aggregates, IndicatorDashboardPeriods periods) {
    Map<Scope, List<IndicatorDashboardAggregate>> byScope = new EnumMap<>(Scope.class);
    for (var aggregate : aggregates) {
      byScope.computeIfAbsent(aggregate.scope(), unused -> new ArrayList<>()).add(aggregate);
    }
    var cycle = groupByKind(byScope.getOrDefault(CYCLE, List.of()));
    var areas = areaSummaries(byScope.getOrDefault(AREA, List.of()));
    var current = metrics(groupByKind(byScope.getOrDefault(CURRENT_MONTH, List.of())));
    var previous = metrics(groupByKind(byScope.getOrDefault(PREVIOUS_MONTH, List.of())));
    var weeks =
        publishable(byScope.getOrDefault(WEEK, List.of()), true, false).stream()
            .map(row -> new WeekAverage(LocalDate.parse(row.label()), score(row)))
            .sorted(Comparator.comparing(WeekAverage::weekStart))
            .toList();

    return new IndicatorDashboard(
        metrics(cycle),
        series(cycle.getOrDefault(BRANCH, List.of()), true),
        sortPoints(
            areas.stream()
                .filter(area -> area.averagePercent() != null)
                .map(area -> new IndicatorDashboard.Point(area.label(), area.averagePercent()))),
        series(cycle.getOrDefault(ITEM, List.of()), false),
        compare(periods, current, previous),
        areas,
        weeks);
  }

  private static Map<Kind, List<IndicatorDashboardAggregate>> groupByKind(
      List<IndicatorDashboardAggregate> aggregates) {
    Map<Kind, List<IndicatorDashboardAggregate>> byKind = new EnumMap<>(Kind.class);
    for (var aggregate : aggregates) {
      byKind.computeIfAbsent(aggregate.kind(), unused -> new ArrayList<>()).add(aggregate);
    }
    return byKind;
  }

  private Metrics metrics(Map<Kind, List<IndicatorDashboardAggregate>> rows) {
    return new Metrics(
        count(metric(rows, COLLABORATORS)),
        count(metric(rows, ASSESSMENTS)),
        count(metric(rows, MANAGERS)),
        count(metric(rows, MANAGER_SELF_ASSESSMENTS)),
        score(metric(rows, AVERAGE)),
        ratio(metric(rows, FINALIZED)),
        ratio(metric(rows, FEEDBACK)));
  }

  private static Comparison compare(
      IndicatorDashboardPeriods periods, Metrics current, Metrics previous) {
    return new Comparison(
        new ComparisonPeriod(periods.current().firstDay(), periods.current().lastDay()),
        new ComparisonPeriod(periods.previous().firstDay(), periods.previous().lastDay()),
        new IndicatorDashboard.Changes(
            relativeChange(current.collaborators(), previous.collaborators()),
            relativeChange(current.assessments(), previous.assessments()),
            relativeChange(current.managers(), previous.managers()),
            relativeChange(current.managerSelfAssessments(), previous.managerSelfAssessments()),
            percentagePoints(current.averagePercent(), previous.averagePercent()),
            percentagePoints(current.finalizedPercent(), previous.finalizedPercent()),
            percentagePoints(current.feedbackPercent(), previous.feedbackPercent())));
  }

  private static BigDecimal relativeChange(Long current, Long previous) {
    if (current == null || previous == null || previous == 0) return null;
    var baseline = BigDecimal.valueOf(previous);
    return percent(BigDecimal.valueOf(current).subtract(baseline), baseline);
  }

  private static BigDecimal percentagePoints(BigDecimal current, BigDecimal previous) {
    return current == null || previous == null ? null : current.subtract(previous);
  }

  private List<AreaSummary> areaSummaries(List<IndicatorDashboardAggregate> rows) {
    var byKind = groupByKind(rows);
    Map<String, Map<Kind, IndicatorDashboardAggregate>> byArea = new TreeMap<>();
    for (Kind kind : List.of(COLLABORATORS, ASSESSMENTS, AVERAGE, FINALIZED, FEEDBACK)) {
      boolean peopleCanAppearInMultipleAreas = kind != COLLABORATORS && kind != AVERAGE;
      for (var row :
          publishable(byKind.getOrDefault(kind, List.of()), true, peopleCanAppearInMultipleAreas)) {
        byArea.computeIfAbsent(row.label(), unused -> new EnumMap<>(Kind.class)).put(kind, row);
      }
    }
    return byArea.entrySet().stream()
        .map(
            entry -> {
              var metrics = entry.getValue();
              return new AreaSummary(
                  entry.getKey(),
                  count(metrics.get(COLLABORATORS)),
                  count(metrics.get(ASSESSMENTS)),
                  score(metrics.get(AVERAGE)),
                  ratio(metrics.get(FINALIZED)),
                  ratio(metrics.get(FEEDBACK)));
            })
        .toList();
  }

  private static Long count(IndicatorDashboardAggregate row) {
    return row == null ? null : row.total();
  }

  private IndicatorDashboardAggregate metric(
      Map<Kind, List<IndicatorDashboardAggregate>> byKind, Kind kind) {
    return byKind.getOrDefault(kind, List.of()).stream()
        .filter(row -> isAvailable(row.collaborators()))
        .findFirst()
        .orElse(null);
  }

  private BigDecimal score(IndicatorDashboardAggregate row) {
    if (row == null || row.averageScore() == null) {
      return null;
    }
    return percent(rounding.roundAverageScore(row.averageScore()), MAX_SCORE);
  }

  private static BigDecimal ratio(IndicatorDashboardAggregate row) {
    return row == null || row.eligible() == 0
        ? null
        : percent(BigDecimal.valueOf(row.total()), BigDecimal.valueOf(row.eligible()));
  }

  private static BigDecimal percent(BigDecimal numerator, BigDecimal denominator) {
    return numerator.movePointRight(2).divide(denominator, 1, RoundingMode.HALF_UP);
  }

  private List<IndicatorDashboard.Point> series(
      List<IndicatorDashboardAggregate> rows, boolean partitionsOverallAverage) {
    return sortPoints(
        publishable(rows, partitionsOverallAverage, false).stream()
            .map(row -> new IndicatorDashboard.Point(row.label(), score(row))));
  }

  private static List<IndicatorDashboard.Point> sortPoints(
      java.util.stream.Stream<IndicatorDashboard.Point> points) {
    return points
        .sorted(
            Comparator.comparing(IndicatorDashboard.Point::averagePercent)
                .reversed()
                .thenComparing(IndicatorDashboard.Point::label))
        .toList();
  }

  private List<IndicatorDashboardAggregate> publishable(
      List<IndicatorDashboardAggregate> rows, boolean partition, boolean overlappingPeople) {
    List<IndicatorDashboardAggregate> available = new ArrayList<>();
    int suppressedSamples = 0;
    for (var row : rows) {
      if (isAvailable(row.collaborators())) {
        available.add(row);
      } else {
        suppressedSamples += row.collaborators();
      }
    }

    // Uma pessoa pode contribuir com tipos de avaliação diferentes em áreas distintas.
    // Nesses casos, somar amostras suprimidas não garante cinco pessoas diferentes.
    if (partition
        && suppressedSamples > 0
        && (overlappingPeople || !isAvailable(suppressedSamples))) {
      available.stream()
          .min(
              Comparator.comparingInt(IndicatorDashboardAggregate::collaborators)
                  .thenComparing(IndicatorDashboardAggregate::label))
          .ifPresent(available::remove);
    }

    return available;
  }

  private boolean isAvailable(int collaborators) {
    return privacy.availabilityFor(collaborators) == GroupedIndicatorAvailability.AVAILABLE;
  }
}

package br.com.avaliacao.desempenho.indicadores.domain.model;

import static br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Kind.*;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentScaleOption;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Kind;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public final class IndicatorDashboardPolicy {

  private static final BigDecimal MAX_SCORE =
      BigDecimal.valueOf(AssessmentScaleOption.REFERENCE.points());

  private final GroupedIndicatorPrivacyPolicy privacy = new GroupedIndicatorPrivacyPolicy();
  private final IndicatorRoundingPolicy rounding = new IndicatorRoundingPolicy();

  public IndicatorDashboard publish(List<IndicatorDashboardAggregate> aggregates) {
    Map<Kind, List<IndicatorDashboardAggregate>> byKind = new EnumMap<>(Kind.class);
    for (IndicatorDashboardAggregate aggregate : aggregates) {
      byKind.computeIfAbsent(aggregate.kind(), unused -> new ArrayList<>()).add(aggregate);
    }
    return new IndicatorDashboard(
        new IndicatorDashboard.Metrics(
            count(byKind, COLLABORATORS),
            count(byKind, ASSESSMENTS),
            count(byKind, MANAGERS),
            count(byKind, MANAGER_SELF_ASSESSMENTS),
            score(metric(byKind, AVERAGE)),
            ratio(metric(byKind, FINALIZED)),
            ratio(metric(byKind, FEEDBACK))),
        series(byKind.getOrDefault(BRANCH, List.of()), true),
        series(byKind.getOrDefault(AREA, List.of()), true),
        series(byKind.getOrDefault(ITEM, List.of()), false));
  }

  private Long count(Map<Kind, List<IndicatorDashboardAggregate>> byKind, Kind kind) {
    IndicatorDashboardAggregate row = metric(byKind, kind);
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
    List<IndicatorDashboardAggregate> available = new ArrayList<>();
    int suppressed = 0;
    for (IndicatorDashboardAggregate row : rows) {
      if (isAvailable(row.collaborators())) {
        available.add(row);
      } else {
        suppressed += row.collaborators();
      }
    }

    // Filial e área compõem partições da média geral. Suprima outro grupo quando o
    // restante seria pequeno o bastante para inferir a nota por diferença.
    if (partitionsOverallAverage && suppressed > 0 && !isAvailable(suppressed)) {
      available.stream()
          .min(
              Comparator.comparingInt(IndicatorDashboardAggregate::collaborators)
                  .thenComparing(IndicatorDashboardAggregate::label))
          .ifPresent(available::remove);
    }

    return available.stream()
        .map(row -> new IndicatorDashboard.Point(row.label(), score(row)))
        .sorted(
            Comparator.comparing(IndicatorDashboard.Point::averagePercent)
                .reversed()
                .thenComparing(IndicatorDashboard.Point::label))
        .toList();
  }

  private boolean isAvailable(int collaborators) {
    return privacy.availabilityFor(collaborators) == GroupedIndicatorAvailability.AVAILABLE;
  }
}

package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record IndicatorDashboard(
    Metrics metrics,
    List<Point> byBranch,
    List<Point> byArea,
    List<Point> byItem,
    Comparison comparison,
    List<AreaSummary> areaSummary,
    List<WeekAverage> evolution) {

  public record Metrics(
      Long collaborators,
      Long assessments,
      Long managers,
      Long managerSelfAssessments,
      BigDecimal averagePercent,
      BigDecimal finalizedPercent,
      BigDecimal feedbackPercent) {

    public boolean hasData() {
      return collaborators != null
          || assessments != null
          || managers != null
          || managerSelfAssessments != null
          || averagePercent != null
          || finalizedPercent != null
          || feedbackPercent != null;
    }
  }

  public record Point(String label, BigDecimal averagePercent) {}

  public record Comparison(ComparisonPeriod current, ComparisonPeriod previous, Changes changes) {}

  public record ComparisonPeriod(LocalDate firstDay, LocalDate lastDay) {}

  public record Changes(
      BigDecimal collaborators,
      BigDecimal assessments,
      BigDecimal managers,
      BigDecimal managerSelfAssessments,
      BigDecimal averagePercent,
      BigDecimal finalizedPercent,
      BigDecimal feedbackPercent) {}

  public record AreaSummary(
      String label,
      Long collaborators,
      Long assessments,
      BigDecimal averagePercent,
      BigDecimal finalizedPercent,
      BigDecimal feedbackPercent) {}

  public record WeekAverage(LocalDate weekStart, BigDecimal averagePercent) {}

  public boolean hasData() {
    return metrics.hasData()
        || !byBranch.isEmpty()
        || !byArea.isEmpty()
        || !byItem.isEmpty()
        || !areaSummary.isEmpty()
        || !evolution.isEmpty();
  }
}

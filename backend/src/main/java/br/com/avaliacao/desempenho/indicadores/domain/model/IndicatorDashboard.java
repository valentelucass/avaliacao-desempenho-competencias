package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.math.BigDecimal;
import java.util.List;

public record IndicatorDashboard(
    Metrics metrics, List<Point> byBranch, List<Point> byArea, List<Point> byItem) {

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

  public boolean hasData() {
    return metrics.hasData() || !byBranch.isEmpty() || !byArea.isEmpty() || !byItem.isEmpty();
  }
}

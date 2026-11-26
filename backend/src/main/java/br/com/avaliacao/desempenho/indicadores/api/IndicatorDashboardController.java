package br.com.avaliacao.desempenho.indicadores.api;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorDashboardService;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboard;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.indicators", name = "enabled", havingValue = "true")
public class IndicatorDashboardController {

  private final IndicatorDashboardService service;

  public IndicatorDashboardController(IndicatorDashboardService service) {
    this.service = service;
  }

  @GetMapping("/api/v1/indicators/dashboard")
  @PreAuthorize(IndicatorController.READ_INDICATORS)
  public DashboardResponse get(
      @RequestParam UUID cycleId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest request) {
    IndicatorDashboard dashboard =
        service.get(IndicatorController.executionContext(principal, request), cycleId);
    var metrics = dashboard.metrics();
    return new DashboardResponse(
        new MetricsResponse(
            metrics.collaborators(),
            metrics.assessments(),
            metrics.managers(),
            metrics.managerSelfAssessments(),
            metrics.averagePercent(),
            metrics.finalizedPercent(),
            metrics.feedbackPercent()),
        map(dashboard.byBranch()),
        map(dashboard.byArea()),
        map(dashboard.byItem()));
  }

  private static List<PointResponse> map(List<IndicatorDashboard.Point> points) {
    return points.stream()
        .map(point -> new PointResponse(point.label(), point.averagePercent()))
        .toList();
  }

  public record DashboardResponse(
      MetricsResponse metrics,
      List<PointResponse> byBranch,
      List<PointResponse> byArea,
      List<PointResponse> byItem) {}

  public record MetricsResponse(
      Long collaborators,
      Long assessments,
      Long managers,
      Long managerSelfAssessments,
      BigDecimal averagePercent,
      BigDecimal finalizedPercent,
      BigDecimal feedbackPercent) {}

  public record PointResponse(String label, BigDecimal averagePercent) {}
}

package br.com.avaliacao.desempenho.indicadores.application;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorAggregate;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterPolicy;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorMetric;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResultPolicy;
import br.com.avaliacao.desempenho.indicadores.domain.port.IndicatorAggregationPort;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class IndicatorApplicationServiceTests {

  @Test
  void individualQueriesAreSuppressedWithoutCallingTheSqlPort() {
    AtomicInteger portCalls = new AtomicInteger();
    IndicatorApplicationService service = serviceWith(portCalls, new BigDecimal("100"), 5);

    IndicatorResult result =
        service.get(
            new IndicatorQuery(
                UUID.randomUUID(),
                IndicatorMetric.FINAL_SCORE_AVERAGE,
                null,
                null,
                null,
                UUID.randomUUID(),
                null));

    assertThat(result).isInstanceOf(IndicatorResult.InsufficientData.class);
    assertThat(portCalls).hasValue(0);
  }

  @Test
  void exportUsesTheSameSuppressionDecisionAsTheQuery() {
    AtomicInteger portCalls = new AtomicInteger();
    IndicatorApplicationService service = serviceWith(portCalls, new BigDecimal("100"), 4);

    IndicatorExportResult result =
        service.export(
            new IndicatorQuery(
                UUID.randomUUID(),
                IndicatorMetric.FINAL_SCORE_AVERAGE,
                null,
                null,
                null,
                null,
                null));

    assertThat(result).isInstanceOf(IndicatorExportResult.InsufficientData.class);
    assertThat(portCalls).hasValue(1);
  }

  @Test
  void rendersOnlyTheApprovedAggregateInTheCsvExport() {
    AtomicInteger portCalls = new AtomicInteger();
    IndicatorApplicationService service = serviceWith(portCalls, new BigDecimal("104.75"), 5);

    IndicatorExportResult result =
        service.export(
            new IndicatorQuery(
                UUID.randomUUID(),
                IndicatorMetric.FINAL_SCORE_AVERAGE,
                null,
                null,
                null,
                null,
                null));

    assertThat(result).isInstanceOf(IndicatorExportResult.AvailableCsv.class);
    IndicatorExportResult.AvailableCsv available = (IndicatorExportResult.AvailableCsv) result;
    assertThat(available.contentType()).isEqualTo("text/csv; charset=utf-8");
    assertThat(available.content()).isEqualTo("metric,value\r\nFINAL_SCORE_AVERAGE,104.8\r\n");
    assertThat(available.content()).doesNotContain("count", "collaborator", "cycle");
    assertThat(portCalls).hasValue(1);
  }

  private IndicatorApplicationService serviceWith(
      AtomicInteger portCalls, BigDecimal averageScore, int distinctCollaborators) {
    IndicatorAggregationPort port =
        criteria -> {
          portCalls.incrementAndGet();
          return new IndicatorAggregate.AverageScore(distinctCollaborators, averageScore);
        };
    return new IndicatorApplicationService(
        new IndicatorFilterPolicy(), new IndicatorResultPolicy(), port);
  }
}

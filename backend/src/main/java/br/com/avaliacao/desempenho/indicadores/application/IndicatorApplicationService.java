package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterPolicy;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQueryPlan;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResultPolicy;
import br.com.avaliacao.desempenho.indicadores.domain.port.IndicatorAggregationPort;
import java.util.Objects;

/**
 * Coordena validação, consulta agregada e supressão. Auditoria e autorização serão conectadas
 * quando a identidade persistida estiver disponível.
 */
public final class IndicatorApplicationService
    implements GetIndicatorsUseCase, ExportIndicatorsUseCase {

  private static final String CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
  private static final String CSV_FILE_NAME = "indicadores-2024.1.csv";

  private final IndicatorFilterPolicy filterPolicy;
  private final IndicatorResultPolicy resultPolicy;
  private final IndicatorAggregationPort aggregationPort;
  private final IndicatorCsvWriter csvWriter;

  public IndicatorApplicationService(
      IndicatorFilterPolicy filterPolicy,
      IndicatorResultPolicy resultPolicy,
      IndicatorAggregationPort aggregationPort) {
    this(filterPolicy, resultPolicy, aggregationPort, new IndicatorCsvWriter());
  }

  IndicatorApplicationService(
      IndicatorFilterPolicy filterPolicy,
      IndicatorResultPolicy resultPolicy,
      IndicatorAggregationPort aggregationPort,
      IndicatorCsvWriter csvWriter) {
    this.filterPolicy =
        Objects.requireNonNull(filterPolicy, "política de filtros não pode ser nula");
    this.resultPolicy =
        Objects.requireNonNull(resultPolicy, "política de resultado não pode ser nula");
    this.aggregationPort =
        Objects.requireNonNull(aggregationPort, "porta de agregação não pode ser nula");
    this.csvWriter = Objects.requireNonNull(csvWriter, "gerador CSV não pode ser nulo");
  }

  @Override
  public IndicatorResult get(IndicatorQuery query) {
    IndicatorQueryPlan plan = filterPolicy.planFor(query);
    if (plan.requiresInsufficientDataResponse()) {
      return new IndicatorResult.InsufficientData();
    }

    return resultPolicy.resultFor(
        plan.aggregateCriteria().metric(), aggregationPort.aggregate(plan.aggregateCriteria()));
  }

  @Override
  public IndicatorExportResult export(IndicatorQuery query) {
    IndicatorResult result = get(query);
    if (result instanceof IndicatorResult.InsufficientData) {
      return new IndicatorExportResult.InsufficientData();
    }

    IndicatorResult.Available available = (IndicatorResult.Available) result;
    return new IndicatorExportResult.AvailableCsv(
        CSV_CONTENT_TYPE, CSV_FILE_NAME, csvWriter.write(available));
  }
}

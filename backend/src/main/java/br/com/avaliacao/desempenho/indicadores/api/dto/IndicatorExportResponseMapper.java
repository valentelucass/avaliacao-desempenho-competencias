package br.com.avaliacao.desempenho.indicadores.api.dto;

import br.com.avaliacao.desempenho.indicadores.application.IndicatorExportResult;
import java.util.Objects;

/** Converte a saída da aplicação no contrato HTTP de exportação sem materializar dados extras. */
public final class IndicatorExportResponseMapper {

  private final IndicatorResponseMapper indicatorResponseMapper;

  public IndicatorExportResponseMapper(IndicatorResponseMapper indicatorResponseMapper) {
    this.indicatorResponseMapper =
        Objects.requireNonNull(indicatorResponseMapper, "conversor não pode ser nulo");
  }

  public IndicatorExportResponse toResponse(IndicatorExportResult result) {
    IndicatorExportResult exportResult =
        Objects.requireNonNull(result, "resultado não pode ser nulo");
    if (exportResult instanceof IndicatorExportResult.AvailableCsv available) {
      return new IndicatorExportResponse.AvailableCsv(
          available.contentType(), available.fileName(), available.content());
    }
    return new IndicatorExportResponse.InsufficientData(
        (IndicatorResponse.InsufficientData)
            indicatorResponseMapper.toResponse(
                new br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult
                    .InsufficientData()));
  }
}

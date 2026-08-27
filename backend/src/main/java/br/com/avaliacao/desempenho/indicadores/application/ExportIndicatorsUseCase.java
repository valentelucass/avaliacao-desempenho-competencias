package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;

/** Caso de uso correspondente a {@code POST /api/v1/indicators/exports}. */
public interface ExportIndicatorsUseCase {

  IndicatorExportResult export(IndicatorQuery query);
}

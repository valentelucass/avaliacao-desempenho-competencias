package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;

/** Caso de uso correspondente a {@code GET /api/v1/indicators}. */
public interface GetIndicatorsUseCase {

  IndicatorResult get(IndicatorQuery query);
}

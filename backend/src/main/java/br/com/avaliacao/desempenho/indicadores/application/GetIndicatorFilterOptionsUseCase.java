package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOptions;
import java.util.UUID;

/** Caso de uso correspondente a {@code GET /api/v1/indicators/options}. */
public interface GetIndicatorFilterOptionsUseCase {

  IndicatorFilterOptions get(IndicatorExecutionContext context, UUID cycleId);
}

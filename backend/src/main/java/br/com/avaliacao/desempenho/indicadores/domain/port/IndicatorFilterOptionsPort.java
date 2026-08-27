package br.com.avaliacao.desempenho.indicadores.domain.port;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOptions;
import java.util.UUID;

/** Consulta as opções de filtro sem retornar resultados agregados ou população. */
public interface IndicatorFilterOptionsPort {

  IndicatorFilterOptions findApplicableFor(UUID cycleId);
}

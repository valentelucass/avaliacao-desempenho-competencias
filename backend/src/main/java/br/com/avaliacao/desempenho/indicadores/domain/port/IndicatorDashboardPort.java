package br.com.avaliacao.desempenho.indicadores.domain.port;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardPeriods;
import java.util.List;
import java.util.UUID;

public interface IndicatorDashboardPort {
  List<IndicatorDashboardAggregate> aggregate(UUID cycleId, IndicatorDashboardPeriods periods);
}

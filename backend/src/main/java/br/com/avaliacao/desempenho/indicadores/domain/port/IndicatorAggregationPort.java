package br.com.avaliacao.desempenho.indicadores.domain.port;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorAggregate;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorAggregateCriteria;

/**
 * Porta para a consulta agregada no SQL Server. A implementação deve considerar somente avaliações
 * de gestor publicadas e contar colaboradores distintos depois de todos os filtros permitidos.
 */
public interface IndicatorAggregationPort {

  IndicatorAggregate aggregate(IndicatorAggregateCriteria criteria);
}

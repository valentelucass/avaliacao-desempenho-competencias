package br.com.avaliacao.desempenho.indicadores.domain.model;

/** Indica que um filtro tentaria combinar populações ou métricas não permitidas. */
public final class IndicatorFilterViolation extends RuntimeException {

  public IndicatorFilterViolation(String message) {
    super(message);
  }
}

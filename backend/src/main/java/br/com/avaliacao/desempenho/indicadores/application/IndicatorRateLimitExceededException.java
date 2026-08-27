package br.com.avaliacao.desempenho.indicadores.application;

/** A consulta de indicadores excedeu o limite local de proteção contra inferência por diferença. */
public final class IndicatorRateLimitExceededException extends RuntimeException {

  public IndicatorRateLimitExceededException() {
    super("Indicator request rate limit exceeded.");
  }
}

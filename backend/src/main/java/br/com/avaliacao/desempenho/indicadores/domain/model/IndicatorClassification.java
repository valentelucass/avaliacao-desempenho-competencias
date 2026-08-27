package br.com.avaliacao.desempenho.indicadores.domain.model;

/** Faixas que podem compor a distribuição agregada, sem revelar avaliações individuais. */
public enum IndicatorClassification {
  BELOW_EXPECTATIONS,
  IN_DEVELOPMENT,
  WITHIN_EXPECTATIONS,
  EXCEEDS_EXPECTATIONS,
  REFERENCE
}

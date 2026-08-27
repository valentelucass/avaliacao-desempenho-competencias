package br.com.avaliacao.desempenho.avaliacoes.domain.model;

/** Escala de cinco respostas da regra de negócio 2024.1. */
public enum AssessmentScaleOption {
  BELOW_EXPECTATIONS(80),
  IN_DEVELOPMENT(90),
  WITHIN_EXPECTATIONS(100),
  EXCEEDS_EXPECTATIONS(110),
  REFERENCE(120);

  private final int points;

  AssessmentScaleOption(int points) {
    this.points = points;
  }

  public int points() {
    return points;
  }
}

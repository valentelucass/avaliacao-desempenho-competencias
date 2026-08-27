package br.com.avaliacao.desempenho.avaliacoes.domain.model;

/** Faixas de desempenho da matriz GERAL, adotada pela regra de negócio 2024.1. */
public enum PerformanceClassification {
  REFERENCE("É referência", "Reter e engajar"),
  EXCEEDS_EXPECTATIONS("Supera as expectativas", "Manter e impulsionar"),
  WITHIN_EXPECTATIONS("Dentro das expectativas", "Acelerar e desenvolver"),
  IN_DEVELOPMENT("Em desenvolvimento", "Entender os porquês"),
  BELOW_EXPECTATIONS("Abaixo do esperado", "Desenvolver");

  private final String label;
  private final String guidance;

  PerformanceClassification(String label, String guidance) {
    this.label = label;
    this.guidance = guidance;
  }

  public String label() {
    return label;
  }

  public String guidance() {
    return guidance;
  }
}

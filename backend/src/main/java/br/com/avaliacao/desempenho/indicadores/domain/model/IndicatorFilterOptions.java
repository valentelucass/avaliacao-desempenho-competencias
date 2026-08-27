package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.util.List;
import java.util.Objects;

/** Opções aplicáveis a um ciclo, sem contagens, notas ou identificadores de avaliados. */
public record IndicatorFilterOptions(
    List<IndicatorFilterOption> branches,
    List<IndicatorFilterOption> areas,
    List<IndicatorFilterOption> managers,
    List<IndicatorFilterOption> competencies) {

  public IndicatorFilterOptions {
    branches = immutable(branches, "filiais");
    areas = immutable(areas, "áreas");
    managers = immutable(managers, "gestores");
    competencies = immutable(competencies, "competências");
  }

  private static List<IndicatorFilterOption> immutable(
      List<IndicatorFilterOption> values, String fieldName) {
    return List.copyOf(Objects.requireNonNull(values, fieldName + " não podem ser nulas"));
  }
}

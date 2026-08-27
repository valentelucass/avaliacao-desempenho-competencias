package br.com.avaliacao.desempenho.indicadores.api.dto;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Resposta mínima de {@code GET /api/v1/indicators/options}, sem contagens ou resultados. */
public record IndicatorFilterOptionsResponse(
    List<Option> branches, List<Option> areas, List<Option> managers, List<Option> competencies) {

  public IndicatorFilterOptionsResponse {
    branches = immutable(branches, "filiais");
    areas = immutable(areas, "áreas");
    managers = immutable(managers, "gestores");
    competencies = immutable(competencies, "competências");
  }

  public record Option(UUID id, String label) {

    public Option {
      Objects.requireNonNull(id, "identificador não pode ser nulo");
      label = Objects.requireNonNull(label, "rótulo não pode ser nulo");
      if (label.isBlank()) {
        throw new IllegalArgumentException("rótulo não pode ser vazio");
      }
    }
  }

  private static List<Option> immutable(List<Option> values, String fieldName) {
    return List.copyOf(Objects.requireNonNull(values, fieldName + " não podem ser nulas"));
  }
}

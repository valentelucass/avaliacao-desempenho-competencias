package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.util.Objects;
import java.util.UUID;

/**
 * Aplica a regra v1: ciclo obrigatório, no máximo uma dimensão populacional e consulta individual
 * sempre suprimida antes de acessar a fonte agregada.
 */
public final class IndicatorFilterPolicy {

  public IndicatorQueryPlan planFor(IndicatorQuery query) {
    IndicatorQuery requested = Objects.requireNonNull(query, "consulta não pode ser nula");
    validateCompetencySelection(requested);

    int populationFilters = countPopulationFilters(requested);
    if (populationFilters > 1) {
      throw new IndicatorFilterViolation(
          "Filial, área e gestor não podem ser combinados na mesma consulta.");
    }

    IndicatorAggregateCriteria criteria =
        new IndicatorAggregateCriteria(
            requested.cycleId(),
            requested.metric(),
            populationDimensionFor(requested),
            populationIdFor(requested),
            requested.competencyId());

    return new IndicatorQueryPlan(criteria, requested.collaboratorId() != null);
  }

  private void validateCompetencySelection(IndicatorQuery query) {
    if (query.metric().requiresCompetency() && query.competencyId() == null) {
      throw new IndicatorFilterViolation("A métrica por competência exige competência.");
    }
    if (!query.metric().requiresCompetency() && query.competencyId() != null) {
      throw new IndicatorFilterViolation(
          "A competência só pode selecionar a métrica por competência.");
    }
  }

  private int countPopulationFilters(IndicatorQuery query) {
    int count = 0;
    if (query.branchId() != null) {
      count++;
    }
    if (query.areaId() != null) {
      count++;
    }
    if (query.managerUserId() != null) {
      count++;
    }
    return count;
  }

  private IndicatorPopulationDimension populationDimensionFor(IndicatorQuery query) {
    if (query.branchId() != null) {
      return IndicatorPopulationDimension.BRANCH;
    }
    if (query.areaId() != null) {
      return IndicatorPopulationDimension.AREA;
    }
    if (query.managerUserId() != null) {
      return IndicatorPopulationDimension.MANAGER;
    }
    return IndicatorPopulationDimension.OVERALL;
  }

  private UUID populationIdFor(IndicatorQuery query) {
    if (query.branchId() != null) {
      return query.branchId();
    }
    if (query.areaId() != null) {
      return query.areaId();
    }
    return query.managerUserId();
  }
}

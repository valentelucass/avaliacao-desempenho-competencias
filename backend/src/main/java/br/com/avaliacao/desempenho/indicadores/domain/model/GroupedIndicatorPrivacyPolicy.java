package br.com.avaliacao.desempenho.indicadores.domain.model;

/** Protege resultados agrupados contra identificação por grupos pequenos. */
public final class GroupedIndicatorPrivacyPolicy {

  public static final int MINIMUM_DISTINCT_COLLABORATORS = 5;

  public GroupedIndicatorAvailability availabilityFor(int distinctCollaborators) {
    if (distinctCollaborators < 0) {
      throw new IllegalArgumentException(
          "A quantidade de colaboradores distintos não pode ser negativa.");
    }

    return distinctCollaborators >= MINIMUM_DISTINCT_COLLABORATORS
        ? GroupedIndicatorAvailability.AVAILABLE
        : GroupedIndicatorAvailability.INSUFFICIENT_DATA;
  }
}

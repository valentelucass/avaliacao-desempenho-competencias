package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import java.util.Objects;
import java.util.Optional;

/**
 * Seleciona somente escopos de leitura explicitamente confirmados. A visibilidade por vínculo é
 * comprovada novamente no repositório SQL.
 */
public final class EvaluationCycleReadAuthorizationPolicy {

  public static final String CYCLES_MANAGE = "CICLOS.GERIR";
  public static final String INDICATORS_VIEW = "INDICADORES.VISUALIZAR";
  public static final String EVALUATE_LINKED = "AVALIACOES.AVALIAR_VINCULADOS";
  public static final String FILL_OWN_SELF_ASSESSMENT = "AUTOAVALIACOES.PREENCHER_PROPRIA";

  public Optional<EvaluationCycleReadScope> scopeFor(EvaluationCycleReadAccessContext actor) {
    EvaluationCycleReadAccessContext access =
        Objects.requireNonNull(actor, "ator não pode ser nulo");
    if (access.has(CYCLES_MANAGE) || access.has(INDICATORS_VIEW)) {
      return Optional.of(new EvaluationCycleReadScope(true, false, false));
    }

    boolean managedCollaborators = access.has(EVALUATE_LINKED);
    boolean ownCollaborator = access.has(FILL_OWN_SELF_ASSESSMENT);
    if (!managedCollaborators && !ownCollaborator) {
      return Optional.empty();
    }
    return Optional.of(new EvaluationCycleReadScope(false, managedCollaborators, ownCollaborator));
  }
}

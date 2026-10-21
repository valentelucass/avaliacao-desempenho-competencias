package br.com.avaliacao.desempenho.ciclosavaliacao.application;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Autoria e correlação de uma mutação administrativa de ciclo. */
public record EvaluationCycleCommandContext(
    UUID actorUserId, String requestId, Set<String> permissions) {

  public EvaluationCycleCommandContext(UUID actorUserId, String requestId) {
    this(actorUserId, requestId, Set.of());
  }

  public EvaluationCycleCommandContext {
    Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
    permissions = Set.copyOf(Objects.requireNonNull(permissions, "permissões não podem ser nulas"));
  }
}

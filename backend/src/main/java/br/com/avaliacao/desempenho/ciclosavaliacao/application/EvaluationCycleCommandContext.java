package br.com.avaliacao.desempenho.ciclosavaliacao.application;

import java.util.Objects;
import java.util.UUID;

/** Autoria e correlação de uma mutação administrativa de ciclo. */
public record EvaluationCycleCommandContext(UUID actorUserId, String requestId) {

  public EvaluationCycleCommandContext {
    Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
  }
}

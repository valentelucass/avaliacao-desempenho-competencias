package br.com.avaliacao.desempenho.questionarios.application;

import java.util.Objects;
import java.util.UUID;

/** Contexto mínimo de autoria e correlação para mutações administrativas. */
public record QuestionnaireCommandContext(UUID actorUserId, String requestId) {

  public QuestionnaireCommandContext {
    Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
  }
}

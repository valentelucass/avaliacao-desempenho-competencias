package br.com.avaliacao.desempenho.cadastros.application;

import java.util.Objects;
import java.util.UUID;

/** Identifica a mutação administrativa sem incluir dados pessoais no contexto de auditoria. */
public record MasterDataCommandContext(UUID actorUserId, String requestId) {

  public MasterDataCommandContext {
    Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
  }
}

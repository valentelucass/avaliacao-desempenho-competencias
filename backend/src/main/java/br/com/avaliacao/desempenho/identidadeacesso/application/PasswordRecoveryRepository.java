package br.com.avaliacao.desempenho.identidadeacesso.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Solicitações pendentes derivadas da trilha durável de recuperação. */
public interface PasswordRecoveryRepository {
  void request(String normalizedLogin, String requestId);

  List<PendingRequest> listPending(UUID actor, boolean supreme, long after, int limit);

  record PendingRequest(
      long sequence, UUID userId, String displayName, String login, Instant requestedAt) {}
}

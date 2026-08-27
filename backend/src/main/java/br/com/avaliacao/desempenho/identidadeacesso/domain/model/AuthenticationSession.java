package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Sessão persistida e revogável associada a um JWT de acesso curto. */
public record AuthenticationSession(
    UUID sessionId,
    UUID familyId,
    UUID userId,
    String accessTokenId,
    Instant issuedAt,
    Instant expiresAt) {

  public AuthenticationSession {
    Objects.requireNonNull(sessionId, "sessionId");
    Objects.requireNonNull(familyId, "familyId");
    Objects.requireNonNull(userId, "userId");
    Objects.requireNonNull(accessTokenId, "accessTokenId");
    Objects.requireNonNull(issuedAt, "issuedAt");
    Objects.requireNonNull(expiresAt, "expiresAt");
    if (!expiresAt.isAfter(issuedAt)) {
      throw new IllegalArgumentException("Session expiration must be after issuance.");
    }
  }
}

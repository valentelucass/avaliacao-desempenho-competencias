package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Credencial local carregada somente para autenticação; nunca é exposta pela API. */
public record LocalCredentialAccount(
    UUID userId,
    String displayName,
    AccountStatus status,
    String passwordHash,
    boolean passwordChangeRequired,
    int failedAttempts,
    Instant blockedUntil) {

  public LocalCredentialAccount {
    Objects.requireNonNull(userId, "userId");
    Objects.requireNonNull(displayName, "displayName");
    Objects.requireNonNull(status, "status");
    Objects.requireNonNull(passwordHash, "passwordHash");
    if (failedAttempts < 0) {
      throw new IllegalArgumentException("failedAttempts cannot be negative");
    }
  }

  public boolean isTemporarilyBlockedAt(Instant instant) {
    return blockedUntil != null && blockedUntil.isAfter(instant);
  }
}

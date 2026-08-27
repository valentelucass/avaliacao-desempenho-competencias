package br.com.avaliacao.desempenho.identidadeacesso.application;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuditEvent;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthenticationSession;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.LocalCredentialAccount;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência para identidade, sessão, autorização e auditoria. */
public interface IdentityAccessRepository {

  Optional<LocalCredentialAccount> findLocalCredentialByNormalizedLogin(String normalizedLogin);

  Optional<LocalCredentialAccount> findLocalCredentialByUserId(UUID userId);

  Optional<AuthorizedUser> findAuthorizedUserForActiveSession(
      UUID sessionId, UUID userId, String accessTokenId, Instant now);

  void registerFailedLogin(
      UUID userId, Instant now, int failureThreshold, Instant blockUntilWhenThresholdReached);

  void registerSuccessfulLogin(UUID userId);

  void createSession(
      AuthenticationSession session, String refreshTokenHash, Instant refreshTokenExpiresAt);

  Optional<RefreshSession> rotateRefreshToken(
      String refreshTokenHash,
      String replacementRefreshTokenHash,
      String replacementAccessTokenId,
      Instant accessTokenExpiresAt,
      Instant replacementRefreshTokenExpiresAt,
      Instant now);

  void revokeSession(UUID sessionId, String reason);

  void revokeAllUserSessions(UUID userId, String reason);

  void changePassword(UUID userId, String passwordHash, String algorithm, String parameters);

  void writeAudit(AuditEvent event);

  record RefreshSession(
      AuthenticationSession session, String displayName, boolean passwordChangeRequired) {}
}

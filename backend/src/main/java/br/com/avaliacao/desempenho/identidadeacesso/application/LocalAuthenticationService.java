package br.com.avaliacao.desempenho.identidadeacesso.application;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuditEvent;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthenticationSession;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.LocalCredentialAccount;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.LoginNormalizer;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AccessTokenService;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticationSecurityProperties;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Caso de uso de autenticação local com sessão rotativa, revogável e auditável. */
@Service
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(
    prefix = "app.security.authentication",
    name = "enabled",
    havingValue = "true")
public class LocalAuthenticationService {

  private final IdentityAccessRepository repository;
  private final PasswordEncoder credentialVerifier;
  private final AccessTokenService jwtService;
  private final AuthenticationSecurityProperties properties;
  private final TransactionTemplate transactionTemplate;
  private final Clock clock;
  private final OpaqueTokenService opaqueTokenService = new OpaqueTokenService();
  private final String timingEqualizerHash;

  public LocalAuthenticationService(
      IdentityAccessRepository repository,
      PasswordEncoder encoder,
      AccessTokenService jwtService,
      AuthenticationSecurityProperties properties,
      TransactionTemplate transactionTemplate,
      Clock clock) {
    this.repository = repository;
    this.credentialVerifier = encoder;
    this.jwtService = jwtService;
    this.properties = properties;
    this.transactionTemplate = transactionTemplate;
    this.clock = clock;
    this.timingEqualizerHash = encoder.encode("not-a-real-credential");
  }

  public SessionCredentials authenticate(
      String suppliedLogin, String suppliedPassword, String requestId) {
    Instant now = clock.instant();
    String normalizedLogin = LoginNormalizer.normalize(suppliedLogin);
    LocalCredentialAccount account =
        repository.findLocalCredentialByNormalizedLogin(normalizedLogin).orElse(null);

    if (account == null) {
      credentialVerifier.matches(suppliedPassword, timingEqualizerHash);
      repository.writeAudit(loginAudit(null, AuditEvent.AuditResult.FAILURE, requestId));
      throw new AuthenticationFailureException();
    }

    if (!account.status().canAuthenticate() || account.isTemporarilyBlockedAt(now)) {
      credentialVerifier.matches(suppliedPassword, account.passwordHash());
      repository.writeAudit(
          loginAudit(account.userId(), AuditEvent.AuditResult.FAILURE, requestId));
      throw new AuthenticationFailureException();
    }

    if (!credentialVerifier.matches(suppliedPassword, account.passwordHash())) {
      transactionTemplate.executeWithoutResult(
          status -> {
            repository.registerFailedLogin(
                account.userId(),
                now,
                properties.failedLoginThreshold(),
                now.plus(properties.accountLockDuration()));
            repository.writeAudit(
                loginAudit(account.userId(), AuditEvent.AuditResult.FAILURE, requestId));
          });
      throw new AuthenticationFailureException();
    }

    return Objects.requireNonNull(
        transactionTemplate.execute(
            status -> {
              repository.registerSuccessfulLogin(account.userId());
              AuthenticationSession session = newSession(account.userId(), now);
              String refreshToken = opaqueTokenService.generate();
              repository.createSession(
                  session,
                  opaqueTokenService.sha256(refreshToken),
                  jwtService.refreshTokenExpiresAt(now));
              repository.writeAudit(
                  loginAudit(account.userId(), AuditEvent.AuditResult.SUCCESS, requestId));
              return credentialsFor(
                  session, account.displayName(), account.passwordChangeRequired(), refreshToken);
            }));
  }

  public SessionCredentials refresh(String rawRefreshToken, String requestId) {
    if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
      throw new AuthenticationFailureException();
    }
    Instant now = clock.instant();
    String replacementToken = opaqueTokenService.generate();
    String replacementAccessTokenId = UUID.randomUUID().toString();
    IdentityAccessRepository.RefreshSession refreshed =
        transactionTemplate.execute(
            status ->
                repository
                    .rotateRefreshToken(
                        opaqueTokenService.sha256(rawRefreshToken),
                        opaqueTokenService.sha256(replacementToken),
                        replacementAccessTokenId,
                        jwtService.accessTokenExpiresAt(now),
                        jwtService.refreshTokenExpiresAt(now),
                        now)
                    .orElse(null));
    if (refreshed == null) {
      throw new AuthenticationFailureException();
    }
    repository.writeAudit(
        new AuditEvent(
            refreshed.session().userId(),
            "AUTENTICACAO.RENOVAR",
            "SESSAO",
            refreshed.session().sessionId(),
            AuditEvent.AuditResult.SUCCESS,
            requestId,
            null));
    return credentialsFor(
        refreshed.session(),
        refreshed.displayName(),
        refreshed.passwordChangeRequired(),
        replacementToken);
  }

  public void logout(UUID sessionId, UUID actorUserId, String requestId) {
    transactionTemplate.executeWithoutResult(
        status -> {
          repository.revokeSession(sessionId, "LOGOUT");
          repository.writeAudit(
              new AuditEvent(
                  actorUserId,
                  "AUTENTICACAO.LOGOUT",
                  "SESSAO",
                  sessionId,
                  AuditEvent.AuditResult.SUCCESS,
                  requestId,
                  null));
        });
  }

  public void changePassword(
      UUID actorUserId, String currentPassword, String newPassword, String requestId) {
    if (!isAcceptableNewPassword(newPassword)) {
      throw new InvalidPasswordException();
    }
    LocalCredentialAccount account =
        repository
            .findLocalCredentialByUserId(actorUserId)
            .orElseThrow(AuthenticationFailureException::new);
    if (account.status() != AccountStatus.ACTIVE
        || !credentialVerifier.matches(currentPassword, account.passwordHash())) {
      repository.writeAudit(loginAudit(actorUserId, AuditEvent.AuditResult.FAILURE, requestId));
      throw new AuthenticationFailureException();
    }

    String newHash = credentialVerifier.encode(newPassword);
    transactionTemplate.executeWithoutResult(
        status -> {
          repository.changePassword(actorUserId, newHash, "BCRYPT", "strength=12");
          repository.revokeAllUserSessions(actorUserId, "SENHA_ALTERADA");
          repository.writeAudit(
              new AuditEvent(
                  actorUserId,
                  "AUTENTICACAO.ALTERAR_SENHA",
                  "USUARIO",
                  actorUserId,
                  AuditEvent.AuditResult.SUCCESS,
                  requestId,
                  null));
        });
  }

  private AuthenticationSession newSession(UUID userId, Instant now) {
    return new AuthenticationSession(
        UUID.randomUUID(),
        UUID.randomUUID(),
        userId,
        UUID.randomUUID().toString(),
        now,
        jwtService.accessTokenExpiresAt(now));
  }

  private SessionCredentials credentialsFor(
      AuthenticationSession session,
      String displayName,
      boolean passwordChangeRequired,
      String refreshToken) {
    AccessTokenService.IssuedAccessToken accessToken = jwtService.issue(session);
    return new SessionCredentials(
        session.userId(),
        displayName,
        passwordChangeRequired,
        session.sessionId(),
        accessToken.value(),
        accessToken.expiresAt(),
        refreshToken,
        jwtService.refreshTokenExpiresAt(clock.instant()));
  }

  private static AuditEvent loginAudit(
      UUID userId, AuditEvent.AuditResult result, String requestId) {
    return new AuditEvent(userId, "AUTENTICACAO.LOGIN", "SESSAO", null, result, requestId, null);
  }

  private static boolean isAcceptableNewPassword(String password) {
    return password != null && password.length() >= 12 && password.length() <= 200;
  }

  public record SessionCredentials(
      UUID userId,
      String displayName,
      boolean passwordChangeRequired,
      UUID sessionId,
      String accessToken,
      Instant accessTokenExpiresAt,
      String refreshToken,
      Instant refreshTokenExpiresAt) {}
}

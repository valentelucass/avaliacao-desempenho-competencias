package br.com.avaliacao.desempenho.identidadeacesso.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.*;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.*;

class LocalCredentialLifecycleTests {
  final UUID actor = UUID.randomUUID();
  final String current = UUID.randomUUID().toString();
  final String next = UUID.randomUUID().toString();
  final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
  final IdentityAccessRepository repository = mock(IdentityAccessRepository.class);
  final AccessTokenService jwt = mock(AccessTokenService.class);
  final TransactionTemplate transaction = mock(TransactionTemplate.class);
  final LocalAuthenticationService service =
      new LocalAuthenticationService(
          repository,
          encoder,
          jwt,
          new AuthenticationSecurityProperties(
              false, null, null, null, null, null, null, null, null, null),
          transaction,
          Clock.systemUTC());
  final LocalCredentialAccount account =
      new LocalCredentialAccount(
          actor, "Conta fictícia", AccountStatus.ACTIVE, encoder.encode(current), true, 0, null);

  @BeforeEach
  void setup() {
    when(repository.findLocalCredentialByUserId(actor)).thenReturn(Optional.of(account));
    doAnswer(
            call -> {
              java.util.function.Consumer<TransactionStatus> action = call.getArgument(0);
              action.accept(mock(TransactionStatus.class));
              return null;
            })
        .when(transaction)
        .executeWithoutResult(any());
    when(transaction.execute(any()))
        .thenAnswer(
            call ->
                ((TransactionCallback<?>) call.getArgument(0))
                    .doInTransaction(mock(TransactionStatus.class)));
  }

  @Test
  void personalChangeRejectsReuseAndConcurrentResetWithoutRevokingOrAuditingSuccess() {
    assertThatThrownBy(() -> service.changePassword(actor, current, current, "fixture"))
        .isInstanceOf(InvalidPasswordException.class);
    when(repository.changePassword(eq(actor), eq(account.passwordHash()), any(), any(), any()))
        .thenReturn(false);
    assertThatThrownBy(() -> service.changePassword(actor, current, next, "fixture"))
        .isInstanceOf(AuthenticationFailureException.class);
    verify(repository, never()).revokeAllUserSessions(any(), any());
    verify(repository, never()).writeAudit(any());
  }

  @Test
  void personalChangeStoresOnlyHashRevokesAllSessionsAndAuditsWithoutContent() {
    when(repository.changePassword(eq(actor), eq(account.passwordHash()), any(), any(), any()))
        .thenReturn(true);
    service.changePassword(actor, current, next, "fixture");
    verify(repository)
        .changePassword(
            eq(actor),
            eq(account.passwordHash()),
            argThat(hash -> encoder.matches(next, hash)),
            eq("BCRYPT"),
            eq("strength=12"));
    verify(repository).revokeAllUserSessions(actor, "SENHA_ALTERADA");
    verify(repository)
        .writeAudit(
            argThat(
                event ->
                    event.action().equals("AUTENTICACAO.ALTERAR_SENHA")
                        && event.reducedDetail() == null));
  }

  @Test
  void personalChangeLimitsRepeatedAttemptsBeforeCredentialLookupAndKeepsActorsIndependent() {
    var fixedClock = Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC);
    var limited =
        new LocalAuthenticationService(
            repository,
            encoder,
            jwt,
            new AuthenticationSecurityProperties(
                false, null, null, null, null, null, null, null, null, null),
            transaction,
            fixedClock);
    for (int attempt = 0; attempt < 10; attempt++) {
      assertThatThrownBy(() -> limited.changePassword(actor, current, "", "fixture"))
          .isInstanceOf(InvalidPasswordException.class);
    }
    assertThatThrownBy(() -> limited.changePassword(actor, current, next, "fixture"))
        .isInstanceOf(RateLimitedException.class);
    assertThatThrownBy(() -> limited.changePassword(UUID.randomUUID(), current, "", "fixture"))
        .isInstanceOf(InvalidPasswordException.class);
    verifyNoInteractions(repository, jwt, transaction);
  }

  @Test
  void temporarilyBlockedAccountCannotChangePassword() {
    when(repository.findLocalCredentialByUserId(actor))
        .thenReturn(
            Optional.of(
                new LocalCredentialAccount(
                    actor,
                    "Conta fictícia",
                    AccountStatus.ACTIVE,
                    account.passwordHash(),
                    false,
                    0,
                    Instant.now().plusSeconds(300))));
    assertThatThrownBy(() -> service.changePassword(actor, current, next, "fixture"))
        .isInstanceOf(AuthenticationFailureException.class);
    verify(repository, never()).changePassword(any(), any(), any(), any(), any());
  }

  @Test
  void oldCredentialCannotIssueSessionAfterConcurrentReset() {
    when(repository.findLocalCredentialByNormalizedLogin("fixture"))
        .thenReturn(Optional.of(account));
    when(repository.registerSuccessfulLogin(actor, account.passwordHash())).thenReturn(false);
    assertThatThrownBy(() -> service.authenticate("fixture", current, "fixture"))
        .isInstanceOf(AuthenticationFailureException.class);
    verify(repository, never()).createSession(any(), any(), any());
    verifyNoInteractions(jwt);
  }

  @Test
  void oversizedLoginIsUniformAuthenticationFailureAndCredentialObjectsAreRedacted() {
    when(repository.findLocalCredentialByNormalizedLogin("fixture"))
        .thenReturn(Optional.of(account));
    assertThatThrownBy(() -> service.authenticate("fixture", "a".repeat(73), "fixture"))
        .isInstanceOf(AuthenticationFailureException.class);
    assertThat(account.toString()).isEqualTo("LocalCredentialAccount[redacted]");
    var issued =
        new AccessTokenService.IssuedAccessToken(UUID.randomUUID().toString(), Instant.now());
    assertThat(issued.toString()).isEqualTo("IssuedAccessToken[redacted]");
    var credentials =
        new LocalAuthenticationService.SessionCredentials(
            actor,
            "Conta fictícia",
            true,
            UUID.randomUUID(),
            UUID.randomUUID().toString(),
            Instant.now(),
            UUID.randomUUID().toString(),
            Instant.now());
    assertThat(credentials.toString()).isEqualTo("SessionCredentials[redacted]");
  }

  @Test
  void refreshAuditFailureOccursBeforeTransactionCompletesAndNoCredentialIsIssued() {
    var session =
        new AuthenticationSession(
            UUID.randomUUID(),
            UUID.randomUUID(),
            actor,
            UUID.randomUUID().toString(),
            Instant.now(),
            Instant.now().plusSeconds(60));
    when(repository.rotateRefreshToken(any(), any(), any(), any(), any(), any()))
        .thenReturn(
            Optional.of(
                new IdentityAccessRepository.RefreshSession(session, "Conta fictícia", false)));
    var active = new java.util.concurrent.atomic.AtomicBoolean();
    doAnswer(
            call -> {
              active.set(true);
              try {
                return ((TransactionCallback<?>) call.getArgument(0))
                    .doInTransaction(mock(TransactionStatus.class));
              } finally {
                active.set(false);
              }
            })
        .when(transaction)
        .execute(any());
    doAnswer(
            call -> {
              assertThat(active.get()).isTrue();
              throw new IllegalStateException("Falha fictícia de auditoria");
            })
        .when(repository)
        .writeAudit(any());
    assertThatThrownBy(() -> service.refresh(UUID.randomUUID().toString(), "fixture"))
        .isInstanceOf(IllegalStateException.class);
    verify(jwt, never()).issue(any());
    assertThat(active.get()).isFalse();
  }
}

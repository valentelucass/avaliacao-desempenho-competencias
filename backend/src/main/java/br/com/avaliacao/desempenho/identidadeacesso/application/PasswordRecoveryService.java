package br.com.avaliacao.desempenho.identidadeacesso.application;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.LoginNormalizer;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@ConditionalOnSqlServerPersistence
public class PasswordRecoveryService {
  private final PasswordRecoveryRepository repository;
  private final UserAdministrationRepository users;
  private final UserAdministrationService administration;
  private final TransactionTemplate transaction;
  private final LoginRateLimiter addresses;
  private final LoginRateLimiter accounts;
  private final LoginRateLimiter global;
  private final OpaqueTokenService hasher = new OpaqueTokenService();
  private final SecureRandom random = new SecureRandom();

  public PasswordRecoveryService(
      PasswordRecoveryRepository repository,
      UserAdministrationRepository users,
      UserAdministrationService administration,
      TransactionTemplate transaction,
      Clock clock) {
    this.repository = repository;
    this.users = users;
    this.administration = administration;
    this.transaction = transaction;
    addresses = new LoginRateLimiter(clock, 10, Duration.ofHours(1));
    accounts = new LoginRateLimiter(clock, 3, Duration.ofHours(1));
    global = new LoginRateLimiter(clock, 1000, Duration.ofHours(1));
  }

  public void request(String login, String remoteAddress, String requestId) {
    String normalized = LoginNormalizer.normalize(login);
    global.checkAndRecord("recovery");
    addresses.checkAndRecord(hasher.sha256(remoteAddress));
    accounts.checkAndRecord(hasher.sha256(normalized));
    transaction.executeWithoutResult(ignored -> repository.request(normalized, requestId));
  }

  public List<PasswordRecoveryRepository.PendingRequest> list(
      UUID actor, Set<String> permissions, long after, int limit) {
    requireAdministrator(actor, permissions);
    if (after < 0 || limit < 1 || limit > 100) {
      throw new UserAdministrationException(
          UserAdministrationException.Reason.INVALID_INPUT, "Paginação inválida.");
    }
    return repository.listPending(after, limit + 1);
  }

  public GeneratedPassword generate(
      UUID userId, UUID actor, Set<String> permissions, String requestId) {
    requireAdministrator(actor, permissions);
    byte[] bytes = new byte[24];
    random.nextBytes(bytes);
    String temporary = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    UserAdministrationRepository.UserView user =
        administration.resetOrdinaryUserPassword(userId, temporary, actor, requestId);
    return new GeneratedPassword(user, temporary);
  }

  private void requireAdministrator(UUID actor, Set<String> permissions) {
    if (!permissions.containsAll(Set.of("USUARIOS.LER", "USUARIOS.ALTERAR"))
        || !users.isSupremeAdministrator(actor)) {
      throw new UserAdministrationException(
          UserAdministrationException.Reason.FORBIDDEN,
          "A recuperação exige administração autorizada de contas.");
    }
  }

  public record GeneratedPassword(
      UserAdministrationRepository.UserView user, String temporaryPassword) {
    @Override
    public String toString() {
      return "GeneratedPassword[redacted]";
    }
  }
}

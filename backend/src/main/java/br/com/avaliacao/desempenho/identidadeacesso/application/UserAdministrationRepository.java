package br.com.avaliacao.desempenho.identidadeacesso.application;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PasswordResetAuthorizationPolicy;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PermissionEffect;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Porta interna de administração; as projeções de usuário não contêm credenciais. */
public interface UserAdministrationRepository {

  List<UserView> listUsers();

  Optional<UserView> findUser(UUID userId);

  /** Revalida conta e concessões individuais; deve ser usado dentro de transação. */
  Optional<PasswordResetAuthorizationPolicy.Actor> lockPasswordResetActor(UUID actorUserId);

  Optional<UserView> lockPasswordResetTarget(UUID userId);

  /** Uso exclusivo do caso de uso, após bloquear e autorizar o alvo; nunca retornar pela API. */
  Optional<String> passwordHashForReset(UUID userId);

  List<UserView> listPasswordResetTargets(UUID actorUserId, boolean supreme);

  UserView createLocalUser(NewLocalUser user, UUID actorUserId);

  Optional<UserView> updateUser(UUID userId, UpdateUser update, UUID actorUserId);

  Optional<UserView> logicallyDeleteUser(UUID userId, UUID actorUserId);

  Optional<UserView> resetOrdinaryUserPassword(
      UUID userId,
      String passwordHash,
      String algorithm,
      String parameters,
      boolean actorIsSupremeAdministrator);

  boolean replacePasswordResetDelegation(
      UUID userId,
      PasswordResetDelegation delegation,
      UUID actorUserId,
      boolean actorIsSupremeAdministrator);

  boolean replaceAccess(UUID userId, AccessConfiguration access, UUID actorUserId);

  void revokeAllSessions(UUID userId, String reason);

  void writeAdministrativeAudit(
      UUID actorUserId, String action, String resourceType, UUID resourceId, String requestId);

  record NewLocalUser(
      UUID userId,
      String normalizedLogin,
      String displayName,
      String passwordHash,
      String passwordAlgorithm,
      String passwordParameters) {
    @Override
    public String toString() {
      return "NewLocalUser[redacted]";
    }
  }

  record UpdateUser(String displayName, AccountStatus status) {}

  record AccessConfiguration(Set<String> roleCodes, List<IndividualPermission> permissions) {}

  record IndividualPermission(String permissionCode, PermissionEffect effect) {}

  record PasswordResetDelegation(boolean canResetPassword, boolean canDelegatePasswordReset) {}

  record UserView(
      UUID id,
      String login,
      String displayName,
      AccountStatus status,
      boolean protectedFromNormalFlow,
      boolean logicallyDeleted,
      boolean passwordChangeRequired,
      Set<String> roles,
      List<IndividualPermission> individualPermissions,
      Instant updatedAt) {}
}

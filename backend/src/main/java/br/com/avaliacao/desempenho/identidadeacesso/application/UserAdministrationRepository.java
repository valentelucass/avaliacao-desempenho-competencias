package br.com.avaliacao.desempenho.identidadeacesso.application;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PermissionEffect;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Porta de administração de identidades locais; não expõe hash, token ou senha. */
public interface UserAdministrationRepository {

  List<UserView> listUsers();

  Optional<UserView> findUser(UUID userId);

  UserView createLocalUser(NewLocalUser user, UUID actorUserId);

  Optional<UserView> updateUser(UUID userId, UpdateUser update, UUID actorUserId);

  Optional<UserView> logicallyDeleteUser(UUID userId, UUID actorUserId);

  boolean isSupremeAdministrator(UUID userId);

  Optional<UserView> resetOrdinaryUserPassword(
      UUID userId, String passwordHash, String algorithm, String parameters);

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
      String passwordParameters) {}

  record UpdateUser(String displayName, AccountStatus status) {}

  record AccessConfiguration(Set<String> roleCodes, List<IndividualPermission> permissions) {}

  record IndividualPermission(String permissionCode, PermissionEffect effect) {}

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

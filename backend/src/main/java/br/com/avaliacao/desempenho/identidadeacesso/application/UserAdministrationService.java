package br.com.avaliacao.desempenho.identidadeacesso.application;

import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationException.Reason;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AdministrativeAccessSegregationPolicy;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.LoginNormalizer;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PasswordResetAuthorizationPolicy;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PermissionEffect;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PlatformRole;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Casos de uso administrativos com senha inicial forçada a trocar e revogação de sessão. */
@Service
@ConditionalOnSqlServerPersistence
public class UserAdministrationService {

  private static final Set<String> SUPPORTED_PROFILE_ROLE_CODES =
      Set.of(
          PlatformRole.ADMINISTRADOR_PLATAFORMA.name(),
          PlatformRole.GESTOR.name(),
          PlatformRole.GERENCIA_RH.name(),
          PlatformRole.DIRETORIA.name(),
          PlatformRole.COLABORADOR.name());

  private final UserAdministrationRepository repository;
  private final PasswordEncoder credentialEncoder;
  private final TransactionTemplate transactionTemplate;
  private final AdministrativeAccessSegregationPolicy accessSegregationPolicy =
      new AdministrativeAccessSegregationPolicy();
  private final PasswordResetAuthorizationPolicy passwordResetAuthorizationPolicy =
      new PasswordResetAuthorizationPolicy();

  public UserAdministrationService(
      UserAdministrationRepository repository,
      PasswordEncoder credentialEncoder,
      TransactionTemplate transactionTemplate) {
    this.repository = repository;
    this.credentialEncoder = credentialEncoder;
    this.transactionTemplate = transactionTemplate;
  }

  public List<UserAdministrationRepository.UserView> listUsers() {
    return repository.listUsers();
  }

  public UserAdministrationRepository.UserView getUser(UUID userId) {
    return repository
        .findUser(Objects.requireNonNull(userId, "userId"))
        .orElseThrow(
            () ->
                new UserAdministrationException(Reason.USER_NOT_FOUND, "Usuário não encontrado."));
  }

  public UserAdministrationRepository.UserView createUser(
      String login,
      String displayName,
      String initialPassword,
      Set<String> initialRoleCodes,
      UUID actorUserId,
      Set<String> actorRoleCodes,
      Set<String> actorPermissionCodes,
      String requestId) {
    String normalizedLogin = LoginNormalizer.normalize(login);
    String normalizedDisplayName = requiredText(displayName, "displayName", 200);
    requirePassword(initialPassword);
    Set<String> safeInitialRoles = normalizeProfileRoleCodes(initialRoleCodes);
    requireInitialRoleAssignmentAllowed(
        actorUserId, actorRoleCodes, actorPermissionCodes, safeInitialRoles);
    UUID userId = UUID.randomUUID();
    String encodedCredential = credentialEncoder.encode(initialPassword);
    UserAdministrationRepository.NewLocalUser user =
        new UserAdministrationRepository.NewLocalUser(
            userId,
            normalizedLogin,
            normalizedDisplayName,
            encodedCredential,
            "BCRYPT",
            "strength=12");
    try {
      return Objects.requireNonNull(
          transactionTemplate.execute(
              ignored -> {
                repository.createLocalUser(user, actorUserId);
                if (!safeInitialRoles.isEmpty()
                    && !repository.replaceAccess(
                        userId,
                        new UserAdministrationRepository.AccessConfiguration(
                            safeInitialRoles, List.of()),
                        actorUserId)) {
                  throw new UserAdministrationException(
                      Reason.INVALID_INPUT, "O perfil inicial informado não está disponível.");
                }
                repository.writeAdministrativeAudit(
                    actorUserId, "USUARIO.CRIAR", "USUARIO", userId, requestId);
                if (!safeInitialRoles.isEmpty()) {
                  repository.writeAdministrativeAudit(
                      actorUserId, "ACESSO.INICIAL_ATRIBUIDO", "USUARIO", userId, requestId);
                }
                return getUser(userId);
              }));
    } catch (org.springframework.dao.DuplicateKeyException exception) {
      throw new UserAdministrationException(
          Reason.CONFLICT, "O identificador de login já está em uso.");
    }
  }

  public UserAdministrationRepository.UserView logicallyDeleteUser(
      UUID userId, boolean deleted, UUID actorUserId, String requestId) {
    if (!deleted) {
      throw new UserAdministrationException(
          Reason.INVALID_INPUT, "A exclusão lógica exige confirmação explícita.");
    }
    UUID targetUserId = Objects.requireNonNull(userId, "userId");
    UUID actorId = Objects.requireNonNull(actorUserId, "actorUserId");
    if (actorId.equals(targetUserId)) {
      throw new UserAdministrationException(
          Reason.FORBIDDEN, "Uma conta não pode excluir a si mesma pelo fluxo normal.");
    }
    return Objects.requireNonNull(
        transactionTemplate.execute(
            ignored -> {
              UserAdministrationRepository.UserView deletedUser =
                  repository
                      .logicallyDeleteUser(targetUserId, actorId)
                      .orElseThrow(
                          () ->
                              new UserAdministrationException(
                                  Reason.USER_NOT_FOUND, "Usuário não encontrado."));
              repository.revokeAllSessions(targetUserId, "USUARIO_EXCLUIDO_LOGICAMENTE");
              repository.writeAdministrativeAudit(
                  actorId, "USUARIO.EXCLUIR_LOGICAMENTE", "USUARIO", targetUserId, requestId);
              return deletedUser;
            }));
  }

  /** A credencial nunca é retornada e as sessões anteriores são revogadas. */
  public UserAdministrationRepository.UserView resetOrdinaryUserPassword(
      UUID userId,
      String temporaryPassword,
      UUID actorUserId,
      Set<String> actorPermissionCodes,
      String requestId) {
    UUID targetUserId = Objects.requireNonNull(userId, "userId");
    UUID actorId = Objects.requireNonNull(actorUserId, "actorUserId");
    requirePassword(temporaryPassword);
    boolean actorIsSupremeAdministrator = repository.isSupremeAdministrator(actorId);
    PasswordResetAuthorizationPolicy.Actor actor =
        new PasswordResetAuthorizationPolicy.Actor(
            actorId,
            actorIsSupremeAdministrator,
            Set.copyOf(Objects.requireNonNull(actorPermissionCodes, "permissões do ator")));
    UserAdministrationRepository.UserView target = getUser(targetUserId);
    if (!passwordResetAuthorizationPolicy.mayResetPassword(actor, passwordResetTarget(target))) {
      throw new UserAdministrationException(
          Reason.FORBIDDEN,
          "A conta não está disponível para redefinição de senha por esta sessão.");
    }

    String passwordHash = credentialEncoder.encode(temporaryPassword);
    return Objects.requireNonNull(
        transactionTemplate.execute(
            ignored -> {
              UserAdministrationRepository.UserView resetUser =
                  repository
                      .resetOrdinaryUserPassword(
                          targetUserId,
                          passwordHash,
                          "BCRYPT",
                          "strength=12",
                          actorIsSupremeAdministrator)
                      .orElseThrow(
                          () ->
                              new UserAdministrationException(
                                  Reason.USER_NOT_FOUND,
                                  "Usuário não encontrado ou indisponível para recuperação."));
              repository.revokeAllSessions(
                  targetUserId,
                  actorIsSupremeAdministrator
                      ? "SENHA_REDEFINIDA_ADMINISTRADOR_SUPREMO"
                      : "SENHA_REDEFINIDA_POR_DELEGACAO");
              repository.writeAdministrativeAudit(
                  actorId, "USUARIO.SENHA_REDEFINIR", "USUARIO", targetUserId, requestId);
              return resetUser;
            }));
  }

  public UserAdministrationRepository.UserView replacePasswordResetDelegation(
      UUID userId,
      boolean canResetPassword,
      boolean canDelegatePasswordReset,
      UUID actorUserId,
      Set<String> actorPermissionCodes,
      String requestId) {
    UUID targetUserId = Objects.requireNonNull(userId, "userId");
    UUID actorId = Objects.requireNonNull(actorUserId, "actorUserId");
    PasswordResetAuthorizationPolicy.Delegation desired;
    try {
      desired =
          new PasswordResetAuthorizationPolicy.Delegation(
              canResetPassword, canDelegatePasswordReset);
    } catch (IllegalArgumentException exception) {
      throw new UserAdministrationException(Reason.INVALID_INPUT, exception.getMessage());
    }
    boolean actorIsSupremeAdministrator = repository.isSupremeAdministrator(actorId);
    PasswordResetAuthorizationPolicy.Actor actor =
        new PasswordResetAuthorizationPolicy.Actor(
            actorId,
            actorIsSupremeAdministrator,
            Set.copyOf(Objects.requireNonNull(actorPermissionCodes, "permissões do ator")));
    UserAdministrationRepository.UserView target = getUser(targetUserId);
    if (!passwordResetAuthorizationPolicy.mayReplaceDelegation(
        actor, passwordResetTarget(target), desired)) {
      throw new UserAdministrationException(
          Reason.FORBIDDEN, "A sessão não pode alterar a delegação de redefinição desta conta.");
    }
    return Objects.requireNonNull(
        transactionTemplate.execute(
            ignored -> {
              if (!repository.replacePasswordResetDelegation(
                  targetUserId,
                  new UserAdministrationRepository.PasswordResetDelegation(
                      desired.canResetPassword(), desired.canDelegatePasswordReset()),
                  actorId,
                  actorIsSupremeAdministrator)) {
                throw new UserAdministrationException(
                    Reason.USER_NOT_FOUND,
                    "Usuário não encontrado ou indisponível para esta delegação.");
              }
              repository.revokeAllSessions(targetUserId, "DELEGACAO_REDEFINICAO_SENHA_ALTERADA");
              repository.writeAdministrativeAudit(
                  actorId, "USUARIO.SENHA.DELEGACAO_ALTERAR", "USUARIO", targetUserId, requestId);
              return getUser(targetUserId);
            }));
  }

  public UserAdministrationRepository.UserView updateUser(
      UUID userId, String displayName, AccountStatus status, UUID actorUserId, String requestId) {
    Objects.requireNonNull(status, "status");
    UserAdministrationRepository.UpdateUser update =
        new UserAdministrationRepository.UpdateUser(
            requiredText(displayName, "displayName", 200), status);
    return Objects.requireNonNull(
        transactionTemplate.execute(
            ignored -> {
              UserAdministrationRepository.UserView updated =
                  repository
                      .updateUser(userId, update, actorUserId)
                      .orElseThrow(
                          () ->
                              new UserAdministrationException(
                                  Reason.USER_NOT_FOUND, "Usuário não encontrado."));
              if (status != AccountStatus.ACTIVE) {
                repository.revokeAllSessions(userId, "USUARIO_DESATIVADO");
              }
              repository.writeAdministrativeAudit(
                  actorUserId, "USUARIO.ALTERAR", "USUARIO", userId, requestId);
              return updated;
            }));
  }

  public UserAdministrationRepository.UserView replaceAccess(
      UUID userId,
      Set<String> roleCodes,
      List<UserAdministrationRepository.IndividualPermission> permissions,
      UUID actorUserId,
      Set<String> actorRoleCodes,
      Set<String> actorPermissionCodes,
      String requestId) {
    if (roleCodes == null || permissions == null) {
      throw new UserAdministrationException(
          Reason.INVALID_INPUT, "A configuração de acesso é obrigatória.");
    }
    Set<String> safeRoles = normalizeProfileRoleCodes(roleCodes);
    List<UserAdministrationRepository.IndividualPermission> safePermissions =
        permissions.stream()
            .map(
                permission -> {
                  if (permission == null) {
                    throw new UserAdministrationException(
                        Reason.INVALID_INPUT, "Permissão inválida.");
                  }
                  return new UserAdministrationRepository.IndividualPermission(
                      permissionCode(permission.permissionCode()),
                      Objects.requireNonNull(permission.effect(), "effect"));
                })
            .toList();
    if (safePermissions.stream()
            .map(UserAdministrationRepository.IndividualPermission::permissionCode)
            .distinct()
            .count()
        != safePermissions.size()) {
      throw new UserAdministrationException(
          Reason.INVALID_INPUT, "Não repita uma permissão individual.");
    }
    if (!safePermissions.isEmpty()) {
      throw new UserAdministrationException(
          Reason.INVALID_INPUT,
          "Os perfis Administrador e Usuário comum não aceitam exceções individuais.");
    }
    UUID targetUserId = Objects.requireNonNull(userId, "usuário alvo não pode ser nulo");
    UUID actorId = Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
    Set<String> safeActorRoles =
        Set.copyOf(Objects.requireNonNull(actorRoleCodes, "papéis do ator"));
    Set<String> safeActorPermissions =
        Set.copyOf(Objects.requireNonNull(actorPermissionCodes, "permissões do ator"));
    boolean mayReplace =
        accessSegregationPolicy.mayReplaceAccess(
            actorId,
            targetUserId,
            safeActorRoles,
            safeActorPermissions,
            safeRoles,
            safePermissions.stream()
                .map(
                    permission ->
                        new AdministrativeAccessSegregationPolicy.DesiredPermission(
                            permission.permissionCode(), permission.effect()))
                .toList());
    if (!mayReplace) {
      throw new UserAdministrationException(
          Reason.FORBIDDEN,
          "A alteração de acesso exige outro administrador autorizado e escopo de negócio apropriado.");
    }
    UserAdministrationRepository.AccessConfiguration access =
        new UserAdministrationRepository.AccessConfiguration(safeRoles, safePermissions);
    return Objects.requireNonNull(
        transactionTemplate.execute(
            ignored -> {
              if (!repository.replaceAccess(targetUserId, access, actorId)) {
                throw new UserAdministrationException(
                    Reason.USER_NOT_FOUND, "Usuário não encontrado ou acesso inválido.");
              }
              repository.revokeAllSessions(targetUserId, "ACESSO_ALTERADO");
              repository.writeAdministrativeAudit(
                  actorId, "ACESSO.ALTERAR", "USUARIO", targetUserId, requestId);
              return getUser(targetUserId);
            }));
  }

  private String requiredText(String value, String field, int maximumLength) {
    if (value == null || value.isBlank() || value.strip().length() > maximumLength) {
      throw new UserAdministrationException(
          Reason.INVALID_INPUT, "Campo administrativo inválido: " + field + '.');
    }
    return value.strip();
  }

  private PasswordResetAuthorizationPolicy.Target passwordResetTarget(
      UserAdministrationRepository.UserView user) {
    Set<String> individualAllowedPermissions =
        user.individualPermissions().stream()
            .filter(permission -> permission.effect() == PermissionEffect.ALLOW)
            .map(UserAdministrationRepository.IndividualPermission::permissionCode)
            .collect(java.util.stream.Collectors.toUnmodifiableSet());
    return new PasswordResetAuthorizationPolicy.Target(
        user.id(),
        user.status(),
        user.protectedFromNormalFlow(),
        user.logicallyDeleted(),
        user.roles(),
        individualAllowedPermissions);
  }

  private void requirePassword(String password) {
    if (!br.com.avaliacao.desempenho.identidadeacesso.domain.model.LocalPasswordPolicy.accepts(
        password)) {
      throw new UserAdministrationException(
          Reason.INVALID_INPUT, "A senha inicial não atende aos requisitos mínimos.");
    }
  }

  private String roleCode(String value) {
    return identifierCode(value, "papel");
  }

  private Set<String> normalizeProfileRoleCodes(Set<String> roleCodes) {
    if (roleCodes == null) {
      throw new UserAdministrationException(
          Reason.INVALID_INPUT, "O perfil inicial é obrigatório.");
    }
    Set<String> safeRoles =
        roleCodes.stream()
            .map(this::roleCode)
            .collect(java.util.stream.Collectors.toUnmodifiableSet());
    if (safeRoles.size() != 1 || !SUPPORTED_PROFILE_ROLE_CODES.containsAll(safeRoles)) {
      throw new UserAdministrationException(
          Reason.INVALID_INPUT,
          "Escolha exatamente um perfil administrativo, gestor, RH, diretoria ou colaborador.");
    }
    return safeRoles;
  }

  private void requireInitialRoleAssignmentAllowed(
      UUID actorUserId,
      Set<String> actorRoleCodes,
      Set<String> actorPermissionCodes,
      Set<String> initialRoleCodes) {
    if (initialRoleCodes.isEmpty()) {
      return;
    }
    Set<String> safeActorRoles =
        Set.copyOf(Objects.requireNonNull(actorRoleCodes, "papéis do ator"));
    Set<String> safeActorPermissions =
        Set.copyOf(Objects.requireNonNull(actorPermissionCodes, "permissões do ator"));
    boolean requiresTechnicalAdministration = initialRoleCodes.contains("ADMINISTRADOR_PLATAFORMA");
    boolean mayAssign =
        accessSegregationPolicy.mayReplaceAccess(
            Objects.requireNonNull(actorUserId, "ator não pode ser nulo"),
            UUID.randomUUID(),
            safeActorRoles,
            safeActorPermissions,
            initialRoleCodes,
            List.of());
    if (!mayAssign
        || (requiresTechnicalAdministration && !safeActorPermissions.contains("ACESSOS.GERIR"))) {
      throw new UserAdministrationException(
          Reason.FORBIDDEN, "O perfil inicial exige uma concessão de acesso autorizada.");
    }
  }

  private String permissionCode(String value) {
    return identifierCode(value, "permissão");
  }

  private String identifierCode(String value, String field) {
    if (value == null || !value.matches("[A-Z0-9_.]{1,150}")) {
      throw new UserAdministrationException(
          Reason.INVALID_INPUT, "Código de " + field + " inválido.");
    }
    return value;
  }
}

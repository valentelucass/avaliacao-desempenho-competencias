package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Regras puras para delegação individual e uso seguro da redefinição de senha. */
public final class PasswordResetAuthorizationPolicy {

  public static final String RESET_PASSWORD = "SENHAS.REDEFINIR";
  public static final String DELEGATE_PASSWORD_RESET = "SENHAS.DELEGAR_REDEFINICAO";
  private static final String TECHNICAL_ADMINISTRATOR = "ADMINISTRADOR_PLATAFORMA";

  public boolean mayListPendingRequests(Actor actor) {
    return Objects.requireNonNull(actor, "actor").isSupreme() || actor.has(RESET_PASSWORD);
  }

  public boolean mayResetPassword(Actor actor, Target target) {
    Actor safeActor = Objects.requireNonNull(actor, "actor");
    Target safeTarget = Objects.requireNonNull(target, "target");
    if (!safeTarget.isEligible() || safeActor.userId().equals(safeTarget.userId())) {
      return false;
    }
    return safeActor.isSupreme()
        || (safeActor.has(RESET_PASSWORD) && !safeTarget.isPrivilegedForDelegates());
  }

  public boolean mayReplaceDelegation(Actor actor, Target target, Delegation desired) {
    Actor safeActor = Objects.requireNonNull(actor, "actor");
    Target safeTarget = Objects.requireNonNull(target, "target");
    Delegation safeDesired = Objects.requireNonNull(desired, "desired");
    if (!safeTarget.isEligible() || safeActor.userId().equals(safeTarget.userId())) {
      return false;
    }
    if (safeActor.isSupreme()) {
      return true;
    }
    return safeActor.has(RESET_PASSWORD)
        && safeActor.has(DELEGATE_PASSWORD_RESET)
        && !safeTarget.isPrivilegedForDelegates()
        && !safeDesired.canDelegatePasswordReset();
  }

  public record Actor(UUID userId, boolean isSupreme, Set<String> permissions) {
    public Actor {
      Objects.requireNonNull(userId, "userId");
      permissions = Set.copyOf(Objects.requireNonNull(permissions, "permissions"));
    }

    boolean has(String permission) {
      return permissions.contains(permission);
    }
  }

  public record Target(
      UUID userId,
      AccountStatus status,
      boolean protectedFromNormalFlow,
      boolean logicallyDeleted,
      Set<String> roles,
      Set<String> individualAllowedPermissions) {
    public Target {
      Objects.requireNonNull(userId, "userId");
      Objects.requireNonNull(status, "status");
      roles = Set.copyOf(Objects.requireNonNull(roles, "roles"));
      individualAllowedPermissions =
          Set.copyOf(
              Objects.requireNonNull(individualAllowedPermissions, "individualAllowedPermissions"));
    }

    boolean isEligible() {
      return status == AccountStatus.ACTIVE && !protectedFromNormalFlow && !logicallyDeleted;
    }

    boolean isPrivilegedForDelegates() {
      return roles.contains(TECHNICAL_ADMINISTRATOR)
          || individualAllowedPermissions.contains(DELEGATE_PASSWORD_RESET);
    }
  }

  public record Delegation(boolean canResetPassword, boolean canDelegatePasswordReset) {
    public Delegation {
      if (canDelegatePasswordReset && !canResetPassword) {
        throw new IllegalArgumentException(
            "A delegação de redefinição exige a capacidade de redefinir senha.");
      }
    }
  }
}

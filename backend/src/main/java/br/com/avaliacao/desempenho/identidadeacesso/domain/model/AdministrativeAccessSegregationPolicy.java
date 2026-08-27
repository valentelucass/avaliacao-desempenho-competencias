package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.util.Collection;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Preserva a separação entre o perfil administrador integral e o usuário comum.
 *
 * <p>O perfil administrador pode configurar contas de terceiros. A conta ainda não pode alterar a
 * própria configuração, e toda alteração continua exigindo a permissão efetiva correspondente no
 * servidor.
 */
public final class AdministrativeAccessSegregationPolicy {

  private static final Set<String> TECHNICAL_ROLE_CODES = Set.of("ADMINISTRADOR_PLATAFORMA");
  private static final Set<String> TECHNICAL_PERMISSION_CODES =
      Set.of("USUARIOS.LER", "USUARIOS.CRIAR", "USUARIOS.ALTERAR", "ACESSOS.GERIR");
  private static final Set<String> BUSINESS_ACCESS_MANAGER_ROLE_CODES =
      Set.of("ADMINISTRADOR_PLATAFORMA", "GERENCIA_RH", "DIRETORIA");
  private static final String BUSINESS_ACCESS_MANAGER_PERMISSION = "ACESSOS.NEGOCIO.GERIR";

  public boolean mayReplaceAccess(
      UUID actor,
      UUID target,
      Set<String> actorRoleCodes,
      Set<String> actorPermissionCodes,
      Set<String> desiredRoleCodes,
      Collection<DesiredPermission> desiredPermissions) {
    Objects.requireNonNull(actor, "ator não pode ser nulo");
    Objects.requireNonNull(target, "alvo não pode ser nulo");
    Objects.requireNonNull(actorRoleCodes, "papéis do ator não podem ser nulos");
    Objects.requireNonNull(actorPermissionCodes, "permissões do ator não podem ser nulas");
    Objects.requireNonNull(desiredRoleCodes, "papéis desejados não podem ser nulos");
    Objects.requireNonNull(desiredPermissions, "permissões desejadas não podem ser nulas");

    if (actor.equals(target)) {
      return false;
    }
    if (!requestsBusinessAccess(desiredRoleCodes, desiredPermissions)) {
      return true;
    }
    return actorRoleCodes.stream().anyMatch(BUSINESS_ACCESS_MANAGER_ROLE_CODES::contains)
        && actorPermissionCodes.contains(BUSINESS_ACCESS_MANAGER_PERMISSION);
  }

  private static boolean requestsBusinessAccess(
      Set<String> desiredRoleCodes, Collection<DesiredPermission> desiredPermissions) {
    if (desiredRoleCodes.stream().anyMatch(role -> !TECHNICAL_ROLE_CODES.contains(role))) {
      return true;
    }
    // O papel técnico passou a representar o administrador integral e, portanto, a sua
    // atribuição também requer autoridade de negócio efetiva.
    if (desiredRoleCodes.contains("ADMINISTRADOR_PLATAFORMA")) {
      return true;
    }
    return desiredPermissions.stream()
        .anyMatch(
            permission ->
                permission.effect() == PermissionEffect.ALLOW
                    && !TECHNICAL_PERMISSION_CODES.contains(permission.code()));
  }

  public record DesiredPermission(String code, PermissionEffect effect) {
    public DesiredPermission {
      Objects.requireNonNull(code, "código não pode ser nulo");
      Objects.requireNonNull(effect, "efeito não pode ser nulo");
    }
  }
}

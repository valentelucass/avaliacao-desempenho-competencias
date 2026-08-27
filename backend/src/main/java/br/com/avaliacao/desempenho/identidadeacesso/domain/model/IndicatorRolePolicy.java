package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.util.Objects;
import java.util.Set;

/**
 * Separa o acesso a indicadores dos demais privilégios administrativos.
 *
 * <p>As permissões de indicadores só podem ser efetivas para Gerência de RH ou Diretoria. A
 * verificação também protege a concessão individual, para que ela não transforme um usuário comum
 * ou administrador técnico em consumidor de resultados agregados.
 */
public final class IndicatorRolePolicy {

  public boolean hasEligibleRole(Set<String> roleCodes) {
    Set<String> safeRoleCodes = Objects.requireNonNull(roleCodes, "papéis não podem ser nulos");
    return !safeRoleCodes.contains(PlatformRole.ADMINISTRADOR_PLATAFORMA.name())
        && (safeRoleCodes.contains(PlatformRole.GERENCIA_RH.name())
            || safeRoleCodes.contains(PlatformRole.DIRETORIA.name()));
  }

  public boolean mayReceiveIndividualPermission(
      Set<String> roleCodes, String permissionCode, PermissionEffect effect) {
    Objects.requireNonNull(roleCodes, "papéis não podem ser nulos");
    Objects.requireNonNull(permissionCode, "permissão não pode ser nula");
    Objects.requireNonNull(effect, "efeito não pode ser nulo");
    if (effect != PermissionEffect.ALLOW || !isIndicatorPermission(permissionCode)) {
      return true;
    }
    return hasEligibleRole(roleCodes);
  }

  private static boolean isIndicatorPermission(String permissionCode) {
    return PlatformPermission.INDICATORS_VIEW.code().equals(permissionCode)
        || PlatformPermission.DATA_EXPORT.code().equals(permissionCode);
  }
}

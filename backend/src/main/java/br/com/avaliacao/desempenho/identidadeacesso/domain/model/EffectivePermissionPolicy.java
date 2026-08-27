package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Resolve permissões de papéis e concessões individuais. Uma negação individual vence qualquer
 * permissão, que é a opção conservadora até a política administrativa ser revista formalmente.
 */
public final class EffectivePermissionPolicy {

  private EffectivePermissionPolicy() {}

  public static Set<String> resolve(
      Collection<String> rolePermissions, Map<String, PermissionEffect> individualGrants) {
    Set<String> effective = new LinkedHashSet<>(rolePermissions);
    individualGrants.forEach(
        (permission, effect) -> {
          if (effect == PermissionEffect.ALLOW) {
            effective.add(permission);
          } else {
            effective.remove(permission);
          }
        });
    return Set.copyOf(effective);
  }
}

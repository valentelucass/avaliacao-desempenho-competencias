package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Identidade autorizável revalidada no servidor em cada requisição autenticada. */
public record AuthorizedUser(
    UUID userId,
    String displayName,
    boolean passwordChangeRequired,
    boolean supremeAdministrator,
    Set<String> permissions,
    Set<String> roleCodes) {

  public AuthorizedUser {
    Objects.requireNonNull(userId, "userId");
    Objects.requireNonNull(displayName, "displayName");
    permissions = Set.copyOf(permissions);
    roleCodes = Set.copyOf(roleCodes);
  }

  public AuthorizedUser(
      UUID userId,
      String displayName,
      boolean passwordChangeRequired,
      Set<String> permissions,
      Set<String> roleCodes) {
    this(userId, displayName, passwordChangeRequired, false, permissions, roleCodes);
  }

  public AuthorizedUser(
      UUID userId, String displayName, boolean passwordChangeRequired, Set<String> permissions) {
    this(userId, displayName, passwordChangeRequired, false, permissions, Set.of());
  }
}

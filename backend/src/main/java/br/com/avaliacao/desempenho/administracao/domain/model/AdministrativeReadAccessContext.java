package br.com.avaliacao.desempenho.administracao.domain.model;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Fatos de autorização revalidados antes de cada leitura administrativa. */
public record AdministrativeReadAccessContext(UUID userId, Set<String> permissions) {

  public AdministrativeReadAccessContext {
    Objects.requireNonNull(userId, "usuário não pode ser nulo");
    permissions = Set.copyOf(Objects.requireNonNull(permissions, "permissões não podem ser nulas"));
  }

  public boolean has(String permission) {
    return permissions.contains(permission);
  }
}

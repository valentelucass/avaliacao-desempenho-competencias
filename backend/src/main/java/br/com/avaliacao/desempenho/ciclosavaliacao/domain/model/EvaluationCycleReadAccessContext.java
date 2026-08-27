package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Fatos de autorização revalidados no servidor para a leitura de ciclos e questionários. */
public record EvaluationCycleReadAccessContext(UUID userId, Set<String> permissions) {

  public EvaluationCycleReadAccessContext {
    Objects.requireNonNull(userId, "usuário não pode ser nulo");
    permissions = Set.copyOf(Objects.requireNonNull(permissions, "permissões não podem ser nulas"));
  }

  public boolean has(String permission) {
    return permissions.contains(permission);
  }
}

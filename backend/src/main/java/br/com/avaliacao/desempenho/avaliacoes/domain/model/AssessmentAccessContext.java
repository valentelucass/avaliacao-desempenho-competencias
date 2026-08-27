package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Fatos de autorização já revalidados no servidor para um caso de uso de avaliação. */
public record AssessmentAccessContext(UUID userId, Set<String> permissions) {

  public AssessmentAccessContext {
    Objects.requireNonNull(userId, "userId");
    permissions = Set.copyOf(permissions);
  }

  public boolean has(String permission) {
    return permissions.contains(permission);
  }
}

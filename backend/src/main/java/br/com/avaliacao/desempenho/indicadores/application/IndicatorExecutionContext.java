package br.com.avaliacao.desempenho.indicadores.application;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Contexto autenticado revalidado no servidor para autorização, limitação e auditoria. */
public record IndicatorExecutionContext(
    UUID actorUserId, Set<String> permissions, Set<String> roleCodes, String requestId) {

  public IndicatorExecutionContext {
    Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
    permissions = Set.copyOf(permissions);
    roleCodes = Set.copyOf(roleCodes);
    if (requestId != null && requestId.length() > 64) {
      throw new IllegalArgumentException("requestId não pode exceder 64 caracteres.");
    }
  }

  public IndicatorExecutionContext(UUID actorUserId, String requestId) {
    this(actorUserId, Set.of(), Set.of(), requestId);
  }

  public boolean hasPermission(String permissionCode) {
    return permissions.contains(permissionCode);
  }
}

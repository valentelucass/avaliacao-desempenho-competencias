package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.util.Objects;
import java.util.UUID;

/** Evento de auditoria com campos permitidos e sem conteúdo sensível. */
public record AuditEvent(
    UUID actorUserId,
    String action,
    String resourceType,
    UUID resourceId,
    AuditResult result,
    String requestId,
    String reducedDetail) {

  public AuditEvent {
    Objects.requireNonNull(action, "action");
    Objects.requireNonNull(resourceType, "resourceType");
    Objects.requireNonNull(result, "result");
    if (action.isBlank() || resourceType.isBlank()) {
      throw new IllegalArgumentException("Audit action and resource type are required.");
    }
    if (reducedDetail != null && reducedDetail.length() > 500) {
      throw new IllegalArgumentException("Reduced audit detail exceeds 500 characters.");
    }
  }

  public enum AuditResult {
    SUCCESS,
    DENIED,
    FAILURE
  }
}

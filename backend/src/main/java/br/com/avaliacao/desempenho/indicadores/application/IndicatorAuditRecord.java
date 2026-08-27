package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import java.util.Objects;
import java.util.UUID;

/** Registro mínimo de consulta, opções de filtro ou exportação para a trilha de auditoria. */
public record IndicatorAuditRecord(
    UUID actorUserId,
    Operation operation,
    Outcome outcome,
    UUID cycleId,
    IndicatorQuery query,
    String requestId) {

  public IndicatorAuditRecord {
    Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
    Objects.requireNonNull(operation, "operação não pode ser nula");
    Objects.requireNonNull(outcome, "resultado não pode ser nulo");
    Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");
    if (operation == Operation.OPTIONS && query != null) {
      throw new IllegalArgumentException("opções de filtro não aceitam uma consulta agregada");
    }
    if (operation != Operation.OPTIONS && query == null) {
      throw new IllegalArgumentException("consulta não pode ser nula");
    }
    if (query != null && !cycleId.equals(query.cycleId())) {
      throw new IllegalArgumentException("o ciclo da auditoria deve corresponder ao da consulta");
    }
    if (requestId != null && requestId.length() > 64) {
      throw new IllegalArgumentException("requestId não pode exceder 64 caracteres.");
    }
  }

  public IndicatorAuditRecord(
      UUID actorUserId,
      Operation operation,
      Outcome outcome,
      IndicatorQuery query,
      String requestId) {
    this(
        actorUserId,
        operation,
        outcome,
        Objects.requireNonNull(query, "consulta não pode ser nula").cycleId(),
        query,
        requestId);
  }

  public static IndicatorAuditRecord filterOptions(
      UUID actorUserId, Outcome outcome, UUID cycleId, String requestId) {
    return new IndicatorAuditRecord(
        actorUserId, Operation.OPTIONS, outcome, cycleId, null, requestId);
  }

  public enum Operation {
    QUERY,
    EXPORT,
    OPTIONS
  }

  public enum Outcome {
    AVAILABLE,
    INSUFFICIENT_DATA,
    ACCESS_DENIED,
    VALIDATION_DENIED,
    RATE_LIMITED,
    FAILURE
  }
}

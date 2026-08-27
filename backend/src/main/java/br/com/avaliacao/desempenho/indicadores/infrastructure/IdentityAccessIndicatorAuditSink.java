package br.com.avaliacao.desempenho.indicadores.infrastructure;

import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuditEvent;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorAuditRecord;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorAuditSink;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Objects;

/** Adaptador que mantém a auditoria de indicadores no repositório durável de identidade. */
public final class IdentityAccessIndicatorAuditSink implements IndicatorAuditSink {

  private static final String POLICY_VERSION = "2024.1";

  private final IdentityAccessRepository repository;

  public IdentityAccessIndicatorAuditSink(IdentityAccessRepository repository) {
    this.repository = Objects.requireNonNull(repository, "repositório não pode ser nulo");
  }

  @Override
  public void record(IndicatorAuditRecord record) {
    IndicatorAuditRecord auditRecord = Objects.requireNonNull(record, "registro não pode ser nulo");
    repository.writeAudit(
        new AuditEvent(
            auditRecord.actorUserId(),
            actionFor(auditRecord.operation()),
            "INDICADOR",
            auditRecord.cycleId(),
            resultFor(auditRecord.outcome()),
            auditRecord.requestId(),
            reducedDetail(auditRecord)));
  }

  private static String actionFor(IndicatorAuditRecord.Operation operation) {
    return switch (operation) {
      case QUERY -> "INDICADORES.CONSULTAR";
      case EXPORT -> "INDICADORES.EXPORTAR";
      case OPTIONS -> "INDICADORES.OPCOES";
    };
  }

  private static AuditEvent.AuditResult resultFor(IndicatorAuditRecord.Outcome outcome) {
    return switch (outcome) {
      case AVAILABLE -> AuditEvent.AuditResult.SUCCESS;
      case INSUFFICIENT_DATA, ACCESS_DENIED, VALIDATION_DENIED, RATE_LIMITED ->
          AuditEvent.AuditResult.DENIED;
      case FAILURE -> AuditEvent.AuditResult.FAILURE;
    };
  }

  private static String reducedDetail(IndicatorAuditRecord record) {
    if (record.operation() == IndicatorAuditRecord.Operation.OPTIONS) {
      return "policy=" + POLICY_VERSION + ";operation=OPTIONS";
    }
    IndicatorQuery query = record.query();
    return "policy="
        + POLICY_VERSION
        + ";metric="
        + query.metric().name()
        + ";population="
        + populationDimension(query)
        + ";filters_sha256="
        + sha256(canonicalFilters(query));
  }

  private static String populationDimension(IndicatorQuery query) {
    int selected = 0;
    selected += query.branchId() == null ? 0 : 1;
    selected += query.areaId() == null ? 0 : 1;
    selected += query.managerUserId() == null ? 0 : 1;
    if (selected > 1) {
      return "MULTIPLE";
    }
    if (query.branchId() != null) {
      return "BRANCH";
    }
    if (query.areaId() != null) {
      return "AREA";
    }
    if (query.managerUserId() != null) {
      return "MANAGER";
    }
    return "OVERALL";
  }

  private static String canonicalFilters(IndicatorQuery query) {
    return String.join(
        "|",
        query.cycleId().toString(),
        query.metric().name(),
        valueOf(query.branchId()),
        valueOf(query.areaId()),
        valueOf(query.managerUserId()),
        valueOf(query.collaboratorId()),
        valueOf(query.competencyId()));
  }

  private static String valueOf(Object value) {
    return value == null ? "-" : value.toString();
  }

  private static String sha256(String value) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder(digest.length * 2);
      for (byte element : digest) {
        hex.append(String.format("%02x", element));
      }
      return hex.toString();
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 deve estar disponível na JVM.", exception);
    }
  }
}

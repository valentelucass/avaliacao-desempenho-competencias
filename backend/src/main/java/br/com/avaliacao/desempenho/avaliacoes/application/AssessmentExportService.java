package br.com.avaliacao.desempenho.avaliacoes.application;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAuthorizationPolicy;
import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.application.LoginRateLimiter;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuditEvent;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.IntFunction;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/** Exportação individual autorizada e auditada, limitada por ator e sem paginação visual. */
@Service
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.assessments", name = "enabled", havingValue = "true")
public class AssessmentExportService {
  public static final int MAX_ROWS = 50_000;
  private final AssessmentExportRepository repository;
  private final AssessmentCoverageRepository coverage;
  private final AssessmentWorkbookWriter writer;
  private final IdentityAccessRepository audit;
  private final LoginRateLimiter requests;

  public AssessmentExportService(
      AssessmentExportRepository repository,
      AssessmentCoverageRepository coverage,
      AssessmentWorkbookWriter writer,
      IdentityAccessRepository audit,
      Clock clock) {
    this.repository = repository;
    this.coverage = coverage;
    this.writer = writer;
    this.audit = audit;
    this.requests = new LoginRateLimiter(clock, 10, Duration.ofMinutes(15));
  }

  public byte[] export(
      AssessmentAccessContext actor,
      AssessmentRepository.AssessmentListFilter filter,
      String requestId) {
    return exportWorkbook(
        actor,
        requestId,
        null,
        limit -> repository.listForExport(actor, Objects.requireNonNull(filter), limit),
        writer::write);
  }

  public byte[] exportCoverage(
      AssessmentAccessContext actor, AssessmentCoverageRepository.Filter filter, String requestId) {
    return exportWorkbook(
        actor,
        requestId,
        filter.cycleId(),
        limit -> coverage.listForExport(filter, limit),
        writer::writeCoverage);
  }

  private <Row> byte[] exportWorkbook(
      AssessmentAccessContext actor,
      String requestId,
      UUID coverageCycleId,
      IntFunction<List<Row>> load,
      Function<List<Row>, byte[]> write) {
    Objects.requireNonNull(actor, "actor");
    if (!new AssessmentAuthorizationPolicy().canExport(actor)) {
      record(actor, requestId, coverageCycleId, AuditEvent.AuditResult.DENIED);
      throw new AssessmentForbiddenException();
    }
    requests.checkAndRecord(actor.userId().toString());
    var rows = load.apply(MAX_ROWS + 1);
    if (rows.size() > MAX_ROWS) {
      record(actor, requestId, coverageCycleId, AuditEvent.AuditResult.DENIED);
      throw new AssessmentExportTooLargeException();
    }
    byte[] workbook = write.apply(rows);
    record(actor, requestId, coverageCycleId, AuditEvent.AuditResult.SUCCESS);
    return workbook;
  }

  private void record(
      AssessmentAccessContext actor,
      String requestId,
      UUID coverageCycleId,
      AuditEvent.AuditResult result) {
    audit.writeAudit(
        new AuditEvent(
            actor.userId(),
            "AVALIACOES.EXPORTAR",
            coverageCycleId == null ? "AVALIACAO" : "CICLO_AVALIACAO",
            coverageCycleId,
            result,
            requestId,
            null));
  }
}

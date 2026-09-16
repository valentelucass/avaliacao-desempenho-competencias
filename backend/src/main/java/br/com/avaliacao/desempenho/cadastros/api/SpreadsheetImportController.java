package br.com.avaliacao.desempenho.cadastros.api;

import br.com.avaliacao.desempenho.cadastros.application.*;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.Kind;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.Status;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/master-data/imports")
@PreAuthorize("hasAuthority('PERMISSION:CADASTROS.GERIR')")
@ConditionalOnSqlServerPersistence
public class SpreadsheetImportController {
  public static final String XLSX =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  private final SpreadsheetImportService service;

  public SpreadsheetImportController(SpreadsheetImportService service) {
    this.service = service;
  }

  public record PreviewRow(
      int line,
      String name,
      String questionnaire,
      String status,
      String message,
      AllocationPreview allocation,
      ManagerAssignmentPreview managerAssignment) {}

  public record ManagerAssignmentPreview(String manager, String startsOn) {}

  public record AllocationPreview(String branch, String area, String manager, String startsOn) {}

  public record PreviewResponse(
      UUID id,
      Instant expiresAt,
      int total,
      int creates,
      int existing,
      int errors,
      int page,
      int totalPages,
      List<PreviewRow> rows) {}

  public record ResultResponse(int created, int existing) {}

  @PostMapping(value = "/{kind}/preview", consumes = XLSX)
  public PreviewResponse preview(
      @PathVariable String kind,
      @RequestParam(required = false) UUID cycleId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest request)
      throws IOException {
    service.admit(principal.userId());
    Kind resource =
        switch (kind) {
          case "collaborators" -> Kind.COLLABORATORS;
          case "assignments" -> Kind.ASSIGNMENTS;
          case "allocations" -> Kind.ALLOCATIONS;
          default ->
              throw new SpreadsheetImportException(SpreadsheetImportException.Reason.INVALID_FILE);
        };
    if (request.getContentLengthLong() > SpreadsheetReader.MAX_BYTES)
      throw new SpreadsheetImportException(SpreadsheetImportException.Reason.LIMIT_EXCEEDED);
    byte[] bytes = request.getInputStream().readNBytes(SpreadsheetReader.MAX_BYTES + 1);
    return response(service.preview(resource, cycleId, bytes, principal.userId()), 1);
  }

  @GetMapping("/{id}")
  public PreviewResponse page(
      @PathVariable UUID id,
      @RequestParam(defaultValue = "1") int page,
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return response(service.get(id, principal.userId()), page);
  }

  @PostMapping("/{id}/confirm")
  public ResultResponse confirm(
      @PathVariable UUID id,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest request) {
    service.admit(principal.userId());
    var result =
        service.confirm(
            id,
            new MasterDataCommandContext(
                principal.userId(), RequestCorrelationFilter.getRequestId(request)));
    return new ResultResponse(result.created(), result.existing());
  }

  @DeleteMapping("/{id}")
  public void discard(
      @PathVariable UUID id, @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    service.discard(id, principal.userId());
  }

  static PreviewResponse response(SpreadsheetImportService.Preview preview, int page) {
    int pages = (preview.rows().size() + 24) / 25;
    if (page < 1 || page > pages)
      throw new SpreadsheetImportException(SpreadsheetImportException.Reason.INVALID_FILE);
    return new PreviewResponse(
        preview.id(),
        preview.expiresAt(),
        preview.rows().size(),
        (int) preview.rows().stream().filter(row -> row.status() == Status.CREATE).count(),
        (int) preview.rows().stream().filter(row -> row.status() == Status.EXISTS).count(),
        (int) preview.rows().stream().filter(row -> row.status() == Status.ERROR).count(),
        page,
        pages,
        preview.rows().stream()
            .skip((long) (page - 1) * 25)
            .limit(25)
            .map(
                row ->
                    new PreviewRow(
                        row.line(),
                        row.name(),
                        row.questionnaire(),
                        row.status().name(),
                        row.message(),
                        row.allocation() == null || row.allocation().fields() == null
                            ? null
                            : new AllocationPreview(
                                row.allocation().fields().branch(),
                                row.allocation().fields().area(),
                                row.allocation().fields().manager(),
                                row.allocation().fields().startsOn()),
                        row.managerAssignment() == null || row.managerAssignment().fields() == null
                            ? null
                            : new ManagerAssignmentPreview(
                                row.managerAssignment().fields().manager(),
                                row.managerAssignment().fields().startsOn())))
            .toList());
  }
}

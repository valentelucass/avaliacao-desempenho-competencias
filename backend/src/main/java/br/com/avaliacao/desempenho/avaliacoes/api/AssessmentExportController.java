package br.com.avaliacao.desempenho.avaliacoes.api;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.Filter;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.StartStatus;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentExportService;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository.AssessmentListFilter;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Download protegido por sessão/CSRF e autorização de negócio, sem cache. */
@RestController
@RequestMapping("/api/v1/assessments/exports")
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.assessments", name = "enabled", havingValue = "true")
public class AssessmentExportController {
  public static final String XLSX =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  private static final String CAN_EXPORT =
      "hasAuthority('PERMISSION:AVALIACOES.VISUALIZAR_TODAS') and hasAuthority('PERMISSION:DADOS.EXPORTAR')";
  private final AssessmentExportService service;

  public AssessmentExportController(AssessmentExportService service) {
    this.service = service;
  }

  @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
  @PreAuthorize(CAN_EXPORT)
  public ResponseEntity<byte[]> export(
      @Valid @RequestBody ExportRequest request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    byte[] content =
        service.export(
            access(principal),
            new AssessmentListFilter(
                request.cycleId(),
                request.collaboratorId(),
                request.evaluatedName(),
                request.managerName(),
                request.status(),
                request.feedbackStatus()),
            RequestCorrelationFilter.getRequestId(servletRequest));
    return download(content, "avaliacoes-desempenho.xlsx");
  }

  @PostMapping(path = "/coverage", consumes = MediaType.APPLICATION_JSON_VALUE)
  @PreAuthorize(CAN_EXPORT)
  public ResponseEntity<byte[]> exportCoverage(
      @Valid @RequestBody CoverageExportRequest request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    byte[] content =
        service.exportCoverage(
            access(principal),
            new Filter(
                request.cycleId(),
                request.status(),
                request.evaluatedName(),
                request.managerName()),
            RequestCorrelationFilter.getRequestId(servletRequest));
    return download(content, "acompanhamento-do-inicio.xlsx");
  }

  private static AssessmentAccessContext access(AuthenticatedPrincipal principal) {
    return new AssessmentAccessContext(
        principal.userId(), principal.user().permissions(), principal.user().roleCodes());
  }

  private static ResponseEntity<byte[]> download(byte[] content, String filename) {
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(XLSX))
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .body(content);
  }

  public record CoverageExportRequest(
      @NotNull UUID cycleId,
      @NotNull StartStatus status,
      @Size(max = 160) String evaluatedName,
      @Size(max = 160) String managerName) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String name, Object value) {
      throw new IllegalArgumentException("Campo não permitido na exportação.");
    }
  }

  public record ExportRequest(
      UUID cycleId,
      UUID collaboratorId,
      @Size(max = 160) String evaluatedName,
      @Size(max = 160) String managerName,
      AssessmentStatus status,
      FeedbackStatus feedbackStatus) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String name, Object value) {
      throw new IllegalArgumentException("Campo não permitido na exportação.");
    }
  }
}

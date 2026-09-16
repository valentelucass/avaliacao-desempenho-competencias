package br.com.avaliacao.desempenho.cadastros.api;

import br.com.avaliacao.desempenho.cadastros.application.*;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.Kind;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Escopo próprio: gerir cadastros não concede autorização para importar vínculos. */
@RestController
@RequestMapping("/api/v1/administration/manager-assignment-imports")
@PreAuthorize("hasAuthority('PERMISSION:VINCULOS_GESTOR_COLABORADOR.GERIR')")
@ConditionalOnSqlServerPersistence
public class ManagerAssignmentImportController {
  private final SpreadsheetImportService service;

  public ManagerAssignmentImportController(SpreadsheetImportService service) {
    this.service = service;
  }

  @PostMapping(value = "/preview", consumes = SpreadsheetImportController.XLSX)
  public SpreadsheetImportController.PreviewResponse preview(
      @AuthenticationPrincipal AuthenticatedPrincipal principal, HttpServletRequest request)
      throws IOException {
    service.admit(principal.userId());
    if (request.getContentLengthLong() > SpreadsheetReader.MAX_BYTES)
      throw new SpreadsheetImportException(SpreadsheetImportException.Reason.LIMIT_EXCEEDED);
    byte[] bytes = request.getInputStream().readNBytes(SpreadsheetReader.MAX_BYTES + 1);
    return SpreadsheetImportController.response(
        service.preview(Kind.MANAGER_ASSIGNMENTS, null, bytes, principal.userId()), 1);
  }

  @GetMapping("/{id}")
  public SpreadsheetImportController.PreviewResponse page(
      @PathVariable UUID id,
      @RequestParam(defaultValue = "1") int page,
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return SpreadsheetImportController.response(
        service.get(id, principal.userId(), Kind.MANAGER_ASSIGNMENTS), page);
  }

  @PostMapping("/{id}/confirm")
  public SpreadsheetImportController.ResultResponse confirm(
      @PathVariable UUID id,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest request) {
    service.admit(principal.userId());
    var result =
        service.confirm(
            id,
            new MasterDataCommandContext(
                principal.userId(), RequestCorrelationFilter.getRequestId(request)),
            Kind.MANAGER_ASSIGNMENTS);
    return new SpreadsheetImportController.ResultResponse(result.created(), result.existing());
  }

  @DeleteMapping("/{id}")
  public void discard(
      @PathVariable UUID id, @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    service.discard(id, principal.userId(), Kind.MANAGER_ASSIGNMENTS);
  }
}

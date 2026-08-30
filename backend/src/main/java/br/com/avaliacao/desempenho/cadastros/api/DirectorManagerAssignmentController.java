package br.com.avaliacao.desempenho.cadastros.api;

import br.com.avaliacao.desempenho.cadastros.api.dto.CreatedResourceResponse;
import br.com.avaliacao.desempenho.cadastros.api.dto.MasterDataRequests.Close;
import br.com.avaliacao.desempenho.cadastros.api.dto.MasterDataRequests.DirectorManagerAssignment;
import br.com.avaliacao.desempenho.cadastros.application.MasterDataApplicationService;
import br.com.avaliacao.desempenho.cadastros.application.MasterDataCommandContext;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mantém o vínculo de autoridade exclusivo para avaliações de Diretoria sobre Gerência. */
@RestController
@RequestMapping("/api/v1/administration/director-manager-assignments")
@ConditionalOnSqlServerPersistence
public class DirectorManagerAssignmentController {

  private static final String MANAGE_DIRECTOR_MANAGER_ASSIGNMENTS =
      "hasAuthority('PERMISSION:VINCULOS_DIRETORIA_GERENCIA.GERIR')";

  private final MasterDataApplicationService service;

  public DirectorManagerAssignmentController(MasterDataApplicationService service) {
    this.service = Objects.requireNonNull(service, "serviço não pode ser nulo");
  }

  @PostMapping
  @PreAuthorize(MANAGE_DIRECTOR_MANAGER_ASSIGNMENTS)
  public ResponseEntity<CreatedResourceResponse> create(
      @Valid @RequestBody DirectorManagerAssignment request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    UUID id =
        service.createDirectorManagerAssignment(
            request.directorUserId(),
            request.managerCollaboratorId(),
            request.startsOn(),
            context(principal, servletRequest));
    return ResponseEntity.status(HttpStatus.CREATED)
        .header(HttpHeaders.LOCATION, "/api/v1/administration/director-manager-assignments/" + id)
        .body(new CreatedResourceResponse(id));
  }

  @PatchMapping("/{assignmentId}/close")
  @PreAuthorize(MANAGE_DIRECTOR_MANAGER_ASSIGNMENTS)
  public ResponseEntity<Void> close(
      @PathVariable UUID assignmentId,
      @Valid @RequestBody Close request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.closeDirectorManagerAssignment(
        assignmentId, request.endsOn(), context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  private static MasterDataCommandContext context(
      AuthenticatedPrincipal principal, HttpServletRequest servletRequest) {
    AuthenticatedPrincipal authenticated =
        Objects.requireNonNull(principal, "principal autenticado não foi resolvido");
    return new MasterDataCommandContext(
        authenticated.userId(), RequestCorrelationFilter.getRequestId(servletRequest));
  }
}

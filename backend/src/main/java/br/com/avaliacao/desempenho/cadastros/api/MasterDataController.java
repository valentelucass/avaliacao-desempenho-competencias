package br.com.avaliacao.desempenho.cadastros.api;

import br.com.avaliacao.desempenho.cadastros.api.dto.CreatedResourceResponse;
import br.com.avaliacao.desempenho.cadastros.api.dto.MasterDataRequests.Allocation;
import br.com.avaliacao.desempenho.cadastros.api.dto.MasterDataRequests.Close;
import br.com.avaliacao.desempenho.cadastros.api.dto.MasterDataRequests.Collaborator;
import br.com.avaliacao.desempenho.cadastros.api.dto.MasterDataRequests.NamedResource;
import br.com.avaliacao.desempenho.cadastros.api.dto.MasterDataRequests.QuestionnaireAssignment;
import br.com.avaliacao.desempenho.cadastros.api.dto.MasterDataRequests.Revocation;
import br.com.avaliacao.desempenho.cadastros.api.dto.MasterDataRequests.UserCollaboratorLink;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Escritas administrativas mínimas de cadastro, sem expor listas ou histórico individual. */
@RestController
@RequestMapping("/api/v1/master-data")
@ConditionalOnSqlServerPersistence
public class MasterDataController {

  private static final String MANAGE_MASTER_DATA = "hasAuthority('PERMISSION:CADASTROS.GERIR')";
  private static final String MANAGE_USER_COLLABORATOR_LINKS =
      "hasAuthority('PERMISSION:VINCULOS_USUARIO_COLABORADOR.GERIR')";

  private final MasterDataApplicationService service;

  public MasterDataController(MasterDataApplicationService service) {
    this.service = Objects.requireNonNull(service, "serviço não pode ser nulo");
  }

  @PostMapping("/branches")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<CreatedResourceResponse> createBranch(
      @Valid @RequestBody NamedResource request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    UUID id = service.createBranch(request.name(), context(principal, servletRequest));
    return created("/api/v1/master-data/branches", id);
  }

  @PatchMapping("/branches/{branchId}/deactivate")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<Void> deactivateBranch(
      @PathVariable UUID branchId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.deactivateBranch(branchId, context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/branches/{branchId}")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<Void> deleteInactiveUnusedBranch(
      @PathVariable UUID branchId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.deleteInactiveUnusedBranch(branchId, context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/areas")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<CreatedResourceResponse> createArea(
      @Valid @RequestBody NamedResource request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    UUID id = service.createArea(request.name(), context(principal, servletRequest));
    return created("/api/v1/master-data/areas", id);
  }

  @PatchMapping("/areas/{areaId}/deactivate")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<Void> deactivateArea(
      @PathVariable UUID areaId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.deactivateArea(areaId, context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/collaborators")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<CreatedResourceResponse> createCollaborator(
      @Valid @RequestBody Collaborator request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    UUID id = service.createCollaborator(request.displayName(), context(principal, servletRequest));
    return created("/api/v1/master-data/collaborators", id);
  }

  @PatchMapping("/collaborators/{collaboratorId}/deactivate")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<Void> deactivateCollaborator(
      @PathVariable UUID collaboratorId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.deactivateCollaborator(collaboratorId, context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/allocations")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<CreatedResourceResponse> createAllocation(
      @Valid @RequestBody Allocation request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    UUID id =
        service.createAllocation(
            request.collaboratorId(),
            request.branchId(),
            request.areaId(),
            request.managerText(),
            request.startsOn(),
            context(principal, servletRequest));
    return created("/api/v1/master-data/allocations", id);
  }

  @PatchMapping("/allocations/{allocationId}/close")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<Void> closeAllocation(
      @PathVariable UUID allocationId,
      @Valid @RequestBody Close request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.closeAllocation(allocationId, request.endsOn(), context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/user-collaborator-links")
  @PreAuthorize(MANAGE_USER_COLLABORATOR_LINKS)
  public ResponseEntity<CreatedResourceResponse> createUserCollaboratorLink(
      @Valid @RequestBody UserCollaboratorLink request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    UUID id =
        service.createUserCollaboratorLink(
            request.userId(),
            request.collaboratorId(),
            request.startsOn(),
            context(principal, servletRequest));
    return created("/api/v1/master-data/user-collaborator-links", id);
  }

  @PatchMapping("/user-collaborator-links/{linkId}/close")
  @PreAuthorize(MANAGE_USER_COLLABORATOR_LINKS)
  public ResponseEntity<Void> closeUserCollaboratorLink(
      @PathVariable UUID linkId,
      @Valid @RequestBody Close request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.closeUserCollaboratorLink(linkId, request.endsOn(), context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/questionnaire-assignments")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<CreatedResourceResponse> createQuestionnaireAssignment(
      @Valid @RequestBody QuestionnaireAssignment request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    UUID id =
        service.createQuestionnaireAssignment(
            request.cycleId(),
            request.collaboratorId(),
            request.cycleQuestionnaireId(),
            context(principal, servletRequest));
    return created("/api/v1/master-data/questionnaire-assignments", id);
  }

  @PatchMapping("/questionnaire-assignments/{assignmentId}/revoke")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public ResponseEntity<Void> revokeQuestionnaireAssignment(
      @PathVariable UUID assignmentId,
      @Valid @RequestBody Revocation request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.revokeQuestionnaireAssignment(
        assignmentId, request.reason(), context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  private static ResponseEntity<CreatedResourceResponse> created(String collectionPath, UUID id) {
    return ResponseEntity.status(HttpStatus.CREATED)
        .header(HttpHeaders.LOCATION, collectionPath + '/' + id)
        .body(new CreatedResourceResponse(id));
  }

  private static MasterDataCommandContext context(
      AuthenticatedPrincipal principal, HttpServletRequest servletRequest) {
    AuthenticatedPrincipal authenticated =
        Objects.requireNonNull(principal, "principal autenticado não foi resolvido");
    return new MasterDataCommandContext(
        authenticated.userId(), RequestCorrelationFilter.getRequestId(servletRequest));
  }
}

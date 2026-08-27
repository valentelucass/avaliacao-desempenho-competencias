package br.com.avaliacao.desempenho.administracao.api;

import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponseMapper;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveAllocation;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveManagerAssignment;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveQuestionnaireAssignment;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveUserCollaboratorLink;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ApprovedQuestionnaireVersion;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.Collaborator;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.DraftCycleConfiguration;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ManagerAssignmentOptions;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.NamedResource;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.QuestionnaireAssignmentOption;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.UserCollaboratorLinkOptions;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadService;
import br.com.avaliacao.desempenho.administracao.domain.model.AdministrativeReadAccessContext;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Leituras administrativas autorizadas, limitadas às escolhas necessárias para as rotas de escrita.
 */
@RestController
@RequestMapping("/api/v1")
@ConditionalOnSqlServerPersistence
public class AdministrativeReadController {

  private static final String MANAGE_MASTER_DATA = "hasAuthority('PERMISSION:CADASTROS.GERIR')";
  private static final String MANAGE_MANAGER_ASSIGNMENTS =
      "hasAuthority('PERMISSION:VINCULOS_GESTOR_COLABORADOR.GERIR')";
  private static final String MANAGE_USER_COLLABORATOR_LINKS =
      "hasAuthority('PERMISSION:VINCULOS_USUARIO_COLABORADOR.GERIR')";
  private static final String MANAGE_QUESTIONNAIRES_OR_CYCLES =
      "hasAnyAuthority('PERMISSION:QUESTIONARIOS.GERIR', 'PERMISSION:CICLOS.GERIR')";
  private static final String MANAGE_CYCLES = "hasAuthority('PERMISSION:CICLOS.GERIR')";

  private final AdministrativeReadService service;
  private final AdministrativeReadResponseMapper responseMapper =
      new AdministrativeReadResponseMapper();

  public AdministrativeReadController(AdministrativeReadService service) {
    this.service = Objects.requireNonNull(service, "serviço não pode ser nulo");
  }

  @GetMapping("/master-data/branches")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public List<NamedResource> listBranches(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toNamedResources(service.listBranches(context(principal)));
  }

  @GetMapping("/master-data/areas")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public List<NamedResource> listAreas(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toNamedResources(service.listAreas(context(principal)));
  }

  @GetMapping("/master-data/collaborators")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public List<Collaborator> listCollaborators(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toCollaborators(service.listCollaborators(context(principal)));
  }

  @GetMapping("/master-data/allocations/active")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public List<ActiveAllocation> listActiveAllocations(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toActiveAllocations(service.listActiveAllocations(context(principal)));
  }

  @GetMapping("/administration/manager-assignments/active")
  @PreAuthorize(MANAGE_MANAGER_ASSIGNMENTS)
  public List<ActiveManagerAssignment> listActiveManagerAssignments(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toActiveManagerAssignments(
        service.listActiveManagerAssignments(context(principal)));
  }

  @GetMapping("/administration/manager-assignments/options")
  @PreAuthorize(MANAGE_MANAGER_ASSIGNMENTS)
  public ManagerAssignmentOptions managerAssignmentOptions(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toManagerAssignmentOptions(
        service.managerAssignmentOptions(context(principal)));
  }

  @GetMapping("/master-data/user-collaborator-links/active")
  @PreAuthorize(MANAGE_USER_COLLABORATOR_LINKS)
  public List<ActiveUserCollaboratorLink> listActiveUserCollaboratorLinks(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toActiveUserCollaboratorLinks(
        service.listActiveUserCollaboratorLinks(context(principal)));
  }

  @GetMapping("/master-data/user-collaborator-links/options")
  @PreAuthorize(MANAGE_USER_COLLABORATOR_LINKS)
  public UserCollaboratorLinkOptions userCollaboratorLinkOptions(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toUserCollaboratorLinkOptions(
        service.userCollaboratorLinkOptions(context(principal)));
  }

  @GetMapping("/master-data/questionnaire-assignments/active")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public List<ActiveQuestionnaireAssignment> listActiveQuestionnaireAssignments(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toActiveQuestionnaireAssignments(
        service.listActiveQuestionnaireAssignments(context(principal)));
  }

  @GetMapping("/master-data/questionnaire-assignment-options")
  @PreAuthorize(MANAGE_MASTER_DATA)
  public List<QuestionnaireAssignmentOption> listQuestionnaireAssignmentOptions(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toQuestionnaireAssignmentOptions(
        service.listQuestionnaireAssignmentOptions(context(principal)));
  }

  @GetMapping("/questionnaire-versions/approved")
  @PreAuthorize(MANAGE_QUESTIONNAIRES_OR_CYCLES)
  public List<ApprovedQuestionnaireVersion> listApprovedQuestionnaireVersions(
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toApprovedQuestionnaireVersions(
        service.listApprovedQuestionnaireVersions(context(principal)));
  }

  @GetMapping("/evaluation-cycles/{cycleId}/administration-draft")
  @PreAuthorize(MANAGE_CYCLES)
  public DraftCycleConfiguration draftCycleConfiguration(
      @PathVariable UUID cycleId, @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toDraftCycleConfiguration(
        service.draftCycleConfiguration(cycleId, context(principal)));
  }

  private static AdministrativeReadAccessContext context(AuthenticatedPrincipal principal) {
    AuthenticatedPrincipal authenticated =
        Objects.requireNonNull(principal, "principal autenticado não foi resolvido");
    return new AdministrativeReadAccessContext(
        authenticated.userId(), authenticated.user().permissions());
  }
}

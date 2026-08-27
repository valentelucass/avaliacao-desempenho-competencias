package br.com.avaliacao.desempenho.administracao.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveAllocation;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveQuestionnaireAssignment;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ManagerAssignmentOptions;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.NamedResource;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.SelectionOption;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.UserCollaboratorLinkOptions;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadRepository;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadService;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;

class AdministrativeReadControllerTests {

  @Test
  void mapsOnlyTheMinimalFieldsNeededToManageMasterDataAndActiveAllocations() {
    AdministrativeReadRepository repository = mock(AdministrativeReadRepository.class);
    AdministrativeReadController controller =
        new AdministrativeReadController(new AdministrativeReadService(repository));
    UUID branchId = UUID.randomUUID();
    UUID allocationId = UUID.randomUUID();
    UUID collaboratorId = UUID.randomUUID();
    when(repository.listBranches())
        .thenReturn(
            List.of(new AdministrativeReadRepository.NamedResourceView(branchId, "Centro", true)));
    when(repository.listActiveAllocations())
        .thenReturn(
            List.of(
                new AdministrativeReadRepository.ActiveAllocationView(
                    allocationId,
                    collaboratorId,
                    branchId,
                    null,
                    "Gestão Operacional",
                    LocalDate.of(2026, 9, 1))));

    List<NamedResource> branches = controller.listBranches(principal("CADASTROS.GERIR"));
    List<ActiveAllocation> allocations =
        controller.listActiveAllocations(principal("CADASTROS.GERIR"));

    assertThat(branches).containsExactly(new NamedResource(branchId, "Centro", true));
    assertThat(allocations)
        .containsExactly(
            new ActiveAllocation(
                allocationId,
                collaboratorId,
                branchId,
                null,
                "Gestão Operacional",
                LocalDate.of(2026, 9, 1)));
    assertThat(branches.toString() + allocations)
        .doesNotContain("password", "token", "assessment", "comment", "score");
  }

  @Test
  void declaresAnExactPermissionForEveryAdministrativeReadEndpoint() throws Exception {
    assertThat(permissionOf("listBranches", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:CADASTROS.GERIR')");
    assertThat(permissionOf("listAreas", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:CADASTROS.GERIR')");
    assertThat(permissionOf("listCollaborators", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:CADASTROS.GERIR')");
    assertThat(permissionOf("listActiveAllocations", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:CADASTROS.GERIR')");
    assertThat(permissionOf("listActiveManagerAssignments", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:VINCULOS_GESTOR_COLABORADOR.GERIR')");
    assertThat(permissionOf("managerAssignmentOptions", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:VINCULOS_GESTOR_COLABORADOR.GERIR')");
    assertThat(permissionOf("listActiveUserCollaboratorLinks", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:VINCULOS_USUARIO_COLABORADOR.GERIR')");
    assertThat(permissionOf("userCollaboratorLinkOptions", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:VINCULOS_USUARIO_COLABORADOR.GERIR')");
    assertThat(permissionOf("listActiveQuestionnaireAssignments", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:CADASTROS.GERIR')");
    assertThat(permissionOf("listQuestionnaireAssignmentOptions", AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:CADASTROS.GERIR')");
    assertThat(permissionOf("listApprovedQuestionnaireVersions", AuthenticatedPrincipal.class))
        .isEqualTo("hasAnyAuthority('PERMISSION:QUESTIONARIOS.GERIR', 'PERMISSION:CICLOS.GERIR')");
    assertThat(permissionOf("draftCycleConfiguration", UUID.class, AuthenticatedPrincipal.class))
        .isEqualTo("hasAuthority('PERMISSION:CICLOS.GERIR')");
  }

  @Test
  void mapsBindingOptionsToOnlyAnIdentifierAndDisplayName() {
    AdministrativeReadRepository repository = mock(AdministrativeReadRepository.class);
    AdministrativeReadController controller =
        new AdministrativeReadController(new AdministrativeReadService(repository));
    AdministrativeReadRepository.SelectionOptionView manager =
        new AdministrativeReadRepository.SelectionOptionView(UUID.randomUUID(), "Gestora");
    AdministrativeReadRepository.SelectionOptionView user =
        new AdministrativeReadRepository.SelectionOptionView(UUID.randomUUID(), "Conta");
    AdministrativeReadRepository.SelectionOptionView collaborator =
        new AdministrativeReadRepository.SelectionOptionView(UUID.randomUUID(), "Colaborador");
    when(repository.listEligibleManagerOptions()).thenReturn(List.of(manager));
    when(repository.listActiveUserOptions()).thenReturn(List.of(user));
    when(repository.listActiveCollaboratorOptions()).thenReturn(List.of(collaborator));

    ManagerAssignmentOptions managerOptions =
        controller.managerAssignmentOptions(principal("VINCULOS_GESTOR_COLABORADOR.GERIR"));
    UserCollaboratorLinkOptions userOptions =
        controller.userCollaboratorLinkOptions(principal("VINCULOS_USUARIO_COLABORADOR.GERIR"));

    assertThat(managerOptions)
        .isEqualTo(
            new ManagerAssignmentOptions(
                List.of(new SelectionOption(manager.id(), "Gestora")),
                List.of(new SelectionOption(collaborator.id(), "Colaborador"))));
    assertThat(userOptions)
        .isEqualTo(
            new UserCollaboratorLinkOptions(
                List.of(new SelectionOption(user.id(), "Conta")),
                List.of(new SelectionOption(collaborator.id(), "Colaborador"))));
    assertThat(managerOptions.toString() + userOptions)
        .doesNotContain("login", "password", "token", "assessment", "comment");
  }

  @Test
  void keepsOnlyLabelsNeededToRenderAnActiveQuestionnaireAssignmentAfterACycleOpens() {
    AdministrativeReadRepository repository = mock(AdministrativeReadRepository.class);
    AdministrativeReadController controller =
        new AdministrativeReadController(new AdministrativeReadService(repository));
    UUID assignmentId = UUID.randomUUID();
    UUID cycleId = UUID.randomUUID();
    UUID collaboratorId = UUID.randomUUID();
    UUID cycleQuestionnaireId = UUID.randomUUID();
    when(repository.listActiveQuestionnaireAssignments())
        .thenReturn(
            List.of(
                new AdministrativeReadRepository.ActiveQuestionnaireAssignmentView(
                    assignmentId,
                    cycleId,
                    "2026.1",
                    "Ciclo 2026",
                    collaboratorId,
                    cycleQuestionnaireId,
                    "Competências 2026")));

    List<ActiveQuestionnaireAssignment> result =
        controller.listActiveQuestionnaireAssignments(principal("CADASTROS.GERIR"));

    assertThat(result)
        .containsExactly(
            new ActiveQuestionnaireAssignment(
                assignmentId,
                cycleId,
                "2026.1",
                "Ciclo 2026",
                collaboratorId,
                cycleQuestionnaireId,
                "Competências 2026"));
    assertThat(result.toString())
        .doesNotContain("answer", "score", "assessment", "comment", "response");
  }

  private static String permissionOf(String methodName, Class<?>... parameterTypes)
      throws Exception {
    Method method = AdministrativeReadController.class.getMethod(methodName, parameterTypes);
    return method.getAnnotation(PreAuthorize.class).value();
  }

  private static AuthenticatedPrincipal principal(String permission) {
    return new AuthenticatedPrincipal(
        new AuthorizedUser(UUID.randomUUID(), "Administração", false, Set.of(permission), Set.of()),
        UUID.randomUUID());
  }
}

package br.com.avaliacao.desempenho.administracao.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadException.Reason;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadRepository.DraftAppliedQuestionnaireView;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadRepository.DraftCycleConfigurationView;
import br.com.avaliacao.desempenho.administracao.domain.model.AdministrativeReadAccessContext;
import br.com.avaliacao.desempenho.administracao.domain.model.AdministrativeReadAuthorizationPolicy;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class AdministrativeReadServiceTests {

  private final AdministrativeReadRepository repository = mock(AdministrativeReadRepository.class);
  private final AdministrativeReadService service = new AdministrativeReadService(repository);

  @Test
  void rejectsAnAdministrativeCollectionWhenOnlyAnotherAdministrativePermissionIsPresent() {
    AdministrativeReadAccessContext actor =
        actor(AdministrativeReadAuthorizationPolicy.MANAGER_ASSIGNMENTS_MANAGE);

    assertThatThrownBy(() -> service.listBranches(actor))
        .isInstanceOf(AdministrativeReadException.class)
        .extracting(exception -> ((AdministrativeReadException) exception).reason())
        .isEqualTo(Reason.FORBIDDEN);

    verifyNoInteractions(repository);
  }

  @Test
  void convertsTheStoredUtcWindowToTheCycleTimeZoneBeforeReturningADraft() {
    UUID cycleId = UUID.randomUUID();
    UUID cycleQuestionnaireId = UUID.randomUUID();
    when(repository.findDraftCycleConfiguration(cycleId))
        .thenReturn(
            Optional.of(
                new DraftCycleConfigurationView(
                    cycleId,
                    "2026.1",
                    "Ciclo 2026",
                    Instant.parse("2026-09-01T03:00:00Z"),
                    Instant.parse("2026-09-16T03:00:00Z"),
                    "America/Sao_Paulo",
                    true,
                    List.of(
                        new DraftAppliedQuestionnaireView(
                            cycleQuestionnaireId,
                            UUID.randomUUID(),
                            UUID.randomUUID(),
                            UUID.randomUUID())))));

    AdministrativeReadService.DraftCycleConfiguration result =
        service.draftCycleConfiguration(
            cycleId, actor(AdministrativeReadAuthorizationPolicy.CYCLES_MANAGE));

    assertThat(result.openingAtLocal()).isEqualTo(LocalDateTime.of(2026, 9, 1, 0, 0));
    assertThat(result.closingAtLocal()).isEqualTo(LocalDateTime.of(2026, 9, 16, 0, 0));
    assertThat(result.questionnaires())
        .singleElement()
        .extracting(DraftAppliedQuestionnaireView::cycleQuestionnaireId)
        .isEqualTo(cycleQuestionnaireId);
  }

  @Test
  void hidesWhetherANonDraftCycleExistsByReturningOnlyTheSafeNotFoundFailure() {
    UUID cycleId = UUID.randomUUID();
    when(repository.findDraftCycleConfiguration(cycleId)).thenReturn(Optional.empty());

    assertThatThrownBy(
            () ->
                service.draftCycleConfiguration(
                    cycleId, actor(AdministrativeReadAuthorizationPolicy.CYCLES_MANAGE)))
        .isInstanceOf(AdministrativeReadException.class)
        .extracting(exception -> ((AdministrativeReadException) exception).reason())
        .isEqualTo(Reason.NOT_FOUND);
  }

  @Test
  void translatesPersistenceFailuresWithoutExposingTheCause() {
    when(repository.listApprovedQuestionnaireVersions())
        .thenThrow(new DataAccessResourceFailureException("database host detail"));

    assertThatThrownBy(
            () ->
                service.listApprovedQuestionnaireVersions(
                    actor(AdministrativeReadAuthorizationPolicy.QUESTIONNAIRES_MANAGE)))
        .isInstanceOf(AdministrativeReadException.class)
        .extracting(exception -> ((AdministrativeReadException) exception).reason())
        .isEqualTo(Reason.UNAVAILABLE);
  }

  @Test
  void permitsACycleAdministratorToReadOnlyTheApprovedVersionChoicesNeededToConfigureACycle() {
    when(repository.listApprovedQuestionnaireVersions()).thenReturn(List.of());

    assertThat(
            service.listApprovedQuestionnaireVersions(
                actor(AdministrativeReadAuthorizationPolicy.CYCLES_MANAGE)))
        .isEmpty();
  }

  @Test
  void exposesOnlyTheSelectionInputsRequiredByTheSpecificManagerAssignmentPermission() {
    AdministrativeReadRepository.SelectionOptionView manager =
        new AdministrativeReadRepository.SelectionOptionView(UUID.randomUUID(), "Gestora");
    AdministrativeReadRepository.SelectionOptionView collaborator =
        new AdministrativeReadRepository.SelectionOptionView(UUID.randomUUID(), "Colaborador");
    when(repository.listEligibleManagerOptions()).thenReturn(List.of(manager));
    when(repository.listActiveCollaboratorOptions()).thenReturn(List.of(collaborator));

    AdministrativeReadRepository.ManagerAssignmentOptionsView result =
        service.managerAssignmentOptions(
            actor(AdministrativeReadAuthorizationPolicy.MANAGER_ASSIGNMENTS_MANAGE));

    assertThat(result.managers()).containsExactly(manager);
    assertThat(result.collaborators()).containsExactly(collaborator);
    verify(repository).listEligibleManagerOptions();
    verify(repository).listActiveCollaboratorOptions();
  }

  @Test
  void doesNotLetAManagerAssignmentAdministratorReadUserLinkOptions() {
    assertThatThrownBy(
            () ->
                service.userCollaboratorLinkOptions(
                    actor(AdministrativeReadAuthorizationPolicy.MANAGER_ASSIGNMENTS_MANAGE)))
        .isInstanceOf(AdministrativeReadException.class)
        .extracting(exception -> ((AdministrativeReadException) exception).reason())
        .isEqualTo(Reason.FORBIDDEN);

    verifyNoInteractions(repository);
  }

  private static AdministrativeReadAccessContext actor(String permission) {
    return new AdministrativeReadAccessContext(UUID.randomUUID(), Set.of(permission));
  }
}

package br.com.avaliacao.desempenho.avaliacoes.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAuthorizationPolicy;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AssessmentApplicationServiceTests {

  @Test
  void returnsOnlyTheRepositoryOptionsForAnAuthorizedManager() {
    AssessmentRepository repository = mock(AssessmentRepository.class);
    AssessmentApplicationService service = new AssessmentApplicationService(repository);
    UUID cycleId = UUID.randomUUID();
    AssessmentAccessContext actor =
        new AssessmentAccessContext(
            UUID.randomUUID(), Set.of(AssessmentAuthorizationPolicy.EVALUATE_LINKED));
    List<AssessmentRepository.ManagerCreationOptionView> options =
        List.of(new AssessmentRepository.ManagerCreationOptionView(UUID.randomUUID(), "Ana Silva"));
    when(repository.listManagerCreationOptions(cycleId, actor)).thenReturn(options);

    assertThat(service.listManagerCreationOptions(cycleId, actor))
        .containsExactlyElementsOf(options);
    verify(repository).listManagerCreationOptions(cycleId, actor);
  }

  @Test
  void rejectsCreationOptionsWithoutTheManagerEvaluationPermission() {
    AssessmentRepository repository = mock(AssessmentRepository.class);
    AssessmentApplicationService service = new AssessmentApplicationService(repository);

    assertThatThrownBy(
            () ->
                service.listManagerCreationOptions(
                    UUID.randomUUID(), new AssessmentAccessContext(UUID.randomUUID(), Set.of())))
        .isInstanceOf(AssessmentForbiddenException.class);

    verifyNoInteractions(repository);
  }

  @Test
  void recordsPrintOnlyAfterTheAssessmentIsAccessibleToTheActor() {
    AssessmentRepository repository = mock(AssessmentRepository.class);
    AssessmentApplicationService service = new AssessmentApplicationService(repository);
    UUID assessmentId = UUID.randomUUID();
    UUID requestActorId = UUID.randomUUID();
    AssessmentAccessContext actor =
        new AssessmentAccessContext(requestActorId, Set.of(AssessmentAuthorizationPolicy.VIEW_ALL));
    AssessmentRepository.AssessmentDetailView accessible =
        new AssessmentRepository.AssessmentDetailView(
            new AssessmentRepository.AssessmentSummaryView(
                assessmentId,
                UUID.randomUUID(),
                "Ciclo",
                "Colaborador",
                br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType.GESTOR,
                "PUBLICADA",
                "revision",
                java.time.Instant.now()),
            "2024.1",
            List.of(),
            List.of(),
            null,
            null,
            null,
            List.of());
    when(repository.findAccessible(assessmentId, actor)).thenReturn(Optional.of(accessible));

    service.recordPrint(assessmentId, actor, "request-correlation-id");

    verify(repository).recordPrint(assessmentId, actor, "request-correlation-id");
  }
}

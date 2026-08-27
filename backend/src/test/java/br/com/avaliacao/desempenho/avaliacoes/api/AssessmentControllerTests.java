package br.com.avaliacao.desempenho.avaliacoes.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.avaliacoes.api.dto.AssessmentCreationOptionsResponse;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentApplicationService;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAuthorizationPolicy;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AssessmentControllerTests {

  @Test
  void mapsOnlyCollaboratorIdentifierAndDisplayNameForManagerCreationOptions() {
    AssessmentRepository repository = mock(AssessmentRepository.class);
    AssessmentApplicationService service = new AssessmentApplicationService(repository);
    AssessmentController controller = new AssessmentController(service);
    UUID cycleId = UUID.randomUUID();
    UUID collaboratorId = UUID.randomUUID();
    when(repository.listManagerCreationOptions(
            org.mockito.ArgumentMatchers.eq(cycleId), org.mockito.ArgumentMatchers.any()))
        .thenReturn(
            List.of(
                new AssessmentRepository.ManagerCreationOptionView(collaboratorId, "Ana Silva")));

    AssessmentCreationOptionsResponse response =
        controller.managerCreationOptions(cycleId, managerPrincipal());

    assertThat(response.collaborators())
        .containsExactly(
            new AssessmentCreationOptionsResponse.CollaboratorResponse(
                collaboratorId, "Ana Silva"));
    assertThat(response.toString()).doesNotContain("assessment", "result", "score", "answer");
  }

  private static AuthenticatedPrincipal managerPrincipal() {
    return new AuthenticatedPrincipal(
        new AuthorizedUser(
            UUID.randomUUID(),
            "Gestor",
            false,
            Set.of(AssessmentAuthorizationPolicy.EVALUATE_LINKED)),
        UUID.randomUUID());
  }
}

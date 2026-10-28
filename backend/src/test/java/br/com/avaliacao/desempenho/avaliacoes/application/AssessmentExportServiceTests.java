package br.com.avaliacao.desempenho.avaliacoes.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.application.RateLimitedException;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuditEvent;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class AssessmentExportServiceTests {
  private final AssessmentExportRepository repository = mock(AssessmentExportRepository.class);
  private final AssessmentWorkbookWriter writer = mock(AssessmentWorkbookWriter.class);
  private final IdentityAccessRepository audit = mock(IdentityAccessRepository.class);
  private final AssessmentExportService service =
      new AssessmentExportService(
          repository, writer, audit, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
  private final Set<String> permissions = Set.of("DADOS.EXPORTAR", "AVALIACOES.VISUALIZAR_TODAS");

  private AssessmentAccessContext actor(Set<String> roles, Set<String> grants) {
    return new AssessmentAccessContext(UUID.randomUUID(), grants, roles);
  }

  @Test
  void requiresBothPermissionsAndBusinessRoleEvenIfTechnicalAdministratorHasAllPermissions() {
    for (String role : List.of("GESTOR", "COLABORADOR", "ADMINISTRADOR_PLATAFORMA")) {
      assertThatThrownBy(
              () ->
                  service.export(
                      actor(Set.of(role), permissions),
                      AssessmentRepository.AssessmentListFilter.none(),
                      "request-test"))
          .isInstanceOf(AssessmentForbiddenException.class);
    }
    assertThatThrownBy(
            () ->
                service.export(
                    actor(Set.of("DIRETORIA", "ADMINISTRADOR_PLATAFORMA"), permissions),
                    AssessmentRepository.AssessmentListFilter.none(),
                    "request-test"))
        .isInstanceOf(AssessmentForbiddenException.class);
    for (String grant : permissions) {
      assertThatThrownBy(
              () ->
                  service.export(
                      actor(Set.of("GERENCIA_RH"), Set.of(grant)),
                      AssessmentRepository.AssessmentListFilter.none(),
                      "request-test"))
          .isInstanceOf(AssessmentForbiddenException.class);
    }
    verifyNoInteractions(repository, writer);
  }

  @Test
  void usesAllRowsAndExactFiltersAuditsAndRateLimitsTheActor() {
    var actor = actor(Set.of("DIRETORIA"), permissions);
    var filter =
        new AssessmentRepository.AssessmentListFilter(null, null, "Ana", "João", null, null);
    when(repository.listForExport(actor, filter, 50_001)).thenReturn(List.of());
    when(writer.write(List.of())).thenReturn(new byte[] {80, 75});
    for (int i = 0; i < 10; i++)
      assertThat(service.export(actor, filter, "test-request")).isEqualTo(new byte[] {80, 75});
    assertThatThrownBy(() -> service.export(actor, filter, "test-request"))
        .isInstanceOf(RateLimitedException.class);
    verify(repository, times(10)).listForExport(actor, filter, 50_001);
    verify(audit, times(10))
        .writeAudit(
            argThat(
                event ->
                    event.action().equals("AVALIACOES.EXPORTAR")
                        && event.result() == AuditEvent.AuditResult.SUCCESS
                        && event.reducedDetail() == null));
  }

  @Test
  void neverReturnsSilentlyTruncatedExport() {
    var actor = actor(Set.of("GERENCIA_RH"), permissions);
    when(repository.listForExport(eq(actor), any(), eq(50_001)))
        .thenReturn(Collections.nCopies(50_001, null));
    assertThatThrownBy(
            () ->
                service.export(
                    actor, AssessmentRepository.AssessmentListFilter.none(), "test-request"))
        .isInstanceOf(AssessmentExportTooLargeException.class);
    verifyNoInteractions(writer);
    verify(audit).writeAudit(argThat(event -> event.result() == AuditEvent.AuditResult.DENIED));
  }
}

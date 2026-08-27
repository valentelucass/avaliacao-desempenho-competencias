package br.com.avaliacao.desempenho.ciclosavaliacao.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationException.Reason;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationRepository.CreatedCycle;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleConfigurationDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.invocation.InvocationOnMock;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class EvaluationCycleAdministrationServiceTests {

  private final EvaluationCycleAdministrationRepository repository =
      mock(EvaluationCycleAdministrationRepository.class);
  private final TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
  private final EvaluationCycleAdministrationService service =
      new EvaluationCycleAdministrationService(repository, transactionTemplate);

  @Test
  void createsADraftCycleAndRecordsTheAuthenticatedActor() {
    UUID actor = UUID.randomUUID();
    EvaluationCycleCommandContext context = new EvaluationCycleCommandContext(actor, "request-1");
    EvaluationCycleDraft draft = new EvaluationCycleDraft("ciclo_2026", validConfiguration());
    CreatedCycle created = new CreatedCycle(UUID.randomUUID(), List.of());
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.createDraftCycle(draft, actor, "request-1")).thenReturn(created);

    CreatedCycle result = service.createDraftCycle(draft, context);

    assertThat(result).isEqualTo(created);
    verify(repository).createDraftCycle(draft, actor, "request-1");
    verify(repository)
        .writeAdministrativeAudit(
            actor, "CICLO.CRIAR", "CICLO_AVALIACAO", created.cycleId(), "request-1");
  }

  @Test
  void replacesOnlyADraftConfigurationAndAuditsTheChange() {
    UUID actor = UUID.randomUUID();
    UUID cycleId = UUID.randomUUID();
    EvaluationCycleConfigurationDraft configuration = validConfiguration();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.replaceDraftConfiguration(cycleId, configuration, actor)).thenReturn(true);

    service.replaceDraftConfiguration(
        cycleId, configuration, new EvaluationCycleCommandContext(actor, "request-2"));

    verify(repository).replaceDraftConfiguration(cycleId, configuration, actor);
    verify(repository)
        .writeAdministrativeAudit(actor, "CICLO.ALTERAR", "CICLO_AVALIACAO", cycleId, "request-2");
  }

  @Test
  void returnsAConflictWhenTheCycleIsNoLongerDraft() {
    UUID cycleId = UUID.randomUUID();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.replaceDraftConfiguration(any(), any(), any())).thenReturn(false);

    assertThatThrownBy(
            () ->
                service.replaceDraftConfiguration(
                    cycleId,
                    validConfiguration(),
                    new EvaluationCycleCommandContext(UUID.randomUUID(), "request-3")))
        .isInstanceOf(EvaluationCycleAdministrationException.class)
        .extracting(exception -> ((EvaluationCycleAdministrationException) exception).reason())
        .isEqualTo(Reason.CONFLICT);

    verify(repository, never()).writeAdministrativeAudit(any(), any(), any(), any(), any());
  }

  @Test
  void opensADraftCycleAndRecordsTheTransitionAndAudit() {
    UUID actor = UUID.randomUUID();
    UUID cycleId = UUID.randomUUID();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.lockCurrentStatus(cycleId))
        .thenReturn(Optional.of(EvaluationCycleStatus.RASCUNHO));
    when(repository.transition(
            cycleId,
            EvaluationCycleStatus.RASCUNHO,
            EvaluationCycleStatus.ABERTO,
            actor,
            "request-open"))
        .thenReturn(true);

    service.openCycle(cycleId, new EvaluationCycleCommandContext(actor, "request-open"));

    verify(repository).lockCurrentStatus(cycleId);
    verify(repository)
        .transition(
            cycleId,
            EvaluationCycleStatus.RASCUNHO,
            EvaluationCycleStatus.ABERTO,
            actor,
            "request-open");
    verify(repository)
        .writeAdministrativeAudit(actor, "CICLO.ABRIR", "CICLO_AVALIACAO", cycleId, "request-open");
  }

  @Test
  void closesAnOpenCycleAndRecordsTheTransitionAndAudit() {
    UUID actor = UUID.randomUUID();
    UUID cycleId = UUID.randomUUID();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.lockCurrentStatus(cycleId))
        .thenReturn(Optional.of(EvaluationCycleStatus.ABERTO));
    when(repository.transition(
            cycleId,
            EvaluationCycleStatus.ABERTO,
            EvaluationCycleStatus.ENCERRADO,
            actor,
            "request-close"))
        .thenReturn(true);

    service.closeCycle(cycleId, new EvaluationCycleCommandContext(actor, "request-close"));

    verify(repository).lockCurrentStatus(cycleId);
    verify(repository)
        .transition(
            cycleId,
            EvaluationCycleStatus.ABERTO,
            EvaluationCycleStatus.ENCERRADO,
            actor,
            "request-close");
    verify(repository)
        .writeAdministrativeAudit(
            actor, "CICLO.ENCERRAR", "CICLO_AVALIACAO", cycleId, "request-close");
  }

  @Test
  void returnsAConflictWhenTheRequestedLifecycleTransitionIsInvalid() {
    UUID cycleId = UUID.randomUUID();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.lockCurrentStatus(cycleId))
        .thenReturn(Optional.of(EvaluationCycleStatus.ABERTO));

    assertThatThrownBy(
            () ->
                service.openCycle(
                    cycleId,
                    new EvaluationCycleCommandContext(UUID.randomUUID(), "request-invalid")))
        .isInstanceOf(EvaluationCycleAdministrationException.class)
        .extracting(exception -> ((EvaluationCycleAdministrationException) exception).reason())
        .isEqualTo(Reason.CONFLICT);

    verify(repository).lockCurrentStatus(cycleId);
    verify(repository, never()).transition(any(), any(), any(), any(), any());
    verify(repository, never()).writeAdministrativeAudit(any(), any(), any(), any(), any());
  }

  private static EvaluationCycleConfigurationDraft validConfiguration() {
    return new EvaluationCycleConfigurationDraft(
        "Ciclo 2026",
        LocalDateTime.of(2026, 9, 1, 0, 0),
        LocalDateTime.of(2026, 9, 16, 0, 0),
        EvaluationCycleConfigurationDraft.TIME_ZONE,
        false,
        List.of(
            new EvaluationCycleConfigurationDraft.AppliedQuestionnaireDraft(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())));
  }

  private Object runTransaction(InvocationOnMock invocation) throws Throwable {
    TransactionCallback<Object> callback = invocation.getArgument(0);
    return callback.doInTransaction(mock(TransactionStatus.class));
  }
}

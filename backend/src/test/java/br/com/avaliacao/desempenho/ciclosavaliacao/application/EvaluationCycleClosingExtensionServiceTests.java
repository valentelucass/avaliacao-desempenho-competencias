package br.com.avaliacao.desempenho.ciclosavaliacao.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleClosingExtension;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

class EvaluationCycleClosingExtensionServiceTests {
  private final EvaluationCycleAdministrationRepository repository =
      mock(EvaluationCycleAdministrationRepository.class);
  private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
  private final TransactionStatus transaction = mock(TransactionStatus.class);
  private final EvaluationCycleAdministrationService service =
      new EvaluationCycleAdministrationService(repository, new TransactionTemplate(manager));
  private final UUID cycle = UUID.randomUUID();
  private final UUID actor = UUID.randomUUID();
  private final EvaluationCycleClosingExtension extension =
      new EvaluationCycleClosingExtension(
          LocalDateTime.parse("2026-10-30T23:59"),
          Instant.parse("2026-10-17T02:59:00Z"),
          "Motivo fictício QA");

  @Test
  void deniesTheOperationBeforeStartingATransactionWithoutCycleManagement() {
    assertThatThrownBy(
            () ->
                service.extendClosing(
                    cycle, extension, new EvaluationCycleCommandContext(actor, "qa")))
        .isInstanceOf(EvaluationCycleAdministrationException.class)
        .extracting(error -> ((EvaluationCycleAdministrationException) error).reason())
        .isEqualTo(EvaluationCycleAdministrationException.Reason.FORBIDDEN);
    verifyNoInteractions(repository, manager);
  }

  @Test
  void commitsTheSingleAuditedCommandAndNeverReplacesTheCycleConfiguration() {
    when(manager.getTransaction(any())).thenReturn(transaction);
    service.extendClosing(cycle, extension, context());
    verify(repository).extendClosing(cycle, extension, actor, "qa");
    verifyNoMoreInteractions(repository);
    verify(manager).commit(transaction);
    verify(manager, never()).rollback(any());
  }

  @Test
  void rollsBackWhenTheCommandOrItsDatabaseAuditFailsAndReturnsASafeFailure() {
    when(manager.getTransaction(any())).thenReturn(transaction);
    doThrow(new DataAccessResourceFailureException("private database detail"))
        .when(repository)
        .extendClosing(any(), any(), any(), any());
    assertThatThrownBy(() -> service.extendClosing(cycle, extension, context()))
        .isInstanceOf(EvaluationCycleAdministrationException.class)
        .hasMessageNotContaining("private database detail")
        .extracting(error -> ((EvaluationCycleAdministrationException) error).reason())
        .isEqualTo(EvaluationCycleAdministrationException.Reason.UNAVAILABLE);
    verify(manager).rollback(transaction);
    verify(manager, never()).commit(any());
  }

  @Test
  void preservesTheConcurrentUpdateConflictAndRollsBackTheTransaction() {
    when(manager.getTransaction(any())).thenReturn(transaction);
    doThrow(
            new EvaluationCycleAdministrationException(
                EvaluationCycleAdministrationException.Reason.EXTENSION_CONFLICT, "safe"))
        .when(repository)
        .extendClosing(any(), any(), any(), any());
    assertThatThrownBy(() -> service.extendClosing(cycle, extension, context()))
        .isInstanceOf(EvaluationCycleAdministrationException.class)
        .extracting(error -> ((EvaluationCycleAdministrationException) error).reason())
        .isEqualTo(EvaluationCycleAdministrationException.Reason.EXTENSION_CONFLICT);
    verify(manager).rollback(transaction);
    verify(manager, never()).commit(any());
  }

  private EvaluationCycleCommandContext context() {
    return new EvaluationCycleCommandContext(actor, "qa", Set.of("CICLOS.GERIR"));
  }
}

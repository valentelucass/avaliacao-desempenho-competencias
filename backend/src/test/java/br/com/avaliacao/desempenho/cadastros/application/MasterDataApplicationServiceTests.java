package br.com.avaliacao.desempenho.cadastros.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.cadastros.application.MasterDataRepository.ManagerAssignmentRecord;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class MasterDataApplicationServiceTests {

  private final MasterDataRepository repository = mock(MasterDataRepository.class);
  private final TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
  private final MasterDataApplicationService service =
      new MasterDataApplicationService(repository, transactionTemplate);

  @Test
  void createsAnAuditedManagerAssignmentWithTheAuthenticatedActor() {
    UUID actor = UUID.randomUUID();
    UUID manager = UUID.randomUUID();
    UUID collaborator = UUID.randomUUID();
    MasterDataCommandContext context = new MasterDataCommandContext(actor, "request-1");
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.createManagerAssignment(any())).thenReturn(true);

    UUID assignmentId =
        service.createManagerAssignment(manager, collaborator, LocalDate.of(2026, 9, 1), context);

    ArgumentCaptor<ManagerAssignmentRecord> assignment =
        ArgumentCaptor.forClass(ManagerAssignmentRecord.class);
    verify(repository).createManagerAssignment(assignment.capture());
    verify(repository)
        .writeAdministrativeAudit(
            actor,
            "VINCULO.GESTOR_COLABORADOR.CRIAR",
            "VINCULO_GESTOR_COLABORADOR",
            assignmentId,
            "request-1");
    assertThat(assignment.getValue())
        .isEqualTo(
            new ManagerAssignmentRecord(
                assignmentId, manager, collaborator, LocalDate.of(2026, 9, 1), actor));
  }

  @Test
  void turnsAConstraintFailureIntoASafeConflict() {
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.createBranch(any()))
        .thenThrow(new DataIntegrityViolationException("constraint detail must not escape"));

    assertThatThrownBy(
            () ->
                service.createBranch(
                    "Filial Norte", new MasterDataCommandContext(UUID.randomUUID(), "request-2")))
        .isInstanceOf(MasterDataException.class)
        .extracting(exception -> ((MasterDataException) exception).reason())
        .isEqualTo(MasterDataException.Reason.CONFLICT);
  }

  @Test
  void deletesOnlyAnInactiveAndUnusedBranchWithAdministrativeAudit() {
    UUID actor = UUID.randomUUID();
    UUID branch = UUID.randomUUID();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.deleteInactiveUnusedBranch(branch)).thenReturn(true);

    service.deleteInactiveUnusedBranch(branch, new MasterDataCommandContext(actor, "request-3"));

    verify(repository).deleteInactiveUnusedBranch(branch);
    verify(repository)
        .writeAdministrativeAudit(actor, "CADASTRO.FILIAL.EXCLUIR", "FILIAL", branch, "request-3");
  }

  private Object runTransaction(org.mockito.invocation.InvocationOnMock invocation)
      throws Throwable {
    TransactionCallback<Object> callback = invocation.getArgument(0);
    return callback.doInTransaction(mock(TransactionStatus.class));
  }
}

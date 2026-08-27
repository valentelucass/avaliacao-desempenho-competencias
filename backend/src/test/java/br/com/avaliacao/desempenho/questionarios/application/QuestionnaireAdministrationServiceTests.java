package br.com.avaliacao.desempenho.questionarios.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.questionarios.application.QuestionnaireAdministrationException.Reason;
import br.com.avaliacao.desempenho.questionarios.application.QuestionnaireAdministrationRepository.CreatedQuestionnaireVersion;
import br.com.avaliacao.desempenho.questionarios.domain.model.QuestionnaireVersionDraft;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.mockito.invocation.InvocationOnMock;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class QuestionnaireAdministrationServiceTests {

  private final QuestionnaireAdministrationRepository repository =
      mock(QuestionnaireAdministrationRepository.class);
  private final TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
  private final QuestionnaireAdministrationService service =
      new QuestionnaireAdministrationService(repository, transactionTemplate);

  @Test
  void createsTheFrozenVersionAndAuditsEveryVersionedArtifactInTheSameTransaction() {
    UUID actor = UUID.randomUUID();
    QuestionnaireCommandContext context = new QuestionnaireCommandContext(actor, "request-123");
    QuestionnaireVersionDraft draft = validDraft();
    CreatedQuestionnaireVersion created =
        new CreatedQuestionnaireVersion(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.createFrozenVersion(draft, actor)).thenReturn(created);

    CreatedQuestionnaireVersion result = service.createFrozenVersion(draft, context);

    assertThat(result).isEqualTo(created);
    InOrder order = inOrder(repository);
    order.verify(repository).createFrozenVersion(draft, actor);
    order
        .verify(repository)
        .writeAdministrativeAudit(
            actor,
            "QUESTIONARIO.VERSAO.CRIAR_APROVAR",
            "VERSAO_QUESTIONARIO",
            created.questionnaireVersionId(),
            "request-123");
    order
        .verify(repository)
        .writeAdministrativeAudit(
            actor,
            "CONFIGURACAO_CALCULO.CRIAR_APROVAR",
            "CONFIGURACAO_CALCULO_VERSAO",
            created.calculationConfigurationVersionId(),
            "request-123");
    order
        .verify(repository)
        .writeAdministrativeAudit(
            actor,
            "MATRIZ_CLASSIFICACAO.CRIAR_APROVAR",
            "MATRIZ_CLASSIFICACAO_VERSAO",
            created.classificationMatrixVersionId(),
            "request-123");
  }

  @Test
  void turnsAConstraintFailureIntoASafeConflictWithoutWritingAudit() {
    QuestionnaireVersionDraft draft = validDraft();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.createFrozenVersion(any(), any()))
        .thenThrow(new DataIntegrityViolationException("internal constraint detail"));

    assertThatThrownBy(
            () ->
                service.createFrozenVersion(
                    draft, new QuestionnaireCommandContext(UUID.randomUUID(), "request-456")))
        .isInstanceOf(QuestionnaireAdministrationException.class)
        .extracting(exception -> ((QuestionnaireAdministrationException) exception).reason())
        .isEqualTo(Reason.CONFLICT);

    verify(repository, never()).writeAdministrativeAudit(any(), any(), any(), any(), any());
  }

  @Test
  void auditsOnlyTheQuestionnaireWhenTheFrozenCalculationAndMatrixAreReused() {
    UUID actor = UUID.randomUUID();
    QuestionnaireVersionDraft draft = validDraft();
    CreatedQuestionnaireVersion created =
        new CreatedQuestionnaireVersion(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), false, false);
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.createFrozenVersion(draft, actor)).thenReturn(created);

    service.createFrozenVersion(draft, new QuestionnaireCommandContext(actor, "request-789"));

    verify(repository)
        .writeAdministrativeAudit(
            actor,
            "QUESTIONARIO.VERSAO.CRIAR_APROVAR",
            "VERSAO_QUESTIONARIO",
            created.questionnaireVersionId(),
            "request-789");
    verify(repository, never())
        .writeAdministrativeAudit(
            actor,
            "CONFIGURACAO_CALCULO.CRIAR_APROVAR",
            "CONFIGURACAO_CALCULO_VERSAO",
            created.calculationConfigurationVersionId(),
            "request-789");
    verify(repository, never())
        .writeAdministrativeAudit(
            actor,
            "MATRIZ_CLASSIFICACAO.CRIAR_APROVAR",
            "MATRIZ_CLASSIFICACAO_VERSAO",
            created.classificationMatrixVersionId(),
            "request-789");
  }

  private static QuestionnaireVersionDraft validDraft() {
    return new QuestionnaireVersionDraft(
        new QuestionnaireVersionDraft.QuestionnaireDraft("GESTAO", "Gestão"),
        1,
        "Avaliação de gestão",
        null,
        new QuestionnaireVersionDraft.CalculationDraft("MEDIA_SIMPLES_2024_1", 1),
        1,
        List.of(
            new QuestionnaireVersionDraft.CompetencyDraft(
                "LIDERANCA",
                "Liderança",
                1,
                null,
                1,
                List.of(
                    new QuestionnaireVersionDraft.QuestionDraft(
                        "LIDERANCA_01", "O gestor desenvolve a equipe?", null, 1)))));
  }

  private Object runTransaction(InvocationOnMock invocation) throws Throwable {
    TransactionCallback<Object> callback = invocation.getArgument(0);
    return callback.doInTransaction(mock(TransactionStatus.class));
  }
}

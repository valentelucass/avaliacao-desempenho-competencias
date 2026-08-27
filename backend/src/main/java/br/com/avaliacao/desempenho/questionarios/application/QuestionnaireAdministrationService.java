package br.com.avaliacao.desempenho.questionarios.application;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.questionarios.application.QuestionnaireAdministrationException.Reason;
import br.com.avaliacao.desempenho.questionarios.domain.model.QuestionnaireVersionDraft;
import java.util.Objects;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Aprova a versão somente depois de gravar todo o conteúdo e os parâmetros 2024.1. */
@Service
@ConditionalOnSqlServerPersistence
public class QuestionnaireAdministrationService {

  private final QuestionnaireAdministrationRepository repository;
  private final TransactionTemplate transactionTemplate;

  public QuestionnaireAdministrationService(
      QuestionnaireAdministrationRepository repository, TransactionTemplate transactionTemplate) {
    this.repository = Objects.requireNonNull(repository, "repositório não pode ser nulo");
    this.transactionTemplate =
        Objects.requireNonNull(transactionTemplate, "transação não pode ser nula");
  }

  public QuestionnaireAdministrationRepository.CreatedQuestionnaireVersion createFrozenVersion(
      QuestionnaireVersionDraft draft, QuestionnaireCommandContext context) {
    QuestionnaireVersionDraft safeDraft = Objects.requireNonNull(draft, "versão não pode ser nula");
    QuestionnaireCommandContext commandContext =
        Objects.requireNonNull(context, "contexto de comando não pode ser nulo");
    try {
      return Objects.requireNonNull(
          transactionTemplate.execute(
              ignored -> {
                QuestionnaireAdministrationRepository.CreatedQuestionnaireVersion created =
                    repository.createFrozenVersion(safeDraft, commandContext.actorUserId());
                repository.writeAdministrativeAudit(
                    commandContext.actorUserId(),
                    "QUESTIONARIO.VERSAO.CRIAR_APROVAR",
                    "VERSAO_QUESTIONARIO",
                    created.questionnaireVersionId(),
                    commandContext.requestId());
                if (created.calculationConfigurationCreated()) {
                  repository.writeAdministrativeAudit(
                      commandContext.actorUserId(),
                      "CONFIGURACAO_CALCULO.CRIAR_APROVAR",
                      "CONFIGURACAO_CALCULO_VERSAO",
                      created.calculationConfigurationVersionId(),
                      commandContext.requestId());
                }
                if (created.classificationMatrixCreated()) {
                  repository.writeAdministrativeAudit(
                      commandContext.actorUserId(),
                      "MATRIZ_CLASSIFICACAO.CRIAR_APROVAR",
                      "MATRIZ_CLASSIFICACAO_VERSAO",
                      created.classificationMatrixVersionId(),
                      commandContext.requestId());
                }
                return created;
              }));
    } catch (DataIntegrityViolationException exception) {
      throw new QuestionnaireAdministrationException(
          Reason.CONFLICT, "A versão conflita com o catálogo ou versão já existente.");
    } catch (DataAccessException exception) {
      throw new QuestionnaireAdministrationException(
          Reason.UNAVAILABLE, "A infraestrutura de persistência não está disponível.");
    }
  }
}

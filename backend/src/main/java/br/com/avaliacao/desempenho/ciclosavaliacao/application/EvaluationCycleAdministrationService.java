package br.com.avaliacao.desempenho.ciclosavaliacao.application;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationException.Reason;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.CycleRuleViolation;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleConfigurationDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleLifecycle;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Administra rascunhos e transições imutáveis de ciclo, sempre com autoria registrada. */
@Service
@ConditionalOnSqlServerPersistence
public class EvaluationCycleAdministrationService {

  private final EvaluationCycleAdministrationRepository repository;
  private final TransactionTemplate transactionTemplate;
  private final EvaluationCycleLifecycle lifecycle;

  public EvaluationCycleAdministrationService(
      EvaluationCycleAdministrationRepository repository, TransactionTemplate transactionTemplate) {
    this.repository = Objects.requireNonNull(repository, "repositório não pode ser nulo");
    this.transactionTemplate =
        Objects.requireNonNull(transactionTemplate, "transação não pode ser nula");
    this.lifecycle = new EvaluationCycleLifecycle();
  }

  public EvaluationCycleAdministrationRepository.CreatedCycle createDraftCycle(
      EvaluationCycleDraft draft, EvaluationCycleCommandContext context) {
    EvaluationCycleDraft safeDraft = Objects.requireNonNull(draft, "ciclo não pode ser nulo");
    EvaluationCycleCommandContext commandContext = context(context);
    try {
      return Objects.requireNonNull(
          transactionTemplate.execute(
              ignored -> {
                EvaluationCycleAdministrationRepository.CreatedCycle created =
                    repository.createDraftCycle(
                        safeDraft, commandContext.actorUserId(), commandContext.requestId());
                repository.writeAdministrativeAudit(
                    commandContext.actorUserId(),
                    "CICLO.CRIAR",
                    "CICLO_AVALIACAO",
                    created.cycleId(),
                    commandContext.requestId());
                return created;
              }));
    } catch (DataIntegrityViolationException exception) {
      throw conflict();
    } catch (DataAccessException exception) {
      throw unavailable();
    }
  }

  public void replaceDraftConfiguration(
      UUID cycleId,
      EvaluationCycleConfigurationDraft configuration,
      EvaluationCycleCommandContext context) {
    UUID id = Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");
    EvaluationCycleConfigurationDraft safeConfiguration =
        Objects.requireNonNull(configuration, "configuração não pode ser nula");
    EvaluationCycleCommandContext commandContext = context(context);
    try {
      Boolean changed =
          transactionTemplate.execute(
              ignored -> {
                if (!repository.replaceDraftConfiguration(
                    id, safeConfiguration, commandContext.actorUserId())) {
                  throw conflict();
                }
                repository.writeAdministrativeAudit(
                    commandContext.actorUserId(),
                    "CICLO.ALTERAR",
                    "CICLO_AVALIACAO",
                    id,
                    commandContext.requestId());
                return Boolean.TRUE;
              });
      Objects.requireNonNull(changed, "a transação de ciclo não produziu resultado");
    } catch (DataIntegrityViolationException exception) {
      throw conflict();
    } catch (DataAccessException exception) {
      throw unavailable();
    }
  }

  public void openCycle(UUID cycleId, EvaluationCycleCommandContext context) {
    transition(cycleId, context, lifecycle::open, "CICLO.ABRIR");
  }

  public void closeCycle(UUID cycleId, EvaluationCycleCommandContext context) {
    transition(cycleId, context, lifecycle::close, "CICLO.ENCERRAR");
  }

  private void transition(
      UUID cycleId,
      EvaluationCycleCommandContext context,
      Function<EvaluationCycleStatus, EvaluationCycleStatus> transition,
      String auditAction) {
    UUID id = Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");
    EvaluationCycleCommandContext commandContext = context(context);
    try {
      Boolean changed =
          transactionTemplate.execute(
              ignored -> {
                EvaluationCycleStatus sourceStatus =
                    repository
                        .lockCurrentStatus(id)
                        .orElseThrow(EvaluationCycleAdministrationService::conflict);
                EvaluationCycleStatus targetStatus;
                try {
                  targetStatus = transition.apply(sourceStatus);
                } catch (CycleRuleViolation exception) {
                  throw conflict();
                }
                if (!repository.transition(
                    id,
                    sourceStatus,
                    targetStatus,
                    commandContext.actorUserId(),
                    commandContext.requestId())) {
                  throw conflict();
                }
                repository.writeAdministrativeAudit(
                    commandContext.actorUserId(),
                    auditAction,
                    "CICLO_AVALIACAO",
                    id,
                    commandContext.requestId());
                return Boolean.TRUE;
              });
      Objects.requireNonNull(changed, "a transação de ciclo não produziu resultado");
    } catch (DataIntegrityViolationException exception) {
      throw conflict();
    } catch (DataAccessException exception) {
      throw unavailable();
    }
  }

  private static EvaluationCycleCommandContext context(EvaluationCycleCommandContext context) {
    return Objects.requireNonNull(context, "contexto de comando não pode ser nulo");
  }

  private static EvaluationCycleAdministrationException conflict() {
    return new EvaluationCycleAdministrationException(
        Reason.CONFLICT, "A operação conflita com o estado atual do ciclo.");
  }

  private static EvaluationCycleAdministrationException unavailable() {
    return new EvaluationCycleAdministrationException(
        Reason.UNAVAILABLE, "A infraestrutura de persistência não está disponível.");
  }
}

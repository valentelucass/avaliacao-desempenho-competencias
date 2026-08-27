package br.com.avaliacao.desempenho.cadastros.application;

import br.com.avaliacao.desempenho.cadastros.application.MasterDataException.Reason;
import br.com.avaliacao.desempenho.cadastros.domain.model.MasterDataInput;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Casos de uso de cadastro que preservam o registro original e registram toda mutação. */
@Service
@ConditionalOnSqlServerPersistence
public class MasterDataApplicationService {

  private final MasterDataRepository repository;
  private final TransactionTemplate transactionTemplate;

  public MasterDataApplicationService(
      MasterDataRepository repository, TransactionTemplate transactionTemplate) {
    this.repository = Objects.requireNonNull(repository, "repositório não pode ser nulo");
    this.transactionTemplate =
        Objects.requireNonNull(transactionTemplate, "transação não pode ser nula");
  }

  public UUID createBranch(String name, MasterDataCommandContext context) {
    UUID id = UUID.randomUUID();
    MasterDataRepository.NamedRecord branch =
        new MasterDataRepository.NamedRecord(id, MasterDataInput.requiredText(name, "nome", 200));
    return write(
        () -> {
          requireChange(repository.createBranch(branch));
          audit(context, "CADASTRO.FILIAL.CRIAR", "FILIAL", id);
          return id;
        });
  }

  public void deactivateBranch(UUID branchId, MasterDataCommandContext context) {
    UUID id = MasterDataInput.requiredId(branchId, "filial");
    write(
        () -> {
          requireChange(repository.deactivateBranch(id));
          audit(context, "CADASTRO.FILIAL.ENCERRAR", "FILIAL", id);
          return Boolean.TRUE;
        });
  }

  /** Exclui apenas cadastro inativo e sem uso; lotações e seus históricos nunca são removidos. */
  public void deleteInactiveUnusedBranch(UUID branchId, MasterDataCommandContext context) {
    UUID id = MasterDataInput.requiredId(branchId, "filial");
    write(
        () -> {
          requireChange(repository.deleteInactiveUnusedBranch(id));
          audit(context, "CADASTRO.FILIAL.EXCLUIR", "FILIAL", id);
          return Boolean.TRUE;
        });
  }

  public UUID createArea(String name, MasterDataCommandContext context) {
    UUID id = UUID.randomUUID();
    MasterDataRepository.NamedRecord area =
        new MasterDataRepository.NamedRecord(id, MasterDataInput.requiredText(name, "nome", 200));
    return write(
        () -> {
          requireChange(repository.createArea(area));
          audit(context, "CADASTRO.AREA.CRIAR", "AREA", id);
          return id;
        });
  }

  public void deactivateArea(UUID areaId, MasterDataCommandContext context) {
    UUID id = MasterDataInput.requiredId(areaId, "área");
    write(
        () -> {
          requireChange(repository.deactivateArea(id));
          audit(context, "CADASTRO.AREA.ENCERRAR", "AREA", id);
          return Boolean.TRUE;
        });
  }

  public UUID createCollaborator(String displayName, MasterDataCommandContext context) {
    UUID id = UUID.randomUUID();
    MasterDataRepository.NamedRecord collaborator =
        new MasterDataRepository.NamedRecord(
            id, MasterDataInput.requiredText(displayName, "nomeExibicao", 200));
    return write(
        () -> {
          requireChange(repository.createCollaborator(collaborator));
          audit(context, "CADASTRO.COLABORADOR.CRIAR", "COLABORADOR", id);
          return id;
        });
  }

  public void deactivateCollaborator(UUID collaboratorId, MasterDataCommandContext context) {
    UUID id = MasterDataInput.requiredId(collaboratorId, "colaborador");
    write(
        () -> {
          requireChange(repository.deactivateCollaborator(id));
          audit(context, "CADASTRO.COLABORADOR.ENCERRAR", "COLABORADOR", id);
          return Boolean.TRUE;
        });
  }

  public UUID createAllocation(
      UUID collaboratorId,
      UUID branchId,
      UUID areaId,
      String managerText,
      LocalDate startsOn,
      MasterDataCommandContext context) {
    UUID id = UUID.randomUUID();
    MasterDataRepository.AllocationRecord allocation =
        new MasterDataRepository.AllocationRecord(
            id,
            MasterDataInput.requiredId(collaboratorId, "colaborador"),
            branchId,
            areaId,
            MasterDataInput.optionalText(managerText, "gestorTexto", 200),
            MasterDataInput.requiredDate(startsOn, "inicioVigencia"),
            context(context).actorUserId());
    return write(
        () -> {
          requireChange(repository.createAllocation(allocation));
          audit(context, "CADASTRO.LOTACAO.CRIAR", "LOTACAO_COLABORADOR", id);
          return id;
        });
  }

  public void closeAllocation(
      UUID allocationId, LocalDate endsOn, MasterDataCommandContext context) {
    UUID id = MasterDataInput.requiredId(allocationId, "lotação");
    LocalDate closingDate = MasterDataInput.requiredDate(endsOn, "fimVigencia");
    MasterDataCommandContext commandContext = context(context);
    write(
        () -> {
          requireChange(repository.closeAllocation(id, closingDate, commandContext.actorUserId()));
          audit(commandContext, "CADASTRO.LOTACAO.ENCERRAR", "LOTACAO_COLABORADOR", id);
          return Boolean.TRUE;
        });
  }

  public UUID createManagerAssignment(
      UUID managerUserId,
      UUID collaboratorId,
      LocalDate startsOn,
      MasterDataCommandContext context) {
    MasterDataCommandContext commandContext = context(context);
    UUID id = UUID.randomUUID();
    MasterDataRepository.ManagerAssignmentRecord assignment =
        new MasterDataRepository.ManagerAssignmentRecord(
            id,
            MasterDataInput.requiredId(managerUserId, "gestor"),
            MasterDataInput.requiredId(collaboratorId, "colaborador"),
            MasterDataInput.requiredDate(startsOn, "inicioVigencia"),
            commandContext.actorUserId());
    return write(
        () -> {
          requireChange(repository.createManagerAssignment(assignment));
          audit(
              commandContext, "VINCULO.GESTOR_COLABORADOR.CRIAR", "VINCULO_GESTOR_COLABORADOR", id);
          return id;
        });
  }

  public void closeManagerAssignment(
      UUID assignmentId, LocalDate endsOn, MasterDataCommandContext context) {
    UUID id = MasterDataInput.requiredId(assignmentId, "vínculo de gestor");
    LocalDate closingDate = MasterDataInput.requiredDate(endsOn, "fimVigencia");
    MasterDataCommandContext commandContext = context(context);
    write(
        () -> {
          requireChange(
              repository.closeManagerAssignment(id, closingDate, commandContext.actorUserId()));
          audit(
              commandContext,
              "VINCULO.GESTOR_COLABORADOR.ENCERRAR",
              "VINCULO_GESTOR_COLABORADOR",
              id);
          return Boolean.TRUE;
        });
  }

  public UUID createUserCollaboratorLink(
      UUID userId, UUID collaboratorId, LocalDate startsOn, MasterDataCommandContext context) {
    MasterDataCommandContext commandContext = context(context);
    UUID id = UUID.randomUUID();
    MasterDataRepository.UserCollaboratorLinkRecord link =
        new MasterDataRepository.UserCollaboratorLinkRecord(
            id,
            MasterDataInput.requiredId(userId, "usuário"),
            MasterDataInput.requiredId(collaboratorId, "colaborador"),
            MasterDataInput.requiredDate(startsOn, "inicioVigencia"),
            commandContext.actorUserId());
    return write(
        () -> {
          requireChange(repository.createUserCollaboratorLink(link));
          audit(
              commandContext,
              "VINCULO.USUARIO_COLABORADOR.CRIAR",
              "VINCULO_USUARIO_COLABORADOR",
              id);
          return id;
        });
  }

  public void closeUserCollaboratorLink(
      UUID linkId, LocalDate endsOn, MasterDataCommandContext context) {
    UUID id = MasterDataInput.requiredId(linkId, "vínculo de usuário");
    LocalDate closingDate = MasterDataInput.requiredDate(endsOn, "fimVigencia");
    MasterDataCommandContext commandContext = context(context);
    write(
        () -> {
          requireChange(
              repository.closeUserCollaboratorLink(id, closingDate, commandContext.actorUserId()));
          audit(
              commandContext,
              "VINCULO.USUARIO_COLABORADOR.ENCERRAR",
              "VINCULO_USUARIO_COLABORADOR",
              id);
          return Boolean.TRUE;
        });
  }

  public UUID createQuestionnaireAssignment(
      UUID cycleId,
      UUID collaboratorId,
      UUID cycleQuestionnaireId,
      MasterDataCommandContext context) {
    MasterDataCommandContext commandContext = context(context);
    UUID id = UUID.randomUUID();
    MasterDataRepository.QuestionnaireAssignmentRecord assignment =
        new MasterDataRepository.QuestionnaireAssignmentRecord(
            id,
            MasterDataInput.requiredId(cycleId, "ciclo"),
            MasterDataInput.requiredId(collaboratorId, "colaborador"),
            MasterDataInput.requiredId(cycleQuestionnaireId, "questionário do ciclo"),
            commandContext.actorUserId());
    return write(
        () -> {
          requireChange(repository.createQuestionnaireAssignment(assignment));
          audit(
              commandContext,
              "ATRIBUICAO.QUESTIONARIO.CRIAR",
              "ATRIBUICAO_QUESTIONARIO_COLABORADOR",
              id);
          return id;
        });
  }

  public void revokeQuestionnaireAssignment(
      UUID assignmentId, String reason, MasterDataCommandContext context) {
    UUID id = MasterDataInput.requiredId(assignmentId, "atribuição de questionário");
    String revocationReason = MasterDataInput.requiredText(reason, "motivo", 500);
    MasterDataCommandContext commandContext = context(context);
    write(
        () -> {
          requireChange(
              repository.revokeQuestionnaireAssignment(
                  id, revocationReason, commandContext.actorUserId()));
          audit(
              commandContext,
              "ATRIBUICAO.QUESTIONARIO.REVOGAR",
              "ATRIBUICAO_QUESTIONARIO_COLABORADOR",
              id);
          return Boolean.TRUE;
        });
  }

  private <T> T write(Supplier<T> operation) {
    try {
      return Objects.requireNonNull(transactionTemplate.execute(ignored -> operation.get()));
    } catch (DataIntegrityViolationException exception) {
      throw new MasterDataException(
          Reason.CONFLICT, "A operação conflita com o estado atual do cadastro.");
    } catch (DataAccessException exception) {
      throw new MasterDataException(
          Reason.UNAVAILABLE, "A infraestrutura de persistência não está disponível.");
    }
  }

  private static void requireChange(boolean changed) {
    if (!changed) {
      throw new MasterDataException(
          Reason.CONFLICT, "A operação não é válida para o estado atual do cadastro.");
    }
  }

  private static MasterDataCommandContext context(MasterDataCommandContext context) {
    return Objects.requireNonNull(context, "contexto de comando não pode ser nulo");
  }

  private void audit(
      MasterDataCommandContext context, String action, String resourceType, UUID resourceId) {
    MasterDataCommandContext commandContext = context(context);
    repository.writeAdministrativeAudit(
        commandContext.actorUserId(), action, resourceType, resourceId, commandContext.requestId());
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.util.Collection;
import java.util.Objects;

/** Regras de continuidade do administrador supremo definidas na ADR-0003. */
public final class SupremeAdministratorPolicy {

  public void requireProductionReadiness(Collection<SupremeAdministrator> administrators) {
    if (activeAdministrators(administrators) < 2) {
      throw new DomainRuleViolation(
          "A produção exige pelo menos dois administradores supremos ativos.");
    }
  }

  public void requireDistinctRequesterAndApprover(String requesterUserId, String approverUserId) {
    String requester = requireUserId(requesterUserId, "solicitante");
    String approver = requireUserId(approverUserId, "aprovador");

    if (requester.equals(approver)) {
      throw new DomainRuleViolation("Solicitante e aprovador devem ser pessoas distintas.");
    }
  }

  public void requireRegularRemovalAllowed(
      SupremeAdministrator target, Collection<SupremeAdministrator> administrators) {
    Objects.requireNonNull(target, "target não pode ser nulo");

    if (target.protectedFromRegularRemoval()) {
      throw new DomainRuleViolation(
          "O administrador supremo inicial não pode ser removido pelo fluxo normal.");
    }

    if (target.active() && activeAdministrators(administrators) <= 1) {
      throw new DomainRuleViolation(
          "Não é permitido remover o último administrador supremo ativo.");
    }
  }

  public void requireDistinctRecoveryCustodians(
      String directorCustodianUserId,
      String platformCustodianUserId,
      String affectedAdministratorUserId) {
    String director = requireUserId(directorCustodianUserId, "custodiante da diretoria");
    String platform = requireUserId(platformCustodianUserId, "custodiante de plataforma");
    String affected = requireUserId(affectedAdministratorUserId, "administrador afetado");

    if (director.equals(platform) || director.equals(affected) || platform.equals(affected)) {
      throw new DomainRuleViolation(
          "Os dois custodiantes e o administrador afetado devem ser pessoas distintas.");
    }
  }

  private long activeAdministrators(Collection<SupremeAdministrator> administrators) {
    Objects.requireNonNull(administrators, "administrators não pode ser nulo");
    return administrators.stream().filter(SupremeAdministrator::active).count();
  }

  private String requireUserId(String userId, String fieldName) {
    if (userId == null || userId.isBlank()) {
      throw new IllegalArgumentException(fieldName + " não pode ser vazio");
    }
    return userId;
  }
}

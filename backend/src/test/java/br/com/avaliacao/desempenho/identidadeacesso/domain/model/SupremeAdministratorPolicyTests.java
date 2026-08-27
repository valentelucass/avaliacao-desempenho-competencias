package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class SupremeAdministratorPolicyTests {

  private final SupremeAdministratorPolicy policy = new SupremeAdministratorPolicy();

  @Test
  void rejectsProductionWithOnlyOneActiveSupremeAdministrator() {
    assertThatThrownBy(
            () -> policy.requireProductionReadiness(List.of(administrator("lucas", true, true))))
        .isInstanceOf(DomainRuleViolation.class);
  }

  @Test
  void acceptsProductionWithTwoActiveSupremeAdministrators() {
    assertThatCode(
            () ->
                policy.requireProductionReadiness(
                    List.of(
                        administrator("lucas", true, true), administrator("backup", true, false))))
        .doesNotThrowAnyException();
  }

  @Test
  void rejectsRegularRemovalOfProtectedInitialAdministrator() {
    SupremeAdministrator lucas = administrator("lucas", true, true);

    assertThatThrownBy(
            () ->
                policy.requireRegularRemovalAllowed(
                    lucas, List.of(lucas, administrator("backup", true, false))))
        .isInstanceOf(DomainRuleViolation.class);
  }

  @Test
  void rejectsRemovalOfLastActiveSupremeAdministrator() {
    SupremeAdministrator backup = administrator("backup", true, false);

    assertThatThrownBy(() -> policy.requireRegularRemovalAllowed(backup, List.of(backup)))
        .isInstanceOf(DomainRuleViolation.class);
  }

  @Test
  void rejectsSelfApproval() {
    assertThatThrownBy(() -> policy.requireDistinctRequesterAndApprover("lucas", "lucas"))
        .isInstanceOf(DomainRuleViolation.class);
  }

  @Test
  void rejectsRecoveryWithAnAffectedCustodian() {
    assertThatThrownBy(
            () -> policy.requireDistinctRecoveryCustodians("director", "platform", "platform"))
        .isInstanceOf(DomainRuleViolation.class);
  }

  private SupremeAdministrator administrator(
      String userId, boolean active, boolean protectedFromRegularRemoval) {
    return new SupremeAdministrator(userId, active, protectedFromRegularRemoval);
  }
}

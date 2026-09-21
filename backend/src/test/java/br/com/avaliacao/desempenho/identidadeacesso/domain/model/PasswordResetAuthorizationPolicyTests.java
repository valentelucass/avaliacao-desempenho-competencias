package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PasswordResetAuthorizationPolicyTests {

  private final PasswordResetAuthorizationPolicy policy = new PasswordResetAuthorizationPolicy();

  @Test
  void supremeAdministratorMayResetAndConfigureAnEligibleOrdinaryAccount() {
    PasswordResetAuthorizationPolicy.Actor supreme = actor(true, Set.of());
    PasswordResetAuthorizationPolicy.Target target = ordinaryTarget();

    assertThat(policy.mayListPendingRequests(supreme)).isTrue();
    assertThat(policy.mayResetPassword(supreme, target)).isTrue();
    assertThat(
            policy.mayReplaceDelegation(
                supreme, target, new PasswordResetAuthorizationPolicy.Delegation(true, true)))
        .isTrue();
  }

  @Test
  void delegatedOperatorMayResetButCannotGrantWithoutTheDelegationCapability() {
    PasswordResetAuthorizationPolicy.Actor delegated =
        actor(false, Set.of(PasswordResetAuthorizationPolicy.RESET_PASSWORD));
    PasswordResetAuthorizationPolicy.Target target = ordinaryTarget();

    assertThat(policy.mayListPendingRequests(delegated)).isTrue();
    assertThat(policy.mayResetPassword(delegated, target)).isTrue();
    assertThat(
            policy.mayReplaceDelegation(
                delegated, target, new PasswordResetAuthorizationPolicy.Delegation(true, false)))
        .isFalse();
  }

  @Test
  void delegationManagerCanGrantOnlyTheResetCapability() {
    PasswordResetAuthorizationPolicy.Actor manager =
        actor(
            false,
            Set.of(
                PasswordResetAuthorizationPolicy.RESET_PASSWORD,
                PasswordResetAuthorizationPolicy.DELEGATE_PASSWORD_RESET));
    PasswordResetAuthorizationPolicy.Target target = ordinaryTarget();

    assertThat(
            policy.mayReplaceDelegation(
                manager, target, new PasswordResetAuthorizationPolicy.Delegation(true, false)))
        .isTrue();
    assertThat(
            policy.mayReplaceDelegation(
                manager, target, new PasswordResetAuthorizationPolicy.Delegation(true, true)))
        .isFalse();
  }

  @Test
  void delegatedOperatorCannotHandleTechnicalAccountsOrDelegationManagers() {
    PasswordResetAuthorizationPolicy.Actor delegated =
        actor(false, Set.of(PasswordResetAuthorizationPolicy.RESET_PASSWORD));
    PasswordResetAuthorizationPolicy.Target technical =
        target(Set.of("ADMINISTRADOR_PLATAFORMA"), Set.of());
    PasswordResetAuthorizationPolicy.Target delegationManager =
        target(
            Set.of("GERENCIA_RH"),
            Set.of(PasswordResetAuthorizationPolicy.DELEGATE_PASSWORD_RESET));

    assertThat(policy.mayResetPassword(delegated, technical)).isFalse();
    assertThat(policy.mayResetPassword(delegated, delegationManager)).isFalse();
  }

  @Test
  void rejectsSelfAndUnavailableTargetsEvenForTheSupremeAdministrator() {
    UUID userId = UUID.randomUUID();
    PasswordResetAuthorizationPolicy.Actor supreme =
        new PasswordResetAuthorizationPolicy.Actor(userId, true, Set.of());
    PasswordResetAuthorizationPolicy.Target self =
        new PasswordResetAuthorizationPolicy.Target(
            userId, AccountStatus.ACTIVE, false, false, Set.of("COLABORADOR"), Set.of());
    PasswordResetAuthorizationPolicy.Target blocked =
        new PasswordResetAuthorizationPolicy.Target(
            UUID.randomUUID(),
            AccountStatus.BLOCKED,
            false,
            false,
            Set.of("COLABORADOR"),
            Set.of());

    assertThat(policy.mayResetPassword(supreme, self)).isFalse();
    assertThat(policy.mayResetPassword(supreme, blocked)).isFalse();
  }

  private static PasswordResetAuthorizationPolicy.Actor actor(
      boolean supreme, Set<String> permissions) {
    return new PasswordResetAuthorizationPolicy.Actor(UUID.randomUUID(), supreme, permissions);
  }

  private static PasswordResetAuthorizationPolicy.Target ordinaryTarget() {
    return target(Set.of("COLABORADOR"), Set.of());
  }

  private static PasswordResetAuthorizationPolicy.Target target(
      Set<String> roles, Set<String> individualPermissions) {
    return new PasswordResetAuthorizationPolicy.Target(
        UUID.randomUUID(), AccountStatus.ACTIVE, false, false, roles, individualPermissions);
  }
}

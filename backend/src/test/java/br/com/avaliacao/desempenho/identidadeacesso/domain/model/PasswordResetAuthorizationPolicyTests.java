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

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.EnumSource(PlatformRole.class)
  void noCatalogRoleInheritsPasswordCapabilities(PlatformRole role) {
    Set<String> inherited =
        InitialRolePermissionCatalog.permissionsFor(role).stream()
            .map(PlatformPermission::code)
            .collect(java.util.stream.Collectors.toSet());
    var actor = actor(false, inherited);
    assertThat(policy.mayListPendingRequests(actor)).isFalse();
    assertThat(policy.mayResetPassword(actor, ordinaryTarget())).isFalse();
    assertThat(
            policy.mayReplaceDelegation(
                actor,
                ordinaryTarget(),
                new PasswordResetAuthorizationPolicy.Delegation(true, false)))
        .isFalse();
  }

  @Test
  void supremeAlsoRejectsTechnicalProtectedDeletedInactiveAndSelfTargetsForEveryWrite() {
    UUID id = UUID.randomUUID();
    var actor = new PasswordResetAuthorizationPolicy.Actor(id, true, Set.of());
    var targets =
        java.util.List.of(
            target(Set.of("ADMINISTRADOR_PLATAFORMA"), Set.of()),
            new PasswordResetAuthorizationPolicy.Target(
                id, AccountStatus.ACTIVE, false, false, Set.of(), Set.of()),
            new PasswordResetAuthorizationPolicy.Target(
                UUID.randomUUID(), AccountStatus.ACTIVE, true, false, Set.of(), Set.of()),
            new PasswordResetAuthorizationPolicy.Target(
                UUID.randomUUID(), AccountStatus.ACTIVE, false, true, Set.of(), Set.of()),
            new PasswordResetAuthorizationPolicy.Target(
                UUID.randomUUID(), AccountStatus.DISABLED, false, false, Set.of(), Set.of()),
            new PasswordResetAuthorizationPolicy.Target(
                UUID.randomUUID(), AccountStatus.BLOCKED, false, false, Set.of(), Set.of()));
    for (var target : targets) {
      assertThat(policy.mayResetPassword(actor, target)).isFalse();
      assertThat(
              policy.mayReplaceDelegation(
                  actor, target, new PasswordResetAuthorizationPolicy.Delegation(false, false)))
          .isFalse();
    }
  }

  @Test
  void delegationAloneCannotReadResetOrGrantAndDelegatesCannotModifyAnotherDelegator() {
    var onlyDelegation =
        actor(false, Set.of(PasswordResetAuthorizationPolicy.DELEGATE_PASSWORD_RESET));
    assertThat(policy.mayListPendingRequests(onlyDelegation)).isFalse();
    assertThat(policy.mayResetPassword(onlyDelegation, ordinaryTarget())).isFalse();
    assertThat(
            policy.mayReplaceDelegation(
                onlyDelegation,
                ordinaryTarget(),
                new PasswordResetAuthorizationPolicy.Delegation(true, false)))
        .isFalse();
    var delegated =
        actor(
            false,
            Set.of(
                PasswordResetAuthorizationPolicy.RESET_PASSWORD,
                PasswordResetAuthorizationPolicy.DELEGATE_PASSWORD_RESET));
    var privileged =
        target(
            Set.of("DIRETORIA"), Set.of(PasswordResetAuthorizationPolicy.DELEGATE_PASSWORD_RESET));
    assertThat(
            policy.mayReplaceDelegation(
                delegated,
                privileged,
                new PasswordResetAuthorizationPolicy.Delegation(false, false)))
        .isFalse();
  }

  @Test
  void ignoresAccidentalRoleGrantsButHonorsOnlyIndividualAllowAndDeny() {
    Set<String> passwords =
        Set.of(
            PasswordResetAuthorizationPolicy.RESET_PASSWORD,
            PasswordResetAuthorizationPolicy.DELEGATE_PASSWORD_RESET);
    assertThat(EffectivePermissionPolicy.resolve(passwords, java.util.Map.of())).isEmpty();
    assertThat(
            EffectivePermissionPolicy.resolve(
                passwords,
                java.util.Map.of(
                    PasswordResetAuthorizationPolicy.RESET_PASSWORD, PermissionEffect.ALLOW,
                    PasswordResetAuthorizationPolicy.DELEGATE_PASSWORD_RESET,
                        PermissionEffect.DENY)))
        .containsExactly(PasswordResetAuthorizationPolicy.RESET_PASSWORD);
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

package br.com.avaliacao.desempenho.identidadeacesso.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.*;

class PasswordAdministrationRegressionTests {
  final UUID actor = UUID.randomUUID();
  final UUID target = UUID.randomUUID();
  final UserAdministrationRepository repository = mock(UserAdministrationRepository.class);
  final TransactionTemplate transaction = mock(TransactionTemplate.class);
  final UserAdministrationService service =
      new UserAdministrationService(repository, new BCryptPasswordEncoder(4), transaction);
  final Set<String> reset = Set.of("SENHAS.REDEFINIR");
  final Set<String> delegate = Set.of("SENHAS.REDEFINIR", "SENHAS.DELEGAR_REDEFINICAO");
  final UserAdministrationRepository.UserView ordinary =
      new UserAdministrationRepository.UserView(
          target,
          "fixture@example.invalid",
          "Conta fictícia",
          AccountStatus.ACTIVE,
          false,
          false,
          false,
          Set.of("COLABORADOR"),
          List.of(),
          Instant.EPOCH);

  @BeforeEach
  void setup() {
    when(transaction.execute(any()))
        .thenAnswer(
            call ->
                ((TransactionCallback<?>) call.getArgument(0))
                    .doInTransaction(mock(TransactionStatus.class)));
    when(repository.findUser(target)).thenReturn(Optional.of(ordinary));
    when(repository.passwordHashForReset(target))
        .thenReturn(Optional.of(new BCryptPasswordEncoder(4).encode(UUID.randomUUID().toString())));
    when(repository.lockPasswordResetTarget(target)).thenReturn(Optional.of(ordinary));
  }

  void operator(boolean supreme, Set<String> permissions) {
    when(repository.lockPasswordResetActor(actor))
        .thenReturn(
            Optional.of(new PasswordResetAuthorizationPolicy.Actor(actor, supreme, permissions)));
  }

  @Test
  void staleRequestPermissionsCannotSurviveRevocationBeforeTheTransaction() {
    operator(false, Set.of());
    assertThatThrownBy(
            () ->
                service.resetOrdinaryUserPassword(
                    target, UUID.randomUUID().toString(), actor, delegate, "fixture"))
        .isInstanceOf(UserAdministrationException.class);
    assertThatThrownBy(
            () ->
                service.replacePasswordResetDelegation(
                    target, true, false, actor, delegate, "fixture"))
        .isInstanceOf(UserAdministrationException.class);
    verify(repository, never()).resetOrdinaryUserPassword(any(), any(), any(), any(), anyBoolean());
    verify(repository, never()).replacePasswordResetDelegation(any(), any(), any(), anyBoolean());
    verify(repository, never()).revokeAllSessions(any(), any());
  }

  @Test
  void locksActorAndTargetBeforeResetAndRevokesBeforeAuditInTheSameTransaction() {
    operator(false, reset);
    when(repository.resetOrdinaryUserPassword(any(), any(), any(), any(), eq(false)))
        .thenReturn(Optional.of(ordinary));
    service.resetOrdinaryUserPassword(
        target, UUID.randomUUID().toString(), actor, reset, "fixture");
    var order = inOrder(transaction, repository);
    order.verify(transaction).execute(any());
    order.verify(repository).lockPasswordResetActor(actor);
    order.verify(repository).lockPasswordResetTarget(target);
    order
        .verify(repository)
        .resetOrdinaryUserPassword(eq(target), any(), eq("BCRYPT"), eq("strength=12"), eq(false));
    order.verify(repository).revokeAllSessions(target, "SENHA_REDEFINIDA_POR_DELEGACAO");
    order
        .verify(repository)
        .writeAdministrativeAudit(actor, "USUARIO.SENHA_REDEFINIR", "USUARIO", target, "fixture");
  }

  @Test
  void passwordOperatorCanReadOnlyScopedCollectionAndIndividuallyEligibleTarget() {
    operator(false, reset);
    when(repository.listPasswordResetTargets(actor, false)).thenReturn(List.of(ordinary));
    assertThat(service.listUsers(actor, reset)).containsExactly(ordinary);
    assertThat(service.getUser(target, actor, reset)).isEqualTo(ordinary);
    verify(repository, never()).listUsers();
    when(repository.lockPasswordResetTarget(target)).thenReturn(Optional.empty());
    assertThatThrownBy(() -> service.getUser(target, actor, reset))
        .isInstanceOf(UserAdministrationException.class);
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void missingOrIneligibleTargetCannotBeChangedEvenBySupreme(boolean supreme) {
    operator(supreme, delegate);
    when(repository.lockPasswordResetTarget(target)).thenReturn(Optional.empty());
    assertThatThrownBy(
            () ->
                service.resetOrdinaryUserPassword(
                    target, UUID.randomUUID().toString(), actor, delegate, "fixture"))
        .isInstanceOf(UserAdministrationException.class);
    assertThatThrownBy(
            () ->
                service.replacePasswordResetDelegation(
                    target, true, false, actor, delegate, "fixture"))
        .isInstanceOf(UserAdministrationException.class);
    verify(repository, never()).resetOrdinaryUserPassword(any(), any(), any(), any(), anyBoolean());
    verify(repository, never()).replacePasswordResetDelegation(any(), any(), any(), anyBoolean());
  }

  @Test
  void delegationRevocationAlwaysRevokesSessionsAndAudits() {
    operator(true, Set.of());
    when(repository.replacePasswordResetDelegation(any(), any(), any(), eq(true))).thenReturn(true);
    service.replacePasswordResetDelegation(target, false, false, actor, Set.of(), "fixture");
    verify(repository).revokeAllSessions(target, "DELEGACAO_REDEFINICAO_SENHA_ALTERADA");
    verify(repository)
        .writeAdministrativeAudit(
            actor, "USUARIO.SENHA.DELEGACAO_ALTERAR", "USUARIO", target, "fixture");
  }

  @Test
  void legacyAdministrativeResetCannotReuseCurrentPassword() {
    operator(true, Set.of());
    String current = UUID.randomUUID().toString();
    when(repository.passwordHashForReset(target))
        .thenReturn(Optional.of(new BCryptPasswordEncoder(4).encode(current)));
    assertThatThrownBy(
            () -> service.resetOrdinaryUserPassword(target, current, actor, Set.of(), "fixture"))
        .isInstanceOf(UserAdministrationException.class);
    verify(repository, never()).resetOrdinaryUserPassword(any(), any(), any(), any(), anyBoolean());
    verify(repository, never()).revokeAllSessions(any(), any());
  }

  @Test
  void resetOnlyCannotGrantAndDelegatorCannotPropagateDelegation() {
    operator(false, reset);
    assertThatThrownBy(
            () ->
                service.replacePasswordResetDelegation(
                    target, true, false, actor, delegate, "fixture"))
        .isInstanceOf(UserAdministrationException.class);
    operator(false, delegate);
    assertThatThrownBy(
            () ->
                service.replacePasswordResetDelegation(
                    target, true, true, actor, delegate, "fixture"))
        .isInstanceOf(UserAdministrationException.class);
    verify(repository, never()).replacePasswordResetDelegation(any(), any(), any(), anyBoolean());
  }
}

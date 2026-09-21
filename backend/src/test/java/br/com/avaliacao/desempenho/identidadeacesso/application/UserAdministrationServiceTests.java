package br.com.avaliacao.desempenho.identidadeacesso.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationException.Reason;
import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationRepository.NewLocalUser;
import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationRepository.UserView;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PermissionEffect;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class UserAdministrationServiceTests {

  private final UserAdministrationRepository repository = mock(UserAdministrationRepository.class);
  private final TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
  private final UserAdministrationService service =
      new UserAdministrationService(repository, new BCryptPasswordEncoder(4), transactionTemplate);

  @Test
  void createsCommonUserWithNormalizedLoginAndForcedPasswordChange() {
    UUID actor = UUID.randomUUID();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.createLocalUser(any(), any()))
        .thenAnswer(
            invocation -> {
              NewLocalUser created = invocation.getArgument(0);
              return new UserView(
                  created.userId(),
                  created.normalizedLogin(),
                  created.displayName(),
                  AccountStatus.ACTIVE,
                  false,
                  false,
                  true,
                  Set.of(),
                  List.of(),
                  Instant.EPOCH);
            });
    when(repository.findUser(any()))
        .thenAnswer(
            invocation -> {
              UUID userId = invocation.getArgument(0);
              return Optional.of(
                  new UserView(
                      userId,
                      "ana.silva",
                      "Ana Silva",
                      AccountStatus.ACTIVE,
                      false,
                      false,
                      true,
                      Set.of(),
                      List.of(),
                      Instant.EPOCH));
            });
    when(repository.replaceAccess(any(), any(), any())).thenReturn(true);

    UserView created =
        service.createUser(
            "  ANA.SILVA  ",
            "  Ana Silva ",
            "senha-inicial-123",
            Set.of("COLABORADOR"),
            actor,
            Set.of("ADMINISTRADOR_PLATAFORMA"),
            Set.of("ACESSOS.NEGOCIO.GERIR"),
            "request");

    ArgumentCaptor<NewLocalUser> user = ArgumentCaptor.forClass(NewLocalUser.class);
    verify(repository).createLocalUser(user.capture(), org.mockito.ArgumentMatchers.eq(actor));
    assertThat(created.login()).isEqualTo("ana.silva");
    assertThat(created.passwordChangeRequired()).isTrue();
    assertThat(user.getValue().passwordHash()).isNotEqualTo("senha-inicial-123");
    assertThat(
            new BCryptPasswordEncoder(4)
                .matches("senha-inicial-123", user.getValue().passwordHash()))
        .isTrue();
  }

  @Test
  void assignsAnInitialAdministratorProfileOnlyThroughIntegralAccessManagement() {
    UUID actor = UUID.randomUUID();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.createLocalUser(any(), any()))
        .thenAnswer(
            invocation -> {
              NewLocalUser created = invocation.getArgument(0);
              return new UserView(
                  created.userId(),
                  created.normalizedLogin(),
                  created.displayName(),
                  AccountStatus.ACTIVE,
                  false,
                  false,
                  true,
                  Set.of(),
                  List.of(),
                  Instant.EPOCH);
            });
    when(repository.replaceAccess(any(), any(), any())).thenReturn(true);
    when(repository.findUser(any()))
        .thenReturn(
            Optional.of(
                new UserView(
                    UUID.randomUUID(),
                    "admin.novo",
                    "Admin novo",
                    AccountStatus.ACTIVE,
                    false,
                    false,
                    true,
                    Set.of("ADMINISTRADOR_PLATAFORMA"),
                    List.of(),
                    Instant.EPOCH)));

    service.createUser(
        "admin.novo",
        "Admin novo",
        "senha-inicial-123",
        Set.of("ADMINISTRADOR_PLATAFORMA"),
        actor,
        Set.of("ADMINISTRADOR_PLATAFORMA"),
        Set.of("USUARIOS.CRIAR", "ACESSOS.GERIR", "ACESSOS.NEGOCIO.GERIR"),
        "request");

    ArgumentCaptor<UserAdministrationRepository.AccessConfiguration> access =
        ArgumentCaptor.forClass(UserAdministrationRepository.AccessConfiguration.class);
    verify(repository)
        .replaceAccess(any(), access.capture(), org.mockito.ArgumentMatchers.eq(actor));
    assertThat(access.getValue().roleCodes()).containsExactly("ADMINISTRADOR_PLATAFORMA");
  }

  @Test
  void assignsAnInitialManagerProfileThroughAuthorizedBusinessAccessManagement() {
    UUID actor = UUID.randomUUID();
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.createLocalUser(any(), any()))
        .thenAnswer(
            invocation -> {
              NewLocalUser created = invocation.getArgument(0);
              return new UserView(
                  created.userId(),
                  created.normalizedLogin(),
                  created.displayName(),
                  AccountStatus.ACTIVE,
                  false,
                  false,
                  true,
                  Set.of(),
                  List.of(),
                  Instant.EPOCH);
            });
    when(repository.replaceAccess(any(), any(), any())).thenReturn(true);
    when(repository.findUser(any()))
        .thenReturn(
            Optional.of(
                new UserView(
                    UUID.randomUUID(),
                    "gestor.novo",
                    "Gestor novo",
                    AccountStatus.ACTIVE,
                    false,
                    false,
                    true,
                    Set.of("GESTOR"),
                    List.of(),
                    Instant.EPOCH)));

    service.createUser(
        "gestor.novo",
        "Gestor novo",
        "senha-inicial-123",
        Set.of("GESTOR"),
        actor,
        Set.of("GERENCIA_RH"),
        Set.of("USUARIOS.CRIAR", "ACESSOS.NEGOCIO.GERIR"),
        "request");

    ArgumentCaptor<UserAdministrationRepository.AccessConfiguration> access =
        ArgumentCaptor.forClass(UserAdministrationRepository.AccessConfiguration.class);
    verify(repository)
        .replaceAccess(any(), access.capture(), org.mockito.ArgumentMatchers.eq(actor));
    assertThat(access.getValue().roleCodes()).containsExactly("GESTOR");
  }

  @Test
  void rejectsInitialBusinessProfileWithoutBusinessAccessManagement() {
    UUID actor = UUID.randomUUID();

    assertThatThrownBy(
            () ->
                service.createUser(
                    "colaborador.novo",
                    "Colaborador novo",
                    "senha-inicial-123",
                    Set.of("COLABORADOR"),
                    actor,
                    Set.of("ADMINISTRADOR_PLATAFORMA"),
                    Set.of("USUARIOS.CRIAR", "ACESSOS.GERIR"),
                    "request"))
        .isInstanceOf(UserAdministrationException.class)
        .extracting(exception -> ((UserAdministrationException) exception).reason())
        .isEqualTo(Reason.FORBIDDEN);

    verifyNoInteractions(repository, transactionTemplate);
  }

  @Test
  void logicallyDeletesOnlyThroughTheRepositoryGuardAndRevokesSessions() {
    UUID actor = UUID.randomUUID();
    UUID target = UUID.randomUUID();
    UserView deleted =
        new UserView(
            target,
            "conta.excluida",
            "Conta excluída",
            AccountStatus.DISABLED,
            false,
            true,
            false,
            Set.of(),
            List.of(),
            Instant.EPOCH);
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.logicallyDeleteUser(target, actor)).thenReturn(Optional.of(deleted));

    assertThat(service.logicallyDeleteUser(target, true, actor, "request")).isEqualTo(deleted);

    verify(repository).revokeAllSessions(target, "USUARIO_EXCLUIDO_LOGICAMENTE");
    verify(repository)
        .writeAdministrativeAudit(
            actor, "USUARIO.EXCLUIR_LOGICAMENTE", "USUARIO", target, "request");
  }

  @Test
  void supremeAdministratorResetsAnOrdinaryPasswordAndRevokesEverySession() {
    UUID actor = UUID.randomUUID();
    UUID target = UUID.randomUUID();
    UserView resetUser =
        new UserView(
            target,
            "conta.recuperada",
            "Conta recuperada",
            AccountStatus.ACTIVE,
            false,
            false,
            true,
            Set.of("COLABORADOR"),
            List.of(),
            Instant.EPOCH);
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    when(repository.lockPasswordResetActor(actor))
        .thenReturn(
            Optional.of(
                new br.com.avaliacao.desempenho.identidadeacesso.domain.model
                    .PasswordResetAuthorizationPolicy.Actor(actor, true, Set.of())));
    when(repository.lockPasswordResetTarget(target)).thenReturn(Optional.of(resetUser));
    when(repository.passwordHashForReset(target))
        .thenReturn(Optional.of(new BCryptPasswordEncoder(4).encode(UUID.randomUUID().toString())));
    when(repository.findUser(target)).thenReturn(Optional.of(resetUser));
    when(repository.resetOrdinaryUserPassword(any(), any(), any(), any(), anyBoolean()))
        .thenReturn(Optional.of(resetUser));

    assertThat(
            service.resetOrdinaryUserPassword(
                target, "senha-temporaria-123", actor, Set.of(), "request"))
        .isEqualTo(resetUser);

    ArgumentCaptor<String> hash = ArgumentCaptor.forClass(String.class);
    verify(repository)
        .resetOrdinaryUserPassword(
            org.mockito.ArgumentMatchers.eq(target),
            hash.capture(),
            org.mockito.ArgumentMatchers.eq("BCRYPT"),
            org.mockito.ArgumentMatchers.eq("strength=12"),
            org.mockito.ArgumentMatchers.eq(true));
    assertThat(hash.getValue()).isNotEqualTo("senha-temporaria-123");
    assertThat(new BCryptPasswordEncoder(4).matches("senha-temporaria-123", hash.getValue()))
        .isTrue();
    verify(repository).revokeAllSessions(target, "SENHA_REDEFINIDA_ADMINISTRADOR_SUPREMO");
    verify(repository)
        .writeAdministrativeAudit(actor, "USUARIO.SENHA_REDEFINIR", "USUARIO", target, "request");
  }

  @Test
  void rejectsPasswordResetWhenActorIsNotTheSupremeAdministrator() {
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);
    UUID actor = UUID.randomUUID();
    UUID target = UUID.randomUUID();
    when(repository.findUser(target))
        .thenReturn(
            Optional.of(
                new UserView(
                    target,
                    "conta.comum",
                    "Conta comum",
                    AccountStatus.ACTIVE,
                    false,
                    false,
                    false,
                    Set.of("COLABORADOR"),
                    List.of(),
                    Instant.EPOCH)));

    assertThatThrownBy(
            () ->
                service.resetOrdinaryUserPassword(
                    target, "senha-temporaria-123", actor, Set.of(), "request"))
        .isInstanceOf(UserAdministrationException.class)
        .extracting(exception -> ((UserAdministrationException) exception).reason())
        .isEqualTo(Reason.FORBIDDEN);

    verify(repository).lockPasswordResetActor(actor);
  }

  @Test
  void delegationManagerMayGrantOnlyTheOrdinaryPasswordResetCapability() {
    UUID actor = UUID.randomUUID();
    UUID target = UUID.randomUUID();
    UserView targetUser =
        new UserView(
            target,
            "conta.rh",
            "Conta RH",
            AccountStatus.ACTIVE,
            false,
            false,
            false,
            Set.of("GERENCIA_RH"),
            List.of(),
            Instant.EPOCH);
    when(repository.findUser(target)).thenReturn(Optional.of(targetUser));
    when(repository.lockPasswordResetTarget(target)).thenReturn(Optional.of(targetUser));
    when(repository.lockPasswordResetActor(actor))
        .thenReturn(
            Optional.of(
                new br.com.avaliacao.desempenho.identidadeacesso.domain.model
                    .PasswordResetAuthorizationPolicy.Actor(
                    actor, false, Set.of("SENHAS.REDEFINIR", "SENHAS.DELEGAR_REDEFINICAO"))));
    when(repository.replacePasswordResetDelegation(any(), any(), any(), anyBoolean()))
        .thenReturn(true);
    when(transactionTemplate.execute(any())).thenAnswer(this::runTransaction);

    assertThat(
            service.replacePasswordResetDelegation(
                target,
                true,
                false,
                actor,
                Set.of("SENHAS.REDEFINIR", "SENHAS.DELEGAR_REDEFINICAO"),
                "request"))
        .isEqualTo(targetUser);

    verify(repository)
        .replacePasswordResetDelegation(
            org.mockito.ArgumentMatchers.eq(target),
            org.mockito.ArgumentMatchers.argThat(
                delegation ->
                    delegation.canResetPassword() && !delegation.canDelegatePasswordReset()),
            org.mockito.ArgumentMatchers.eq(actor),
            org.mockito.ArgumentMatchers.eq(false));
    verify(repository).revokeAllSessions(target, "DELEGACAO_REDEFINICAO_SENHA_ALTERADA");
    verify(repository)
        .writeAdministrativeAudit(
            actor, "USUARIO.SENHA.DELEGACAO_ALTERAR", "USUARIO", target, "request");
  }

  @Test
  void rejectsAccessConfigurationWithARepeatedIndividualPermission() {
    UUID actor = UUID.randomUUID();

    assertThatThrownBy(
            () ->
                service.replaceAccess(
                    UUID.randomUUID(),
                    Set.of("COLABORADOR"),
                    List.of(
                        new UserAdministrationRepository.IndividualPermission(
                            "INDICADORES.VISUALIZAR",
                            br.com.avaliacao.desempenho.identidadeacesso.domain.model
                                .PermissionEffect.ALLOW),
                        new UserAdministrationRepository.IndividualPermission(
                            "INDICADORES.VISUALIZAR",
                            br.com.avaliacao.desempenho.identidadeacesso.domain.model
                                .PermissionEffect.DENY)),
                    actor,
                    Set.of("ADMINISTRADOR_PLATAFORMA"),
                    Set.of("ACESSOS.GERIR"),
                    "request"))
        .isInstanceOf(UserAdministrationException.class)
        .extracting(exception -> ((UserAdministrationException) exception).reason())
        .isEqualTo(Reason.INVALID_INPUT);
  }

  @Test
  void rejectsReplacingRolesWhenItWouldLeaveAnIndividualIndicatorGrantWithoutRhOrBoardRole() {
    assertThatThrownBy(
            () ->
                service.replaceAccess(
                    UUID.randomUUID(),
                    Set.of("COLABORADOR"),
                    List.of(
                        new UserAdministrationRepository.IndividualPermission(
                            "DADOS.EXPORTAR", PermissionEffect.ALLOW)),
                    UUID.randomUUID(),
                    Set.of("ADMINISTRADOR_PLATAFORMA"),
                    Set.of("ACESSOS.GERIR"),
                    "request"))
        .isInstanceOf(UserAdministrationException.class)
        .extracting(exception -> ((UserAdministrationException) exception).reason())
        .isEqualTo(Reason.INVALID_INPUT);

    verifyNoInteractions(repository, transactionTemplate);
  }

  @Test
  void rejectsAPlatformOnlyActorFromGrantingBusinessAccess() {
    UUID actor = UUID.randomUUID();

    assertThatThrownBy(
            () ->
                service.replaceAccess(
                    UUID.randomUUID(),
                    Set.of("COLABORADOR"),
                    List.of(),
                    actor,
                    Set.of("ADMINISTRADOR_PLATAFORMA"),
                    Set.of("ACESSOS.GERIR"),
                    "request"))
        .isInstanceOf(UserAdministrationException.class)
        .extracting(exception -> ((UserAdministrationException) exception).reason())
        .isEqualTo(Reason.FORBIDDEN);

    verifyNoInteractions(repository, transactionTemplate);
  }

  @Test
  void rejectsSelfAccessReplacement() {
    UUID actor = UUID.randomUUID();

    assertThatThrownBy(
            () ->
                service.replaceAccess(
                    actor,
                    Set.of("ADMINISTRADOR_PLATAFORMA"),
                    List.of(),
                    actor,
                    Set.of("ADMINISTRADOR_PLATAFORMA"),
                    Set.of("ACESSOS.GERIR"),
                    "request"))
        .isInstanceOf(UserAdministrationException.class)
        .extracting(exception -> ((UserAdministrationException) exception).reason())
        .isEqualTo(Reason.FORBIDDEN);

    verifyNoInteractions(repository, transactionTemplate);
  }

  @Test
  void rejectsBusinessAccessWhenTheActorHasTheBusinessRoleButNotTheEffectiveGrant() {
    UUID actor = UUID.randomUUID();

    assertThatThrownBy(
            () ->
                service.replaceAccess(
                    UUID.randomUUID(),
                    Set.of("COLABORADOR"),
                    List.of(),
                    actor,
                    Set.of("GERENCIA_RH"),
                    Set.of("ACESSOS.GERIR"),
                    "request"))
        .isInstanceOf(UserAdministrationException.class)
        .extracting(exception -> ((UserAdministrationException) exception).reason())
        .isEqualTo(Reason.FORBIDDEN);

    verifyNoInteractions(repository, transactionTemplate);
  }

  private Object runTransaction(org.mockito.invocation.InvocationOnMock invocation)
      throws Throwable {
    TransactionCallback<Object> callback = invocation.getArgument(0);
    return callback.doInTransaction(mock(TransactionStatus.class));
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.identidadeacesso.api.*;
import br.com.avaliacao.desempenho.identidadeacesso.application.*;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.*;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import({
  PasswordAdministrationHttpTests.Config.class,
  ApiSecurityConfigurationTests.JwtAccessFilterTestConfiguration.class
})
class PasswordAdministrationHttpTests {
  @Autowired WebApplicationContext web;
  @Autowired UserAdministrationRepository repository;
  @Autowired PasswordRecoveryRepository recovery;
  @Autowired LocalAuthenticationService authenticationService;
  @Autowired IdentityAccessRepository audit;
  final UUID actor = UUID.randomUUID();
  final UUID target = UUID.randomUUID();
  final Set<String> reset = Set.of("SENHAS.REDEFINIR");
  final Set<String> delegate = Set.of("SENHAS.REDEFINIR", "SENHAS.DELEGAR_REDEFINICAO");
  MockMvc mvc;

  @BeforeEach
  void setup() {
    reset(repository, recovery, authenticationService, audit);
    mvc = MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();
    var user =
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
    when(repository.lockPasswordResetTarget(target)).thenReturn(Optional.of(user));
    when(repository.findUser(target)).thenReturn(Optional.of(user));
    when(repository.passwordHashForReset(target))
        .thenReturn(Optional.of(new BCryptPasswordEncoder(4).encode(UUID.randomUUID().toString())));
    when(repository.resetOrdinaryUserPassword(eq(target), any(), any(), any(), anyBoolean()))
        .thenReturn(Optional.of(user));
    when(repository.replacePasswordResetDelegation(eq(target), any(), eq(actor), anyBoolean()))
        .thenReturn(true);
    when(repository.listPasswordResetTargets(actor, false)).thenReturn(List.of(user));
  }

  org.springframework.test.web.servlet.request.RequestPostProcessor operator(
      boolean supreme, Set<String> permissions, String role) {
    when(repository.lockPasswordResetActor(actor))
        .thenReturn(
            Optional.of(new PasswordResetAuthorizationPolicy.Actor(actor, supreme, permissions)));
    var principal =
        new AuthenticatedPrincipal(
            new AuthorizedUser(actor, "Ator fictício", false, supreme, permissions, Set.of(role)),
            UUID.randomUUID());
    return authentication(
        new UsernamePasswordAuthenticationToken(
            principal,
            null,
            permissions.stream().map(p -> new SimpleGrantedAuthority("PERMISSION:" + p)).toList()));
  }

  String targetUrl() {
    return "/api/v1/administration/users/" + target;
  }

  @ParameterizedTest
  @EnumSource(PlatformRole.class)
  void catalogRoleWithoutIndividualGrantCannotResetOrDelegate(PlatformRole role) throws Exception {
    var codes =
        InitialRolePermissionCatalog.permissionsFor(role).stream()
            .map(PlatformPermission::code)
            .collect(java.util.stream.Collectors.toSet());
    var requestActor = operator(false, codes, role.name());
    mvc.perform(post(targetUrl() + "/temporary-password").with(requestActor).with(csrf()))
        .andExpect(status().isForbidden());
    mvc.perform(
            put(targetUrl() + "/password-reset-delegation")
                .with(requestActor)
                .with(csrf())
                .contentType("application/json")
                .content("{\"canResetPassword\":true,\"canDelegatePasswordReset\":false}"))
        .andExpect(status().isForbidden());
    verify(repository, never()).resetOrdinaryUserPassword(any(), any(), any(), any(), anyBoolean());
    verify(repository, never()).replacePasswordResetDelegation(any(), any(), any(), anyBoolean());
  }

  @Test
  void delegatedReadIsScopedAndDirectIneligibleIdIsDenied() throws Exception {
    var requestActor = operator(false, reset, "GERENCIA_RH");
    mvc.perform(get("/api/v1/administration/users").with(requestActor))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1));
    verify(repository, never()).listUsers();
    mvc.perform(get(targetUrl()).with(requestActor)).andExpect(status().isOk());
    when(repository.lockPasswordResetTarget(target)).thenReturn(Optional.empty());
    mvc.perform(get(targetUrl()).with(requestActor)).andExpect(status().isForbidden());
  }

  @Test
  void generationRequiresCsrfAndReturnsOnceWithNoStoreThenRevokedOperatorIsDenied()
      throws Exception {
    var requestActor = operator(false, reset, "GESTOR");
    mvc.perform(post(targetUrl() + "/temporary-password").with(requestActor))
        .andExpect(status().isForbidden());
    mvc.perform(post(targetUrl() + "/temporary-password").with(requestActor).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(jsonPath("$.temporaryPassword").isString())
        .andExpect(jsonPath("$.user.passwordHash").doesNotExist());
    clearInvocations(repository);
    when(repository.lockPasswordResetActor(actor)).thenReturn(Optional.empty());
    mvc.perform(post(targetUrl() + "/temporary-password").with(requestActor).with(csrf()))
        .andExpect(status().isForbidden());
    verify(repository, never()).resetOrdinaryUserPassword(any(), any(), any(), any(), anyBoolean());
    verify(audit, atLeastOnce())
        .writeAudit(
            argThat(
                event ->
                    event.action().equals("AUTORIZACAO.NEGAR")
                        && event.result() == AuditEvent.AuditResult.DENIED
                        && event.reducedDetail() == null));
  }

  @Test
  void supremoGrantsBothButDelegatorCanOnlyGrantResetAndPayloadMustBeExplicit() throws Exception {
    var supremo = operator(true, Set.of("USUARIOS.ALTERAR"), "ADMINISTRADOR_PLATAFORMA");
    mvc.perform(
            put(targetUrl() + "/password-reset-delegation")
                .with(supremo)
                .with(csrf())
                .contentType("application/json")
                .content("{\"canResetPassword\":true,\"canDelegatePasswordReset\":true}"))
        .andExpect(status().isOk());
    var requestActor = operator(false, delegate, "DIRETORIA");
    mvc.perform(
            put(targetUrl() + "/password-reset-delegation")
                .with(requestActor)
                .with(csrf())
                .contentType("application/json")
                .content("{\"canResetPassword\":true,\"canDelegatePasswordReset\":true}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            put(targetUrl() + "/password-reset-delegation")
                .with(requestActor)
                .with(csrf())
                .contentType("application/json")
                .content("{\"canResetPassword\":true,\"canDelegatePasswordReset\":false}"))
        .andExpect(status().isOk());
    for (String body :
        List.of(
            "{}",
            "{\"canResetPassword\":true}",
            "{\"canResetPassword\":null,\"canDelegatePasswordReset\":false}")) {
      mvc.perform(
              put(targetUrl() + "/password-reset-delegation")
                  .with(requestActor)
                  .with(csrf())
                  .contentType("application/json")
                  .content(body))
          .andExpect(status().isUnprocessableContent());
    }
  }

  @Test
  void credentialDtosRejectUnknownFieldsAndPublicRepliesDoNotRevealExistence() throws Exception {
    String secret = UUID.randomUUID().toString();
    mvc.perform(
            post("/api/v1/auth/sessions")
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"login\":\"fixture\",\"password\":\""
                        + secret
                        + "\",\"role\":\"injected\"}"))
        .andExpect(status().isBadRequest());
    var requestActor = operator(false, reset, "COLABORADOR");
    mvc.perform(
            put("/api/v1/auth/password")
                .with(requestActor)
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"currentPassword\":\""
                        + secret
                        + "\",\"newPassword\":\""
                        + secret
                        + "\",\"userId\":\"injected\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            put(targetUrl() + "/password-reset")
                .with(requestActor)
                .with(csrf())
                .contentType("application/json")
                .content("{\"temporaryPassword\":\"" + secret + "\",\"status\":\"injected\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(authenticationService);
    for (String login :
        List.of("absent", "active", "protected", "disabled", "blocked", "deleted")) {
      mvc.perform(
              post("/api/v1/auth/password-reset-requests")
                  .with(csrf())
                  .contentType("application/json")
                  .content("{\"login\":\"fixture-" + login + "\"}"))
          .andExpect(status().isAccepted())
          .andExpect(content().string(""));
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Config {
    @Bean
    IdentityAccessRepository auditRepository() {
      return mock(IdentityAccessRepository.class);
    }

    @Bean
    UserAdministrationRepository users() {
      return mock(UserAdministrationRepository.class);
    }

    @Bean
    PasswordRecoveryRepository recoveryRepository() {
      return mock(PasswordRecoveryRepository.class);
    }

    @Bean
    TransactionTemplate transactions() {
      var template = mock(TransactionTemplate.class);
      when(template.execute(any()))
          .thenAnswer(
              call ->
                  ((TransactionCallback<?>) call.getArgument(0))
                      .doInTransaction(mock(TransactionStatus.class)));
      doAnswer(
              call -> {
                java.util.function.Consumer<TransactionStatus> action = call.getArgument(0);
              action.accept(mock(TransactionStatus.class));
                return null;
              })
          .when(template)
          .executeWithoutResult(any());
      return template;
    }

    @Bean
    UserAdministrationService administration(
        UserAdministrationRepository users, TransactionTemplate transaction) {
      return new UserAdministrationService(users, new BCryptPasswordEncoder(4), transaction);
    }

    @Bean
    PasswordRecoveryService recovery(
        PasswordRecoveryRepository repository,
        UserAdministrationRepository users,
        UserAdministrationService administration,
        TransactionTemplate transaction) {
      return new PasswordRecoveryService(
          repository, users, administration, transaction, Clock.systemUTC());
    }

    @Bean
    UserAdministrationController usersController(UserAdministrationService service) {
      return new UserAdministrationController(service);
    }

    @Bean
    PasswordRecoveryController recoveryController(PasswordRecoveryService service) {
      return new PasswordRecoveryController(service);
    }

    @Bean
    LocalAuthenticationService authService() {
      return mock(LocalAuthenticationService.class);
    }

    @Bean
    AuthenticationController authController(
        LocalAuthenticationService service,
        org.springframework.security.web.csrf.CsrfTokenRepository csrf) {
      return new AuthenticationController(
          service, new LoginRateLimiter(Clock.systemUTC(), 100, Duration.ofMinutes(1)), csrf);
    }
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.identidadeacesso.api.*;
import br.com.avaliacao.desempenho.identidadeacesso.application.*;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.*;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.*;
import com.jayway.jsonpath.JsonPath;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;

/** Fluxo real HTTP/serviços/JDBC com fixtures próprias, TLS validado e rollback obrigatório. */
@EnabledIfSystemProperty(named = "adc.dev.password.block.rollback", matches = "true")
class PasswordResetBlockedDevSqlTests {
  @Test
  void blockedResetExplainsDeadlineThenExpiredBlockAllowsResetLoginAndPersonalPassword() {
    String url = Objects.requireNonNull(System.getenv("ADC_TEST_JDBC_URL"));
    assertThat(url)
        .contains("databaseName=AVALIACAO_DEV", "encrypt=true", "trustServerCertificate=false");
    var source =
        new DriverManagerDataSource(
            url,
            Objects.requireNonNull(System.getenv("ADC_TEST_SQL_USER")),
            Objects.requireNonNull(System.getenv("ADC_TEST_SQL_PASSWORD")));
    var jdbc = new JdbcTemplate(source);
    jdbc.setQueryTimeout(15);
    assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    var users = new SqlUserAdministrationRepository(jdbc);
    var identity = new SqlIdentityAccessRepository(jdbc);
    var recovery = new SqlPasswordRecoveryRepository(jdbc);
    var encoder = new BCryptPasswordEncoder(12);
    var administration = new UserAdministrationService(users, encoder, transaction);
    var service =
        new PasswordRecoveryService(
            recovery, users, administration, transaction, Clock.systemUTC());
    byte[] signingKey = new byte[64];
    new SecureRandom().nextBytes(signingKey);
    var properties =
        new AuthenticationSecurityProperties(
            true,
            "urn:fixture:issuer",
            "urn:fixture:audience",
            Base64.getEncoder().encodeToString(signingKey),
            null,
            null,
            null,
            null,
            null,
            null);
    Arrays.fill(signingKey, (byte) 0);
    var tokens = new AccessTokenService(properties, Clock.systemUTC());
    var auth =
        new LocalAuthenticationService(
            identity, encoder, tokens, properties, transaction, Clock.systemUTC());
    UUID actor = UUID.randomUUID();
    UUID target = UUID.randomUUID();
    String prefix = "qa.password-block." + UUID.randomUUID();
    var auditBeans = new StaticListableBeanFactory();
    auditBeans.addBean("audit", identity);
    var mvc =
        MockMvcBuilders.standaloneSetup(new PasswordRecoveryController(service))
            .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
            .setControllerAdvice(
                new UserAdministrationExceptionHandler(
                    auditBeans.getBeanProvider(IdentityAccessRepository.class)))
            .build();
    Set<String> permissions = Set.of("USUARIOS.ALTERAR", "USUARIOS.LER");
    var principal =
        new AuthenticatedPrincipal(
            new AuthorizedUser(
                actor,
                "Operador fictício",
                false,
                true,
                permissions,
                Set.of("ADMINISTRADOR_PLATAFORMA")),
            UUID.randomUUID());
    SecurityContextHolder.getContext()
        .setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, List.of()));
    try {
      transaction.executeWithoutResult(
          status -> {
            status.setRollbackOnly();
            jdbc.update(
                "INSERT INTO dbo.usuario (usuario_id,login_normalizado,nome_exibicao,administrador_supremo,protegido_fluxo_normal) VALUES (?,?,N'Operador fictício',1,1)",
                actor,
                prefix + ".operator");
            jdbc.update(
                "INSERT INTO dbo.credencial_local (usuario_id,senha_hash,algoritmo,parametros,senha_deve_ser_trocada) VALUES (?,?,'BCRYPT','strength=12',0)",
                actor,
                encoder.encode(UUID.randomUUID().toString()));
            String original = UUID.randomUUID().toString();
            users.createLocalUser(
                new UserAdministrationRepository.NewLocalUser(
                    target,
                    prefix + ".user",
                    "Conta fictícia",
                    encoder.encode(original),
                    "BCRYPT",
                    "strength=12"),
                actor);
            var priorSession =
                new AuthenticationSession(
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    target,
                    UUID.randomUUID().toString(),
                    Instant.now(),
                    Instant.now().plusSeconds(300));
            identity.createSession(priorSession, "b".repeat(64), Instant.now().plusSeconds(600));
            jdbc.update(
                "UPDATE dbo.credencial_local SET bloqueada_ate_utc=DATEADD(minute,15,SYSUTCDATETIME()) WHERE usuario_id=?",
                target);
            assertThat(users.findUser(target).orElseThrow().temporaryBlockedUntil())
                .isAfter(Instant.now());
            try {
              mvc.perform(post("/api/v1/administration/users/" + target + "/temporary-password"))
                  .andExpect(status().isConflict())
                  .andExpect(jsonPath("$.code").value("PASSWORD_RESET_TEMPORARILY_BLOCKED"))
                  .andExpect(jsonPath("$.retryAt").isString())
                  .andExpect(jsonPath("$.temporaryPassword").doesNotExist());
              assertThat(
                      encoder.matches(
                          original,
                          identity
                              .findLocalCredentialByUserId(target)
                              .orElseThrow()
                              .passwordHash()))
                  .isTrue();
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE recurso_id=? AND acao='USUARIO.SENHA_REDEFINIR'",
                          Integer.class,
                          target))
                  .isZero();
              jdbc.update(
                  "UPDATE dbo.credencial_local SET bloqueada_ate_utc=DATEADD(second,-1,SYSUTCDATETIME()) WHERE usuario_id=?",
                  target);
              var response =
                  mvc.perform(
                          post("/api/v1/administration/users/" + target + "/temporary-password"))
                      .andExpect(status().isOk())
                      .andExpect(header().string("Cache-Control", "no-store"))
                      .andReturn()
                      .getResponse();
              String temporary =
                  JsonPath.read(response.getContentAsString(), "$.temporaryPassword");
              assertThat(temporary != null && temporary.length() == 32).isTrue();
              assertThat(
                      identity.findAuthorizedUserForActiveSession(
                          priorSession.sessionId(),
                          target,
                          priorSession.accessTokenId(),
                          Instant.now()))
                  .isEmpty();
              assertThatThrownBy(() -> auth.authenticate(prefix + ".user", original, prefix))
                  .isInstanceOf(AuthenticationFailureException.class);
              var temporaryLogin = auth.authenticate(prefix + ".user", temporary, prefix);
              assertThat(temporaryLogin.passwordChangeRequired()).isTrue();
              String personal = UUID.randomUUID().toString();
              auth.changePassword(target, temporary, personal, prefix);
              assertThatThrownBy(() -> auth.authenticate(prefix + ".user", temporary, prefix))
                  .isInstanceOf(AuthenticationFailureException.class);
              var finalLogin = auth.authenticate(prefix + ".user", personal, prefix);
              assertThat(finalLogin.passwordChangeRequired()).isFalse();
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE recurso_id=? AND acao='USUARIO.SENHA_REDEFINIR' AND resultado='SUCESSO'",
                          Integer.class,
                          target))
                  .isEqualTo(1);
            } catch (Exception exception) {
              throw new AssertionError(
                  "Fluxo fictício de recuperação não concluiu; credenciais omitidas", exception);
            }
          });
    } finally {
      SecurityContextHolder.clearContext();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.usuario WHERE usuario_id IN (?,?)",
                  Integer.class,
                  actor,
                  target))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE ator_usuario_id IN (?,?) OR recurso_id IN (?,?)",
                  Integer.class,
                  actor,
                  target,
                  actor,
                  target))
          .isZero();
    }
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verifyNoInteractions;

import br.com.avaliacao.desempenho.identidadeacesso.application.*;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthenticationSession;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

/** Somente contas fictícias próprias, transação revertida e nenhum DDL. */
@EnabledIfSystemProperty(named = "adc.dev.recovery.rollback", matches = "true")
class PasswordRecoveryDevSqlTests {
  @Test
  void requestsSurviveServiceRestartDeduplicateAndResolveOnlyAfterSecureReset() {
    var source = new DriverManagerDataSource();
    source.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    source.setUrl(
        "jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;trustServerCertificate=true;integratedSecurity=true;authenticationScheme=NativeAuthentication");
    var jdbc = new JdbcTemplate(source);
    jdbc.setQueryTimeout(15);
    assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    var users = new SqlUserAdministrationRepository(jdbc);
    var recovery = new SqlPasswordRecoveryRepository(jdbc);
    var identity = new SqlIdentityAccessRepository(jdbc);
    var encoder = new BCryptPasswordEncoder(4);
    var administration = new UserAdministrationService(users, encoder, transaction);
    var service =
        new PasswordRecoveryService(
            recovery, users, administration, transaction, Clock.systemUTC());
    var auth =
        new LocalAuthenticationService(
            identity,
            encoder,
            mock(AccessTokenService.class),
            mock(AuthenticationSecurityProperties.class),
            transaction,
            Clock.systemUTC());
    String prefix = "qa.recovery." + UUID.randomUUID();
    UUID actor = UUID.randomUUID();
    UUID target = UUID.randomUUID();
    Set<String> permissions = Set.of("USUARIOS.LER", "USUARIOS.ALTERAR");
    try {
      transaction.executeWithoutResult(
          status -> {
            status.setRollbackOnly();
            jdbc.update(
                "INSERT INTO dbo.usuario (usuario_id,login_normalizado,nome_exibicao,administrador_supremo,protegido_fluxo_normal) VALUES (?,?,N'Administrador fictício',1,1)",
                actor,
                prefix + ".admin");
            String initial = UUID.randomUUID().toString();
            users.createLocalUser(
                new UserAdministrationRepository.NewLocalUser(
                    target,
                    prefix + ".user",
                    "Conta fictícia de recuperação",
                    encoder.encode(initial),
                    "BCRYPT",
                    "test-only"),
                actor);
            var session =
                new AuthenticationSession(
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    target,
                    UUID.randomUUID().toString(),
                    Instant.now(),
                    Instant.now().plusSeconds(300));
            identity.createSession(session, "a".repeat(64), Instant.now().plusSeconds(3600));
            service.request(prefix + ".missing", "test", prefix);
            service.request(prefix + ".admin", "test", prefix);
            service.request(prefix.toUpperCase(Locale.ROOT) + ".USER", "test", prefix);
            service.request(prefix + ".user", "test", prefix);
            var pending =
                new SqlPasswordRecoveryRepository(jdbc)
                    .listPending(0, 10000).stream()
                        .filter(item -> item.userId().equals(target))
                        .toList();
            assertThat(pending).hasSize(1);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=? AND acao='AUTENTICACAO.REDEFINICAO_SOLICITAR'",
                        Integer.class,
                        prefix))
                .isEqualTo(1);
            String previousHash =
                identity.findLocalCredentialByUserId(target).orElseThrow().passwordHash();
            var generated = service.generate(target, actor, permissions, prefix);
            assertThat(generated.user().passwordChangeRequired()).isTrue();
            assertThat(
                    identity.changePassword(
                        target, previousHash, encoder.encode(initial), "BCRYPT", "test-only"))
                .isFalse();
            var credential = identity.findLocalCredentialByUserId(target).orElseThrow();
            assertThat(encoder.matches(generated.temporaryPassword(), credential.passwordHash()))
                .isTrue();
            assertThat(encoder.matches(initial, credential.passwordHash())).isFalse();
            assertThat(
                    identity.findAuthorizedUserForActiveSession(
                        session.sessionId(), target, session.accessTokenId(), Instant.now()))
                .isEmpty();
            assertThat(
                    recovery.listPending(0, 10000).stream()
                        .filter(item -> item.userId().equals(target))
                        .count())
                .isZero();
            assertThatThrownBy(
                    () ->
                        auth.changePassword(
                            target,
                            generated.temporaryPassword(),
                            generated.temporaryPassword(),
                            prefix))
                .isInstanceOf(InvalidPasswordException.class);
            String personal = UUID.randomUUID().toString();
            auth.changePassword(target, generated.temporaryPassword(), personal, prefix);
            var changed = identity.findLocalCredentialByUserId(target).orElseThrow();
            assertThat(changed.passwordChangeRequired()).isFalse();
            assertThat(encoder.matches(personal, changed.passwordHash())).isTrue();
            assertThat(encoder.matches(generated.temporaryPassword(), changed.passwordHash()))
                .isFalse();
            // Simula um login que leu o hash temporário antes da troca e terminou depois dela.
            var staleIdentity = spy(identity);
            doReturn(Optional.of(credential))
                .when(staleIdentity)
                .findLocalCredentialByNormalizedLogin(prefix + ".user");
            var unusedJwt = mock(AccessTokenService.class);
            var staleLogin =
                new LocalAuthenticationService(
                    staleIdentity,
                    encoder,
                    unusedJwt,
                    mock(AuthenticationSecurityProperties.class),
                    transaction,
                    Clock.systemUTC());
            assertThatThrownBy(
                    () ->
                        staleLogin.authenticate(
                            prefix + ".user", generated.temporaryPassword(), prefix))
                .isInstanceOf(AuthenticationFailureException.class);
            verifyNoInteractions(unusedJwt);
            assertThat(identity.registerSuccessfulLogin(target, changed.passwordHash())).isTrue();
            // Novo pedido, depois do atendimento, volta a aparecer sem alterar a credencial atual.
            service.request(prefix + ".user", "test", prefix);
            assertThat(
                    recovery.listPending(0, 10000).stream()
                        .filter(item -> item.userId().equals(target))
                        .count())
                .isEqualTo(1);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=? AND detalhe_reduzido IS NOT NULL",
                        Integer.class,
                        prefix))
                .isZero();
          });
    } finally {
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.usuario WHERE usuario_id IN (?,?)",
                  Integer.class,
                  actor,
                  target))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=?",
                  Integer.class,
                  prefix))
          .isZero();
    }
  }
}

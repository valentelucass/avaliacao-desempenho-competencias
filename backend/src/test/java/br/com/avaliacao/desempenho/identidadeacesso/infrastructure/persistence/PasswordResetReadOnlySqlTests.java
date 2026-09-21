package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.*;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** SELECTs reais exclusivamente sobre CTEs fictícias. Qualquer tentativa de escrita falha. */
@EnabledIfSystemProperty(named = "adc.dev.sql.readonly", matches = "true")
class PasswordResetReadOnlySqlTests {
  private static UUID id(int n) {
    return UUID.fromString("00000000-0000-0000-0000-%012d".formatted(n));
  }

  private static final String FIXTURE =
      """
      WITH ids AS (
        SELECT n, CONVERT(uniqueidentifier, '00000000-0000-0000-0000-' + RIGHT('000000000000' + CONVERT(varchar(12), n), 12)) id
        FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18)) numbers(n)
      ), fixture_usuario AS (
        SELECT n, id usuario_id, CONCAT('fixture-',n) login_normalizado,
          CONCAT('Conta ficticia ',n) nome_exibicao,
          CASE n WHEN 8 THEN 'DESATIVADO' WHEN 9 THEN 'BLOQUEADO' ELSE 'ATIVO' END situacao,
          CASE WHEN n IN (1,18) THEN 1 ELSE 0 END administrador_supremo,
          CASE WHEN n IN (1,7) THEN 1 ELSE 0 END protegido_fluxo_normal,
          CASE WHEN n = 10 THEN 1 ELSE 0 END excluido_logicamente,
          CONVERT(datetime2,'2026-01-01') atualizado_em_utc
        FROM ids
      ), fixture_credencial_local AS (
        SELECT id usuario_id, CASE WHEN n = 12 THEN 1 ELSE 0 END senha_deve_ser_trocada,
          CASE WHEN n = 11 THEN DATEADD(hour,1,SYSUTCDATETIME())
            WHEN n = 17 THEN DATEADD(hour,-1,SYSUTCDATETIME()) ELSE CAST(NULL AS datetime2) END bloqueada_ate_utc
        FROM ids WHERE n <> 16
      ), fixture_papel AS (
        SELECT papel_id, codigo, 1 ativo FROM (VALUES
          (1,'ADMINISTRADOR_PLATAFORMA'),(2,'GERENCIA_RH'),(3,'DIRETORIA'),(4,'GESTOR'),(5,'COLABORADOR')) p(papel_id,codigo)
      ), fixture_atribuicao_papel AS (
        SELECT id usuario_id, CASE WHEN n IN (1,6) THEN 1 WHEN n IN (2,3,4) THEN n ELSE 5 END papel_id,
          CAST(NULL AS datetime2) revogado_em_utc FROM ids
      ), fixture_permissao AS (
        SELECT permissao_id, codigo, 1 ativo FROM (VALUES
          (1,'SENHAS.REDEFINIR'),(2,'SENHAS.DELEGAR_REDEFINICAO')) p(permissao_id,codigo)
      ), fixture_concessao_permissao_usuario AS (
        SELECT id usuario_id, permissao_id, 'PERMITIR' efeito,
          CASE WHEN n = 13 THEN CONVERT(datetime2,'2026-01-01') ELSE CAST(NULL AS datetime2) END revogado_em_utc
        FROM ids CROSS JOIN fixture_permissao
        WHERE (n IN (2,3,6,7,8,9,10,11,12,13) AND permissao_id = 1)
          OR (n IN (3,6,14) AND permissao_id = 2)
      ), fixture_evento_auditoria AS (
        SELECT CONVERT(bigint,n) evento_auditoria_id, id recurso_id, 'USUARIO' tipo_recurso,
          'SUCESSO' resultado, CONVERT(datetime2,'2026-01-01') ocorrido_em_utc,
          'AUTENTICACAO.REDEFINICAO_SOLICITAR' acao FROM ids
        UNION ALL SELECT 100+n,id,'USUARIO','SUCESSO',CONVERT(datetime2,'2026-01-01'),
          CASE WHEN n=4 THEN 'USUARIO.SENHA_REDEFINIR' ELSE 'AUTENTICACAO.ALTERAR_SENHA' END
          FROM ids WHERE n IN (4,5)
      ), fixture_sessao_autenticacao AS (
        SELECT id sessao_id, id usuario_id, 'fixture-jti' jti_acesso,
          CASE WHEN n=13 THEN SYSUTCDATETIME() ELSE CAST(NULL AS datetime2) END revogada_em_utc,
          DATEADD(hour,1,SYSUTCDATETIME()) expira_em_utc FROM ids
      ), fixture_papel_permissao AS (
        SELECT papel_id, permissao_id, CAST(NULL AS datetime2) revogado_em_utc
        FROM fixture_papel CROSS JOIN fixture_permissao
      )
      """;

  private JdbcTemplate fixtureJdbc() {
    var source = new DriverManagerDataSource();
    source.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    source.setUrl(
        "jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;trustServerCertificate=true;integratedSecurity=true;authenticationScheme=NativeAuthentication");
    var reader = new JdbcTemplate(source);
    reader.setQueryTimeout(15);
    assertThat(reader.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    return mock(
        JdbcTemplate.class,
        call -> {
          String method = call.getMethod().getName();
          assertThat(method).isIn("query", "queryForList");
          Object[] args = call.getRawArguments();
          String sql = (String) args[0];
          assertThat(sql.stripLeading()).startsWith("SELECT");
          // Retira apenas hints de trava incompatíveis com VALUES; não testa concorrência SQL.
          sql = FIXTURE + sql.replace("dbo.", "fixture_").replace(" WITH (UPDLOCK, HOLDLOCK)", "");
          Object[] bindings = (Object[]) args[2];
          if (method.equals("queryForList"))
            return reader.queryForList(sql, (Class<?>) args[1], bindings);
          if (args[1] instanceof RowMapper<?> mapper) return reader.query(sql, mapper, bindings);
          if (args[1] instanceof RowCallbackHandler callback) {
            reader.query(sql, callback, bindings);
            return null;
          }
          return reader.query(sql, (ResultSetExtractor<?>) args[1], bindings);
        });
  }

  @Test
  void actorIsRevalidatedFromIndividualActiveGrantsAndEligibleCredentialOnly() {
    var users = new SqlUserAdministrationRepository(fixtureJdbc());
    assertThat(users.lockPasswordResetActor(id(1)).orElseThrow().isSupreme()).isTrue();
    assertThat(users.lockPasswordResetActor(id(2)).orElseThrow().permissions())
        .containsExactly("SENHAS.REDEFINIR");
    assertThat(users.lockPasswordResetActor(id(3)).orElseThrow().permissions())
        .containsExactlyInAnyOrder("SENHAS.REDEFINIR", "SENHAS.DELEGAR_REDEFINICAO");
    for (int n : List.of(6, 7, 8, 9, 10, 11, 12, 16))
      assertThat(users.lockPasswordResetActor(id(n))).as("actor %s", n).isEmpty();
    for (int n : List.of(4, 5, 13, 15))
      assertThat(users.lockPasswordResetActor(id(n)).orElseThrow().permissions())
          .as("actor %s", n)
          .isEmpty();
  }

  @Test
  void individualTargetLookupExcludesAllIneligibleStatesAndAllowsExpiredTemporaryBlock() {
    var users = new SqlUserAdministrationRepository(fixtureJdbc());
    for (int n : List.of(1, 6, 7, 8, 9, 10, 11, 16, 18))
      assertThat(users.lockPasswordResetTarget(id(n))).as("target %s", n).isEmpty();
    for (int n : List.of(2, 3, 4, 5, 12, 13, 14, 15, 17))
      assertThat(users.lockPasswordResetTarget(id(n))).as("target %s", n).isPresent();
  }

  @Test
  void queueFiltersBeforePaginationAndResolvesByLastAuditSequence() {
    var recovery = new SqlPasswordRecoveryRepository(fixtureJdbc());
    assertThat(recovery.listPending(id(2), false, 0, 100))
        .extracting(item -> item.userId())
        .containsExactly(id(12), id(13), id(15), id(17));
    assertThat(recovery.listPending(id(1), true, 0, 100))
        .extracting(item -> item.userId())
        .containsExactly(id(2), id(3), id(12), id(13), id(14), id(15), id(17));
    assertThat(recovery.listPending(id(2), false, 0, 2))
        .extracting(item -> item.sequence())
        .containsExactly(12L, 13L);
    assertThat(recovery.listPending(id(2), false, 13, 2))
        .extracting(item -> item.sequence())
        .containsExactly(15L, 17L);
  }

  @Test
  void scopedCollectionCannotExposeSelfTechnicalProtectedOrDelegatingAccounts() {
    var users = new SqlUserAdministrationRepository(fixtureJdbc());
    assertThat(users.listPasswordResetTargets(id(2), false))
        .extracting(user -> user.id())
        .containsExactlyInAnyOrder(id(4), id(5), id(12), id(13), id(15), id(17));
    assertThat(users.listPasswordResetTargets(id(1), true))
        .extracting(user -> user.id())
        .contains(id(2), id(3), id(14))
        .doesNotContain(id(1), id(6), id(11));
  }

  @Test
  void revokedBlockedInactiveDeletedAndWrongJtiSessionsCannotAuthenticate() {
    var identity = new SqlIdentityAccessRepository(fixtureJdbc());
    for (int n : List.of(8, 9, 10, 11, 13, 16)) {
      assertThat(
              identity.findAuthorizedUserForActiveSession(
                  id(n), id(n), "fixture-jti", java.time.Instant.now()))
          .as("session %s", n)
          .isEmpty();
    }
    assertThat(
            identity.findAuthorizedUserForActiveSession(
                id(5), id(5), "other-jti", java.time.Instant.now()))
        .isEmpty();
    var ordinary =
        identity
            .findAuthorizedUserForActiveSession(
                id(5), id(5), "fixture-jti", java.time.Instant.now())
            .orElseThrow();
    assertThat(ordinary.permissions()).isEmpty();
    var delegated =
        identity
            .findAuthorizedUserForActiveSession(
                id(2), id(2), "fixture-jti", java.time.Instant.now())
            .orElseThrow();
    assertThat(delegated.permissions()).containsExactly("SENHAS.REDEFINIR");
  }
}

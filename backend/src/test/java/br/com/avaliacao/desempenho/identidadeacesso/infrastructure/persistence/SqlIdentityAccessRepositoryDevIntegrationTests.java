package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Integração opt-in com o SQL Server DEV; nunca é executada no ciclo unitário padrão. */
@EnabledIfSystemProperty(named = "adc.dev.sql.integration", matches = "true")
class SqlIdentityAccessRepositoryDevIntegrationTests {

  @Test
  void rotatesAnActiveRefreshTokenForTheIsolatedDevScenario() {
    HikariConfig configuration = new HikariConfig();
    configuration.setJdbcUrl(
        "jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;"
            + "trustServerCertificate=true;integratedSecurity=true;"
            + "authenticationScheme=NativeAuthentication");
    configuration.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    configuration.setMaximumPoolSize(1);
    configuration.setMinimumIdle(0);

    try (HikariDataSource dataSource = new HikariDataSource(configuration)) {
      JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
      String refreshTokenHash =
          jdbcTemplate.queryForObject(
              """
              SELECT TOP (1) token.token_hash
              FROM dbo.token_renovacao AS token
              INNER JOIN dbo.sessao_autenticacao AS session ON session.sessao_id = token.sessao_id
              INNER JOIN dbo.usuario AS user_account ON user_account.usuario_id = session.usuario_id
              WHERE user_account.login_normalizado LIKE 'qa.feedback.tecnico.%'
                AND token.revogado_em_utc IS NULL
                AND token.expira_em_utc > SYSUTCDATETIME()
                AND session.revogada_em_utc IS NULL
                AND user_account.situacao = 'ATIVO'
              ORDER BY token.emitido_em_utc DESC
              """,
              String.class);
      assertThat(refreshTokenHash).hasSize(64);

      SqlIdentityAccessRepository repository = new SqlIdentityAccessRepository(jdbcTemplate);
      TransactionTemplate transaction =
          new TransactionTemplate(new DataSourceTransactionManager(dataSource));
      Instant now = Instant.now();
      String replacementRefreshTokenHash = UUID.randomUUID().toString().replace("-", "").repeat(2);
      IdentityAccessRepository.RefreshSession rotated =
          transaction.execute(
              status ->
                  repository
                      .rotateRefreshToken(
                          refreshTokenHash,
                          replacementRefreshTokenHash,
                          UUID.randomUUID().toString(),
                          now.plusSeconds(300),
                          now.plusSeconds(3600),
                          now)
                      .orElse(null));

      assertThat(rotated).isNotNull();
      Integer revoked =
          jdbcTemplate.queryForObject(
              "SELECT COUNT(*) FROM dbo.token_renovacao WHERE token_hash = ? AND revogado_em_utc IS NOT NULL",
              Integer.class,
              refreshTokenHash);
      assertThat(revoked).isEqualTo(1);
    }
  }
}

package br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadService;
import br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence.SqlServerEvaluationCycleReadRepository;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Habilita leitura de ciclos somente por escolha externa explícita e depois que o schema V0003,
 * V0005 e V0007 estiver disponível. Nenhuma migration é aplicada por esta configuração.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(
    prefix = "app.evaluation-cycles.read",
    name = "enabled",
    havingValue = "true")
public class EvaluationCycleReadConfiguration {

  @Bean
  EvaluationCycleReadRepository evaluationCycleReadRepository(JdbcTemplate jdbcTemplate) {
    verifyRequiredMigrations(jdbcTemplate);
    return new SqlServerEvaluationCycleReadRepository(jdbcTemplate);
  }

  @Bean
  EvaluationCycleReadService evaluationCycleReadService(EvaluationCycleReadRepository repository) {
    return new EvaluationCycleReadService(repository);
  }

  private static void verifyRequiredMigrations(JdbcTemplate jdbcTemplate) {
    Integer appliedMigrations =
        jdbcTemplate.queryForObject(
            """
            SELECT COUNT(*)
            FROM dbo.schema_migrations
            WHERE version IN ('V0003', 'V0005', 'V0007')
            """,
            Integer.class);
    if (appliedMigrations == null || appliedMigrations != 3) {
      throw new IllegalStateException(
          "A leitura de ciclos exige as migrations V0003, V0005 e V0007 aplicadas.");
    }
  }
}

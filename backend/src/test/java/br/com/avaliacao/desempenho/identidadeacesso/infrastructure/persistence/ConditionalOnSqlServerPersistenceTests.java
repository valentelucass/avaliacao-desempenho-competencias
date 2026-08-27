package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import br.com.avaliacao.desempenho.avaliacoes.api.AssessmentController;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentApplicationService;
import br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence.SqlServerAssessmentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

class ConditionalOnSqlServerPersistenceTests {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner()
          .withUserConfiguration(AssessmentModuleWithLateInfrastructure.class);

  @Test
  void enablesAssessmentComponentsWhenJdbcInfrastructureIsRegisteredLater() {
    contextRunner
        .withPropertyValues(
            "app.persistence.sqlserver.enabled=true", "app.assessments.enabled=true")
        .run(
            context -> {
              assertThat(context).hasSingleBean(SqlServerAssessmentRepository.class);
              assertThat(context).hasSingleBean(AssessmentApplicationService.class);
              assertThat(context).hasSingleBean(AssessmentController.class);
            });
  }

  @Test
  void keepsAssessmentComponentsDisabledUntilPersistenceIsExplicitlyEnabled() {
    contextRunner
        .withPropertyValues(
            "app.persistence.sqlserver.enabled=false", "app.assessments.enabled=true")
        .run(
            context -> {
              assertThat(context).doesNotHaveBean(SqlServerAssessmentRepository.class);
              assertThat(context).doesNotHaveBean(AssessmentApplicationService.class);
              assertThat(context).doesNotHaveBean(AssessmentController.class);
            });
  }

  /**
   * The imports intentionally place the module before its JDBC definitions. This is the ordering
   * that made {@code @ConditionalOnBean(JdbcTemplate.class)} silently remove application components
   * during production startup.
   */
  @Configuration(proxyBeanMethods = false)
  @Import({AssessmentComponents.class, LateJdbcInfrastructure.class})
  static class AssessmentModuleWithLateInfrastructure {}

  @Configuration(proxyBeanMethods = false)
  @Import({
    SqlServerAssessmentRepository.class,
    AssessmentApplicationService.class,
    AssessmentController.class
  })
  static class AssessmentComponents {}

  @Configuration(proxyBeanMethods = false)
  static class LateJdbcInfrastructure {

    @Bean
    JdbcTemplate jdbcTemplate() {
      return mock(JdbcTemplate.class);
    }

    @Bean
    TransactionTemplate transactionTemplate() {
      return mock(TransactionTemplate.class);
    }
  }
}

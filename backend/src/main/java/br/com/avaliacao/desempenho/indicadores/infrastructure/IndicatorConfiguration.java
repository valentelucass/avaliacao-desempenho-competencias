package br.com.avaliacao.desempenho.indicadores.infrastructure;

import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorExportResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorFilterOptionsResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorResponseMapper;
import br.com.avaliacao.desempenho.indicadores.application.ExportIndicatorsUseCase;
import br.com.avaliacao.desempenho.indicadores.application.GetIndicatorFilterOptionsUseCase;
import br.com.avaliacao.desempenho.indicadores.application.GetIndicatorsUseCase;
import br.com.avaliacao.desempenho.indicadores.application.InMemoryIndicatorRequestLimiter;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorApplicationService;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorAuditSink;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorFilterOptionsRequestApplicationService;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorRequestApplicationService;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorRequestLimiter;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterPolicy;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResultPolicy;
import br.com.avaliacao.desempenho.indicadores.domain.port.IndicatorAggregationPort;
import br.com.avaliacao.desempenho.indicadores.domain.port.IndicatorFilterOptionsPort;
import br.com.avaliacao.desempenho.indicadores.infrastructure.persistence.SqlServerIndicatorAggregationRepository;
import br.com.avaliacao.desempenho.indicadores.infrastructure.persistence.SqlServerIndicatorFilterOptionsRepository;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Habilita indicadores apenas com SQL Server, identidade para auditoria e escolha externa explícita
 * do operador. A propriedade fica desabilitada por padrão para não consultar schema ainda não
 * migrado.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(IndicatorProperties.class)
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.indicators", name = "enabled", havingValue = "true")
public class IndicatorConfiguration {

  @Bean
  IndicatorAggregationPort indicatorAggregationPort(JdbcTemplate jdbcTemplate) {
    verifyRequiredMigrations(jdbcTemplate);
    return new SqlServerIndicatorAggregationRepository(jdbcTemplate);
  }

  @Bean
  IndicatorFilterOptionsPort indicatorFilterOptionsPort(JdbcTemplate jdbcTemplate) {
    return new SqlServerIndicatorFilterOptionsRepository(jdbcTemplate);
  }

  @Bean
  IndicatorApplicationService indicatorApplicationService(
      IndicatorAggregationPort aggregationPort) {
    return new IndicatorApplicationService(
        new IndicatorFilterPolicy(), new IndicatorResultPolicy(), aggregationPort);
  }

  @Bean
  IndicatorRequestLimiter indicatorRequestLimiter(Clock clock, IndicatorProperties properties) {
    properties.validateWhenEnabled();
    return new InMemoryIndicatorRequestLimiter(
        clock, properties.maximumRequests(), properties.rateWindow());
  }

  @Bean
  IndicatorAuditSink indicatorAuditSink(IdentityAccessRepository identityAccessRepository) {
    return new IdentityAccessIndicatorAuditSink(identityAccessRepository);
  }

  @Bean
  IndicatorRequestApplicationService indicatorRequestApplicationService(
      GetIndicatorsUseCase getIndicatorsUseCase,
      ExportIndicatorsUseCase exportIndicatorsUseCase,
      IndicatorRequestLimiter requestLimiter,
      IndicatorAuditSink auditSink) {
    return new IndicatorRequestApplicationService(
        getIndicatorsUseCase, exportIndicatorsUseCase, requestLimiter, auditSink);
  }

  @Bean
  GetIndicatorFilterOptionsUseCase getIndicatorFilterOptionsUseCase(
      IndicatorFilterOptionsPort optionsPort,
      IndicatorRequestLimiter requestLimiter,
      IndicatorAuditSink auditSink) {
    return new IndicatorFilterOptionsRequestApplicationService(
        optionsPort, requestLimiter, auditSink);
  }

  @Bean
  IndicatorResponseMapper indicatorResponseMapper() {
    return new IndicatorResponseMapper();
  }

  @Bean
  IndicatorExportResponseMapper indicatorExportResponseMapper(
      IndicatorResponseMapper indicatorResponseMapper) {
    return new IndicatorExportResponseMapper(indicatorResponseMapper);
  }

  @Bean
  IndicatorFilterOptionsResponseMapper indicatorFilterOptionsResponseMapper() {
    return new IndicatorFilterOptionsResponseMapper();
  }

  private static void verifyRequiredMigrations(JdbcTemplate jdbcTemplate) {
    Integer appliedMigrations =
        jdbcTemplate.queryForObject(
            """
            SELECT COUNT(*)
            FROM dbo.schema_migrations
            WHERE version IN ('V0003', 'V0004', 'V0005', 'V0006', 'V0007')
            """,
            Integer.class);
    if (appliedMigrations == null || appliedMigrations != 5) {
      throw new IllegalStateException(
          "Indicadores exigem as migrations V0003 a V0007 aplicadas antes da ativação.");
    }
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Cria a persistência somente quando a VM fornecer uma configuração externa completa. Nenhuma
 * credencial ou URL é versionada no repositório.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(SqlServerPersistenceProperties.class)
@ConditionalOnProperty(prefix = "app.persistence.sqlserver", name = "enabled", havingValue = "true")
public class SqlServerPersistenceConfiguration {

  @Bean(destroyMethod = "close")
  HikariDataSource sqlServerDataSource(SqlServerPersistenceProperties properties) {
    return new HikariDataSource(createHikariConfiguration(properties));
  }

  static HikariConfig createHikariConfiguration(SqlServerPersistenceProperties properties) {
    properties.validateWhenEnabled();
    HikariConfig configuration = new HikariConfig();
    configuration.setJdbcUrl(properties.jdbcUrl());
    if (!properties.usesWindowsIntegratedAuthentication()) {
      configuration.setUsername(properties.username());
      configuration.setPassword(properties.password());
    }
    configuration.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    configuration.setMaximumPoolSize(properties.maximumPoolSize());
    configuration.setMinimumIdle(0);
    configuration.setConnectionTimeout(properties.connectionTimeout().toMillis());
    configuration.setPoolName("adc-sqlserver");
    return configuration;
  }

  @Bean
  JdbcTemplate jdbcTemplate(DataSource sqlServerDataSource) {
    return new JdbcTemplate(sqlServerDataSource);
  }

  @Bean
  PlatformTransactionManager transactionManager(DataSource sqlServerDataSource) {
    return new DataSourceTransactionManager(sqlServerDataSource);
  }

  @Bean
  TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager) {
    return new TransactionTemplate(transactionManager);
  }
}

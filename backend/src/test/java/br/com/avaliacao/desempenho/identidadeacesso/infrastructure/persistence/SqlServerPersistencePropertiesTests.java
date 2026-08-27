package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.zaxxer.hikari.HikariConfig;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class SqlServerPersistencePropertiesTests {

  @Test
  void allowsWindowsIntegratedAuthenticationWithoutSqlCredentials() {
    SqlServerPersistenceProperties properties =
        properties(
            "jdbc:sqlserver://localhost:1433;databaseName=adc;integratedSecurity=true", null, null);

    assertThatCode(properties::validateWhenEnabled).doesNotThrowAnyException();
    assertThat(properties.usesWindowsIntegratedAuthentication()).isTrue();
  }

  @Test
  void doesNotConfigureSqlCredentialsWhenWindowsIntegratedAuthenticationIsSelected() {
    SqlServerPersistenceProperties properties =
        properties(
            "jdbc:sqlserver://localhost:1433;databaseName=adc;integratedSecurity=true",
            "ignored-user",
            "ignored-value");

    HikariConfig configuration =
        SqlServerPersistenceConfiguration.createHikariConfiguration(properties);

    assertThat(configuration.getUsername()).isNull();
    assertThat(configuration.getPassword()).isNull();
  }

  @Test
  void recognizesWindowsIntegratedAuthenticationWithoutMatchingOtherUrlProperties() {
    SqlServerPersistenceProperties properties =
        properties("jdbc:sqlserver://localhost:1433;notintegratedSecurity=true", null, null);

    assertThat(properties.usesWindowsIntegratedAuthentication()).isFalse();
    assertThatThrownBy(properties::validateWhenEnabled)
        .isInstanceOf(IllegalStateException.class)
        .hasMessage(
            "A conexão SQL Server habilitada exige URL, usuário e senha em configuração externa protegida.");
  }

  @Test
  void keepsSqlAuthenticationValidationAndHikariCredentialsWhenIntegratedSecurityIsAbsent() {
    SqlServerPersistenceProperties missingCredential =
        properties("jdbc:sqlserver://localhost:1433;databaseName=adc", "test-user", null);

    assertThatThrownBy(missingCredential::validateWhenEnabled)
        .isInstanceOf(IllegalStateException.class)
        .hasMessage(
            "A conexão SQL Server habilitada exige URL, usuário e senha em configuração externa protegida.");

    SqlServerPersistenceProperties properties =
        properties("jdbc:sqlserver://localhost:1433;databaseName=adc", "test-user", "test-value");

    HikariConfig configuration =
        SqlServerPersistenceConfiguration.createHikariConfiguration(properties);

    assertThat(configuration.getUsername()).isEqualTo("test-user");
    assertThat(configuration.getPassword()).isEqualTo("test-value");
  }

  private static SqlServerPersistenceProperties properties(
      String jdbcUrl, String username, String password) {
    return new SqlServerPersistenceProperties(
        true, jdbcUrl, username, password, 10, Duration.ofSeconds(10));
  }
}

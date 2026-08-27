package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import java.time.Duration;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuração externa da conexão SQL Server; a aplicação inicia sem banco por padrão. */
@ConfigurationProperties(prefix = "app.persistence.sqlserver")
public record SqlServerPersistenceProperties(
    boolean enabled,
    String jdbcUrl,
    String username,
    String password,
    Integer maximumPoolSize,
    Duration connectionTimeout) {

  private static final Pattern WINDOWS_INTEGRATED_SECURITY =
      Pattern.compile(
          "(?:^|;)\\s*integratedSecurity\\s*=\\s*true\\s*(?:;|$)", Pattern.CASE_INSENSITIVE);

  public SqlServerPersistenceProperties {
    maximumPoolSize = maximumPoolSize == null ? 10 : maximumPoolSize;
    connectionTimeout = connectionTimeout == null ? Duration.ofSeconds(10) : connectionTimeout;
  }

  public void validateWhenEnabled() {
    if (!enabled) {
      return;
    }
    if (isBlank(jdbcUrl)
        || (!usesWindowsIntegratedAuthentication() && (isBlank(username) || isBlank(password)))) {
      throw new IllegalStateException(
          "A conexão SQL Server habilitada exige URL, usuário e senha em configuração externa protegida.");
    }
    if (maximumPoolSize < 1 || maximumPoolSize > 50) {
      throw new IllegalStateException("O tamanho do pool SQL Server deve estar entre 1 e 50.");
    }
  }

  public boolean usesWindowsIntegratedAuthentication() {
    return jdbcUrl != null && WINDOWS_INTEGRATED_SECURITY.matcher(jdbcUrl).find();
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Parâmetros de autenticação fornecidos fora do Git para cada ambiente. */
@ConfigurationProperties(prefix = "app.security.authentication")
public record AuthenticationSecurityProperties(
    boolean enabled,
    String issuer,
    String audience,
    String hmacSecretBase64,
    Duration accessLifetime,
    Duration refreshLifetime,
    Integer failedLoginThreshold,
    Duration accountLockDuration,
    Integer loginMaximumAttempts,
    Duration loginWindow) {

  public AuthenticationSecurityProperties {
    accessLifetime = accessLifetime == null ? Duration.ofMinutes(15) : accessLifetime;
    refreshLifetime = refreshLifetime == null ? Duration.ofHours(8) : refreshLifetime;
    failedLoginThreshold = failedLoginThreshold == null ? 5 : failedLoginThreshold;
    accountLockDuration =
        accountLockDuration == null ? Duration.ofMinutes(15) : accountLockDuration;
    loginMaximumAttempts = loginMaximumAttempts == null ? 10 : loginMaximumAttempts;
    loginWindow = loginWindow == null ? Duration.ofMinutes(1) : loginWindow;
  }

  public void validateWhenEnabled() {
    if (!enabled) {
      return;
    }
    if (isBlank(issuer) || isBlank(audience) || isBlank(hmacSecretBase64)) {
      throw new IllegalStateException(
          "A autenticação habilitada exige issuer, audience e chave HMAC externos.");
    }
    if (accessLifetime.isNegative()
        || accessLifetime.isZero()
        || refreshLifetime.compareTo(accessLifetime) <= 0
        || failedLoginThreshold < 1
        || loginMaximumAttempts < 1
        || accountLockDuration.isNegative()
        || accountLockDuration.isZero()
        || loginWindow.isNegative()
        || loginWindow.isZero()) {
      throw new IllegalStateException("Os limites de autenticação configurados são inválidos.");
    }
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}

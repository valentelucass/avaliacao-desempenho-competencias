package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthenticationSession;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AccessTokenServiceTests {

  @Test
  void issuesAndValidatesOnlyTheConfiguredIssuerAudienceAndRequiredSessionClaims() {
    Instant now = Instant.parse("2026-01-01T12:00:00Z");
    AuthenticationSecurityProperties properties =
        new AuthenticationSecurityProperties(
            true,
            "https://api.example.internal",
            "adc-spa",
            Base64.getEncoder().encodeToString(new byte[32]),
            Duration.ofMinutes(15),
            Duration.ofHours(8),
            5,
            Duration.ofMinutes(15),
            10,
            Duration.ofMinutes(1));
    AccessTokenService service =
        new AccessTokenService(properties, Clock.fixed(now, ZoneOffset.UTC));
    UUID userId = UUID.randomUUID();
    UUID sessionId = UUID.randomUUID();
    AuthenticationSession session =
        new AuthenticationSession(
            sessionId,
            UUID.randomUUID(),
            userId,
            "access-token-id",
            now,
            now.plus(Duration.ofMinutes(15)));

    String token = service.issue(session).value();

    assertThat(service.decode(token))
        .hasValue(new AccessTokenService.DecodedAccessToken(userId, sessionId, "access-token-id"));
  }
}

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
  void rejectsMissingRequiredClaimsWrongSignatureAlgorithmAudienceAndTime() throws Exception {
    Instant now = Instant.parse("2026-01-01T12:00:00Z");
    byte[] key = new byte[32];
    new java.security.SecureRandom().nextBytes(key);
    var properties =
        new AuthenticationSecurityProperties(
            true,
            "fixture-issuer",
            "fixture-audience",
            Base64.getEncoder().encodeToString(key),
            null,
            null,
            null,
            null,
            null,
            null);
    var service = new AccessTokenService(properties, Clock.fixed(now, ZoneOffset.UTC));
    for (String omitted : java.util.List.of("exp", "nbf", "sub", "sid", "jti", "iss", "aud")) {
      var claims = claims(now).toJSONObject();
      var changed = new java.util.HashMap<String, Object>(claims);
      changed.remove(omitted);
      assertThat(
              service
                  .decode(
                      signed(
                          com.nimbusds.jwt.JWTClaimsSet.parse(changed),
                          key,
                          com.nimbusds.jose.JWSAlgorithm.HS256))
                  .isEmpty())
          .as("missing %s", omitted)
          .isTrue();
    }
    assertThat(service.decode(null)).isEmpty();
    for (var invalid :
        java.util.List.of(
            new com.nimbusds.jwt.JWTClaimsSet.Builder(claims(now)).issuer("other").build(),
            new com.nimbusds.jwt.JWTClaimsSet.Builder(claims(now)).audience("other").build(),
            new com.nimbusds.jwt.JWTClaimsSet.Builder(claims(now)).subject("invalid").build(),
            new com.nimbusds.jwt.JWTClaimsSet.Builder(claims(now)).jwtID("").build(),
            new com.nimbusds.jwt.JWTClaimsSet.Builder(claims(now))
                .expirationTime(java.util.Date.from(now.minusSeconds(1)))
                .build(),
            new com.nimbusds.jwt.JWTClaimsSet.Builder(claims(now))
                .notBeforeTime(java.util.Date.from(now.plusSeconds(1)))
                .build())) {
      assertThat(
              service.decode(signed(invalid, key, com.nimbusds.jose.JWSAlgorithm.HS256)).isEmpty())
          .isTrue();
    }
    byte[] otherKey = new byte[64];
    new java.security.SecureRandom().nextBytes(otherKey);
    assertThat(
            service
                .decode(signed(claims(now), otherKey, com.nimbusds.jose.JWSAlgorithm.HS256))
                .isEmpty())
        .isTrue();
    assertThat(
            service
                .decode(signed(claims(now), otherKey, com.nimbusds.jose.JWSAlgorithm.HS512))
                .isEmpty())
        .isTrue();
  }

  private static com.nimbusds.jwt.JWTClaimsSet claims(Instant now) {
    return new com.nimbusds.jwt.JWTClaimsSet.Builder()
        .issuer("fixture-issuer")
        .audience("fixture-audience")
        .subject(UUID.randomUUID().toString())
        .claim("sid", UUID.randomUUID().toString())
        .jwtID(UUID.randomUUID().toString())
        .notBeforeTime(java.util.Date.from(now))
        .expirationTime(java.util.Date.from(now.plusSeconds(60)))
        .build();
  }

  private static String signed(
      com.nimbusds.jwt.JWTClaimsSet claims, byte[] key, com.nimbusds.jose.JWSAlgorithm algorithm)
      throws Exception {
    var jwt = new com.nimbusds.jwt.SignedJWT(new com.nimbusds.jose.JWSHeader(algorithm), claims);
    jwt.sign(new com.nimbusds.jose.crypto.MACSigner(key));
    return jwt.serialize();
  }

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

package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthenticationSession;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.proc.SecurityContext;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

/**
 * Emite e valida JWT HS256 curto, sempre revalidado contra a sessão persistida depois do decode.
 */
@Service
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(
    prefix = "app.security.authentication",
    name = "enabled",
    havingValue = "true")
public class AccessTokenService {

  private static final String SESSION_ID_CLAIM = "sid";

  private final AuthenticationSecurityProperties properties;
  private final Clock clock;
  private final JwtEncoder encoder;
  private final JwtDecoder decoder;

  public AccessTokenService(AuthenticationSecurityProperties properties, Clock clock) {
    properties.validateWhenEnabled();
    this.properties = properties;
    this.clock = clock;
    SecretKey key = createSecretKey(properties.hmacSecretBase64());
    this.encoder = new NimbusJwtEncoder(new ImmutableSecret<SecurityContext>(key));
    NimbusJwtDecoder configuredDecoder =
        NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    JwtTimestampValidator timestampValidator = new JwtTimestampValidator();
    timestampValidator.setClock(clock);
    configuredDecoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            timestampValidator,
            new JwtClaimValidator<String>(JwtClaimNames.ISS, properties.issuer()::equals),
            audienceValidator(properties.audience())));
    this.decoder = configuredDecoder;
  }

  public IssuedAccessToken issue(AuthenticationSession session) {
    Instant now = clock.instant();
    JwtClaimsSet claims =
        JwtClaimsSet.builder()
            .issuer(properties.issuer())
            .audience(List.of(properties.audience()))
            .subject(session.userId().toString())
            .issuedAt(now)
            .notBefore(now)
            .expiresAt(session.expiresAt())
            .id(session.accessTokenId())
            .claim(SESSION_ID_CLAIM, session.sessionId().toString())
            .build();
    String encoded =
        encoder
            .encode(
                JwtEncoderParameters.from(
                    JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(), claims))
            .getTokenValue();
    return new IssuedAccessToken(encoded, session.expiresAt());
  }

  public Optional<DecodedAccessToken> decode(String token) {
    try {
      Jwt jwt = decoder.decode(token);
      return Optional.of(
          new DecodedAccessToken(
              UUID.fromString(jwt.getSubject()),
              UUID.fromString(jwt.getClaimAsString(SESSION_ID_CLAIM)),
              jwt.getId()));
    } catch (JwtException | IllegalArgumentException exception) {
      return Optional.empty();
    }
  }

  public Instant accessTokenExpiresAt(Instant issuedAt) {
    return issuedAt.plus(properties.accessLifetime());
  }

  public Instant refreshTokenExpiresAt(Instant issuedAt) {
    return issuedAt.plus(properties.refreshLifetime());
  }

  private static SecretKey createSecretKey(String base64Secret) {
    byte[] bytes;
    try {
      bytes = Base64.getDecoder().decode(base64Secret);
    } catch (IllegalArgumentException exception) {
      throw new IllegalStateException(
          "A chave HMAC de autenticação não é Base64 válida.", exception);
    }
    if (bytes.length < 32) {
      throw new IllegalStateException("A chave HMAC de autenticação deve ter ao menos 256 bits.");
    }
    return new SecretKeySpec(bytes, "HmacSHA256");
  }

  private static OAuth2TokenValidator<Jwt> audienceValidator(String expectedAudience) {
    return token ->
        token.getAudience().contains(expectedAudience)
            ? OAuth2TokenValidatorResult.success()
            : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
  }

  public record IssuedAccessToken(String value, Instant expiresAt) {}

  public record DecodedAccessToken(UUID userId, UUID sessionId, String accessTokenId) {
    public DecodedAccessToken {
      if (accessTokenId == null || accessTokenId.isBlank()) {
        throw new IllegalArgumentException("JWT jti is required.");
      }
    }
  }
}

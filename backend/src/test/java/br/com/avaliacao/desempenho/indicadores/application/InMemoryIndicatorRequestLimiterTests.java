package br.com.avaliacao.desempenho.indicadores.application;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class InMemoryIndicatorRequestLimiterTests {

  @Test
  void limitsRepeatedRequestsPerAuthenticatedActorWithoutBlockingAnotherActor() {
    InMemoryIndicatorRequestLimiter limiter =
        new InMemoryIndicatorRequestLimiter(
            Clock.fixed(Instant.parse("2026-08-25T20:00:00Z"), ZoneOffset.UTC),
            2,
            Duration.ofMinutes(15));
    UUID firstActor = UUID.randomUUID();

    limiter.checkAndRecord(firstActor);
    limiter.checkAndRecord(firstActor);

    assertThatThrownBy(() -> limiter.checkAndRecord(firstActor))
        .isInstanceOf(IndicatorRateLimitExceededException.class);
    assertThatCode(() -> limiter.checkAndRecord(UUID.randomUUID())).doesNotThrowAnyException();
  }
}

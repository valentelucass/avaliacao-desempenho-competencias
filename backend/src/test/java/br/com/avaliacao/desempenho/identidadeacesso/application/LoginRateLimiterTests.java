package br.com.avaliacao.desempenho.identidadeacesso.application;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class LoginRateLimiterTests {

  @Test
  void rejectsTheAttemptAfterTheConfiguredLimit() {
    LoginRateLimiter limiter =
        new LoginRateLimiter(
            Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC),
            2,
            Duration.ofMinutes(1));

    assertThatCode(() -> limiter.checkAndRecord("key")).doesNotThrowAnyException();
    assertThatCode(() -> limiter.checkAndRecord("key")).doesNotThrowAnyException();
    assertThatThrownBy(() -> limiter.checkAndRecord("key"))
        .isInstanceOf(RateLimitedException.class);
  }
}

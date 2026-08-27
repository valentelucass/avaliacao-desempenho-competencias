package br.com.avaliacao.desempenho.identidadeacesso.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limitador local e limitado para login. Ele nunca usa cabeçalhos encaminhados sem uma origem de
 * proxy explicitamente confiada.
 */
public final class LoginRateLimiter {

  private static final int MAX_TRACKED_KEYS = 10_000;

  private final Clock clock;
  private final int maximumAttempts;
  private final Duration window;
  private final Map<String, AttemptWindow> attemptsByKey = new ConcurrentHashMap<>();

  public LoginRateLimiter(Clock clock, int maximumAttempts, Duration window) {
    this.clock = clock;
    this.maximumAttempts = maximumAttempts;
    this.window = window;
  }

  public void checkAndRecord(String key) {
    Instant now = clock.instant();
    AttemptWindow next =
        attemptsByKey.compute(
            key,
            (ignored, current) -> {
              if (current == null || !current.windowStartedAt.plus(window).isAfter(now)) {
                return new AttemptWindow(now, 1);
              }
              return new AttemptWindow(current.windowStartedAt, current.count + 1);
            });
    trimIfNeeded();
    if (next.count > maximumAttempts) {
      throw new RateLimitedException();
    }
  }

  private void trimIfNeeded() {
    if (attemptsByKey.size() <= MAX_TRACKED_KEYS) {
      return;
    }
    Iterator<String> iterator = attemptsByKey.keySet().iterator();
    while (attemptsByKey.size() > MAX_TRACKED_KEYS / 2 && iterator.hasNext()) {
      attemptsByKey.remove(iterator.next());
    }
  }

  private record AttemptWindow(Instant windowStartedAt, int count) {}
}

package br.com.avaliacao.desempenho.indicadores.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limitador local, por ator autenticado, para reduzir tentativas repetidas de inferir dados por
 * diferença entre grupos. Em instalação com mais de uma instância, ele deve ser substituído por um
 * mecanismo coordenado antes de expor mais de uma instância.
 */
public final class InMemoryIndicatorRequestLimiter implements IndicatorRequestLimiter {

  private static final int MAX_TRACKED_ACTORS = 10_000;

  private final Clock clock;
  private final int maximumRequests;
  private final Duration window;
  private final Map<UUID, RequestWindow> requestsByActor = new ConcurrentHashMap<>();

  public InMemoryIndicatorRequestLimiter(Clock clock, int maximumRequests, Duration window) {
    this.clock = Objects.requireNonNull(clock, "relógio não pode ser nulo");
    if (maximumRequests < 1) {
      throw new IllegalArgumentException("O limite de consultas deve ser positivo.");
    }
    this.maximumRequests = maximumRequests;
    this.window = Objects.requireNonNull(window, "janela não pode ser nula");
    if (window.isZero() || window.isNegative()) {
      throw new IllegalArgumentException("A janela de consultas deve ser positiva.");
    }
  }

  @Override
  public void checkAndRecord(UUID actorUserId) {
    UUID actor = Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
    Instant now = clock.instant();
    RequestWindow next =
        requestsByActor.compute(
            actor,
            (ignored, current) -> {
              if (current == null || !current.startedAt().plus(window).isAfter(now)) {
                return new RequestWindow(now, 1);
              }
              return new RequestWindow(current.startedAt(), current.count() + 1);
            });
    trimIfNeeded();
    if (next.count() > maximumRequests) {
      throw new IndicatorRateLimitExceededException();
    }
  }

  private void trimIfNeeded() {
    if (requestsByActor.size() <= MAX_TRACKED_ACTORS) {
      return;
    }
    Iterator<UUID> iterator = requestsByActor.keySet().iterator();
    while (requestsByActor.size() > MAX_TRACKED_ACTORS / 2 && iterator.hasNext()) {
      requestsByActor.remove(iterator.next());
    }
  }

  private record RequestWindow(Instant startedAt, int count) {}
}

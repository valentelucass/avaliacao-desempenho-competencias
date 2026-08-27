package br.com.avaliacao.desempenho.indicadores.infrastructure;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuração externa e opcional para habilitar indicadores com uma fonte SQL Server pronta. */
@ConfigurationProperties(prefix = "app.indicators")
public record IndicatorProperties(boolean enabled, Integer maximumRequests, Duration rateWindow) {

  public IndicatorProperties {
    maximumRequests = maximumRequests == null ? 20 : maximumRequests;
    rateWindow = rateWindow == null ? Duration.ofMinutes(15) : rateWindow;
  }

  public void validateWhenEnabled() {
    if (!enabled) {
      return;
    }
    if (maximumRequests < 1 || maximumRequests > 100) {
      throw new IllegalStateException(
          "O limite de indicadores deve estar entre 1 e 100 por janela.");
    }
    if (rateWindow.isZero()
        || rateWindow.isNegative()
        || rateWindow.compareTo(Duration.ofHours(1)) > 0) {
      throw new IllegalStateException(
          "A janela de indicadores deve ser maior que zero e até uma hora.");
    }
  }
}

package br.com.avaliacao.desempenho.indicadores.domain.model;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleConfigurationDraft;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZoneOffset;

public record IndicatorDashboardPeriods(Period current, Period previous) {

  private static final ZoneId ZONE = ZoneId.of(EvaluationCycleConfigurationDraft.TIME_ZONE);

  public static IndicatorDashboardPeriods at(Instant instant) {
    var now = instant.atZone(ZONE);
    var currentMonth = YearMonth.from(now);
    var previousMonth = currentMonth.minusMonths(1);
    var priorCutoff =
        now.getDayOfMonth() > previousMonth.lengthOfMonth()
            ? currentMonth.atDay(1).atStartOfDay(ZONE)
            : now.minusMonths(1);
    return new IndicatorDashboardPeriods(
        new Period(currentMonth.atDay(1), now.toLocalDate(), instant),
        new Period(
            previousMonth.atDay(1),
            previousMonth.atDay(Math.min(now.getDayOfMonth(), previousMonth.lengthOfMonth())),
            priorCutoff.toInstant()));
  }

  public record Period(LocalDate firstDay, LocalDate lastDay, Instant cutoff) {
    public LocalDateTime startUtc() {
      return LocalDateTime.ofInstant(firstDay.atStartOfDay(ZONE).toInstant(), ZoneOffset.UTC);
    }

    public LocalDateTime cutoffUtc() {
      return LocalDateTime.ofInstant(cutoff, ZoneOffset.UTC);
    }
  }
}

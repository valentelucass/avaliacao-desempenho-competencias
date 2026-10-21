package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Objects;

/** Pedido de prorrogação; a janela atual e o relógio são confirmados na transação SQL. */
public record EvaluationCycleClosingExtension(
    LocalDateTime closingAtLocal, Instant expectedClosingAt, String reason) {

  public EvaluationCycleClosingExtension {
    Objects.requireNonNull(closingAtLocal, "novo encerramento não pode ser nulo");
    Objects.requireNonNull(expectedClosingAt, "encerramento esperado não pode ser nulo");
    try {
      int expectedYear = expectedClosingAt.atOffset(java.time.ZoneOffset.UTC).getYear();
      if (closingAtLocal.getYear() < 1
          || closingAtLocal.getYear() > 9999
          || expectedYear < 1
          || expectedYear > 9999) {
        throw new java.time.DateTimeException("Data fora do intervalo persistível");
      }
    } catch (java.time.DateTimeException exception) {
      throw new CycleAdministrationRuleViolation(
          "CYCLE_EXTENSION_DATE_INVALID", "Revise as datas informadas.");
    }
    reason =
        reason == null
            ? ""
            : reason.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ').strip();
    if (reason.length() < 10
        || reason.length() > 500
        || reason.codePoints().anyMatch(Character::isISOControl)) {
      throw new CycleAdministrationRuleViolation(
          "CYCLE_EXTENSION_REASON_INVALID", "Informe um motivo entre dez e quinhentos caracteres.");
    }
    // A coluna histórica do ciclo é datetime2(3); não aceitar arredondamento silencioso.
    if (closingAtLocal.getNano() % 1_000_000 != 0 || expectedClosingAt.getNano() % 100 != 0) {
      throw new CycleAdministrationRuleViolation(
          "CYCLE_EXTENSION_PRECISION_INVALID", "Revise a precisão das datas informadas.");
    }
  }

  public Instant closingAtUtc() {
    return closingAtLocal
        .atZone(ZoneId.of(EvaluationCycleConfigurationDraft.TIME_ZONE))
        .toInstant();
  }
}

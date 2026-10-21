package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import java.time.Instant;
import java.util.Objects;

/** Situação temporal da janela, independente da transição administrativa do ciclo. */
public enum EvaluationCycleWindowStatus {
  AGUARDANDO_ABERTURA,
  VIGENTE,
  PRAZO_ENCERRADO,
  SEM_JANELA;

  public static EvaluationCycleWindowStatus at(Instant openingAt, Instant closingAt, Instant now) {
    Objects.requireNonNull(now, "horário atual não pode ser nulo");
    if (openingAt == null || closingAt == null || !openingAt.isBefore(closingAt)) {
      return SEM_JANELA;
    }
    if (now.isBefore(openingAt)) {
      return AGUARDANDO_ABERTURA;
    }
    return now.isBefore(closingAt) ? VIGENTE : PRAZO_ENCERRADO;
  }
}

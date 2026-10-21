package br.com.avaliacao.desempenho.ciclosavaliacao.api.dto;

import java.time.Instant;
import java.util.UUID;

/** Resumo de ciclo e janela, sem autoria ou dados de colaboradores. */
public record EvaluationCycleResponse(
    UUID id,
    String name,
    String status,
    Instant openingAt,
    Instant closingAt,
    String windowStatus) {

  public EvaluationCycleResponse(UUID id, String name, String status) {
    this(id, name, status, null, null, "SEM_JANELA");
  }
}

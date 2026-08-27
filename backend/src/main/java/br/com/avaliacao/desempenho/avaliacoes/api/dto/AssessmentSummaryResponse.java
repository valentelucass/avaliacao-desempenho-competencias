package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import java.time.Instant;
import java.util.UUID;

/** Resumo autorizado de uma avaliação, sem campos calculados pelo cliente. */
public record AssessmentSummaryResponse(
    UUID id,
    CycleResponse cycle,
    EvaluatedResponse evaluated,
    String type,
    String status,
    String revision,
    Instant updatedAt) {

  public record CycleResponse(UUID id, String name) {}

  public record EvaluatedResponse(String displayName) {}
}

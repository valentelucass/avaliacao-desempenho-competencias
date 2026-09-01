package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import java.util.List;
import java.util.UUID;

/** Ciclos mínimos e já elegíveis para uma jornada de criação de avaliação. */
public record AssessmentCreationCycleOptionsResponse(List<CycleResponse> cycles) {

  public AssessmentCreationCycleOptionsResponse {
    cycles = List.copyOf(cycles);
  }

  public record CycleResponse(UUID id, String name) {}
}

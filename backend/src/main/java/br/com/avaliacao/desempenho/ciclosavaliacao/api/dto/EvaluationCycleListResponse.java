package br.com.avaliacao.desempenho.ciclosavaliacao.api.dto;

import java.util.List;

/** Página compatível com a convenção v1 de coleções por cursor. */
public record EvaluationCycleListResponse(
    List<EvaluationCycleResponse> items, EvaluationCyclePageResponse page) {

  public EvaluationCycleListResponse {
    items = List.copyOf(items);
  }

  public record EvaluationCyclePageResponse(int limit, String nextCursor) {}
}

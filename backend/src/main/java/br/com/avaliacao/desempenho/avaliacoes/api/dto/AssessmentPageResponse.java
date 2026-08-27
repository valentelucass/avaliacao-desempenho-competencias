package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import java.util.List;

/** Página de resumos compatível com a convenção v1 de coleções da API. */
public record AssessmentPageResponse(List<AssessmentSummaryResponse> items, PageMetadata page) {

  public record PageMetadata(int limit, String nextCursor) {}
}

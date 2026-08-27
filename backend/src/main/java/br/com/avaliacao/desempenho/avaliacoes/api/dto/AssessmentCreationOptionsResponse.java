package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import java.util.List;
import java.util.UUID;

/** Opções mínimas e autorizadas para criar uma avaliação de gestor no ciclo solicitado. */
public record AssessmentCreationOptionsResponse(List<CollaboratorResponse> collaborators) {

  public record CollaboratorResponse(UUID id, String displayName) {}
}

package br.com.avaliacao.desempenho.avaliacoes.application;

import java.util.List;
import java.util.UUID;

public interface AssessmentCoverageRepository {

  enum StartStatus {
    INICIADA,
    PENDENTE
  }

  record Entry(UUID collaboratorId, String displayName, UUID assessmentId) {}

  record Page(List<Entry> items, boolean hasNextPage) {}

  Page list(UUID cycleId, StartStatus status, String name, int page, int limit);
}

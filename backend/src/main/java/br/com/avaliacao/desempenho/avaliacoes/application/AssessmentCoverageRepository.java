package br.com.avaliacao.desempenho.avaliacoes.application;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

public interface AssessmentCoverageRepository {

  enum StartStatus {
    INICIADA,
    PENDENTE
  }

  record Filter(UUID cycleId, StartStatus status, String evaluatedName, String managerName) {
    public Filter {
      Objects.requireNonNull(cycleId);
      Objects.requireNonNull(status);
      evaluatedName = normalize(evaluatedName);
      managerName = normalize(managerName);
    }

    private static String normalize(String name) {
      return name == null || name.isBlank() ? null : name.strip();
    }
  }

  record Entry(UUID collaboratorId, String displayName, String managerName, UUID assessmentId) {}

  record Page(List<Entry> items, boolean hasNextPage) {}

  Page list(Filter filter, int page, int limit);

  List<Entry> listForExport(Filter filter, int limit);
}

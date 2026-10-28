package br.com.avaliacao.desempenho.avaliacoes.application;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import java.util.List;

/** Projeção mínima, com o mesmo escopo e filtros da listagem, sem respostas ou notas. */
public interface AssessmentExportRepository {
  List<ExportRow> listForExport(
      AssessmentAccessContext actor, AssessmentRepository.AssessmentListFilter filter, int limit);

  record ExportRow(
      String managerName,
      String evaluatedName,
      AssessmentStatus assessmentStatus,
      FeedbackStatus feedbackStatus) {}
}

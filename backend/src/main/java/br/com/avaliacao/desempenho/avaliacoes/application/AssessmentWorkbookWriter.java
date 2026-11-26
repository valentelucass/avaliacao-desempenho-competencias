package br.com.avaliacao.desempenho.avaliacoes.application;

import java.util.List;

/** Gera uma planilha sem persistir o conteúdo em disco. */
public interface AssessmentWorkbookWriter {
  byte[] write(List<AssessmentExportRepository.ExportRow> rows);

  byte[] writeCoverage(List<AssessmentCoverageRepository.Entry> rows);
}

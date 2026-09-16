package br.com.avaliacao.desempenho.cadastros.application;

import br.com.avaliacao.desempenho.cadastros.domain.model.AllocationImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.Snapshot;
import java.util.Set;
import java.util.UUID;

public interface SpreadsheetImportRepository {
  Snapshot snapshot(Set<String> names, UUID cycleId, boolean lock);

  AllocationImport.Snapshot allocationSnapshot(
      Set<String> names, Set<String> branches, Set<String> areas, boolean lock);
}

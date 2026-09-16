package br.com.avaliacao.desempenho.cadastros.application;

import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.Kind;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.SourceRow;
import java.util.List;

public interface SpreadsheetReader {
  int MAX_BYTES = 1_048_576;

  List<SourceRow> read(byte[] bytes, Kind kind);
}

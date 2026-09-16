package br.com.avaliacao.desempenho.cadastros.infrastructure.files;

import static br.com.avaliacao.desempenho.cadastros.application.SpreadsheetImportException.Reason.*;

import br.com.avaliacao.desempenho.cadastros.application.SpreadsheetImportException;
import br.com.avaliacao.desempenho.cadastros.domain.model.AllocationImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.ManagerAssignmentImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.SourceRow;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/** Extrai cabeçalhos de lotação ou vínculo com data, ignorando somente colunas extras de dados. */
final class XlsxAllocationRows {
  private XlsxAllocationRows() {}

  private static final String NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  private static final Set<String> HEADERS =
      Set.of("FILIAL", "COLABORADOR", "AREA", "GESTOR", "INICIO DA LOTACAO");

  static List<SourceRow> read(
      Document sheet, List<String> strings, boolean date1904, boolean managers) {
    Set<String> headers = managers ? Set.of("CONTA AVALIADORA", "COLABORADOR", "INICIO") : HEADERS;
    NodeList rows = sheet.getElementsByTagNameNS(NS, "row");
    if (rows.getLength() < 2 || rows.getLength() > 1001)
      throw new SpreadsheetImportException(LIMIT_EXCEEDED);
    Map<Integer, String> columns = new HashMap<>();
    List<SourceRow> result = new ArrayList<>();
    int previous = 0;
    for (int i = 0; i < rows.getLength(); i++) {
      Element row = (Element) rows.item(i);
      int line = Integer.parseInt(row.getAttribute("r"));
      if (line <= previous || line > 10001 || (i == 0 && line != 1))
        throw new SpreadsheetImportException(INVALID_FILE);
      previous = line;
      NodeList cells = row.getElementsByTagNameNS(NS, "c");
      if (cells.getLength() > 26) throw new SpreadsheetImportException(LIMIT_EXCEEDED);
      Set<Integer> seen = new HashSet<>();
      Map<String, String> values = new HashMap<>();
      for (int j = 0; j < cells.getLength(); j++) {
        Element cell = (Element) cells.item(j);
        String reference = cell.getAttribute("r");
        if (!reference.matches("[A-Z]" + line)) throw new SpreadsheetImportException(INVALID_FILE);
        int column = reference.charAt(0) - 'A';
        if (!seen.add(column)) throw new SpreadsheetImportException(INVALID_FILE);
        if (i == 0) {
          String type = cell.getAttribute("t");
          String header =
              SpreadsheetImport.key(
                  Set.of("s", "inlineStr", "str", "", "n").contains(type)
                      ? value(cell, strings)
                      : "");
          if (headers.contains(header)) {
            if (columns.containsValue(header)) throw new SpreadsheetImportException(INVALID_FILE);
            columns.put(column, header);
          }
        } else if (columns.containsKey(column)) {
          String header = columns.get(column);
          String value = value(cell, strings);
          if (header.equals(managers ? "INICIO" : "INICIO DA LOTACAO"))
            value = date(value, cell.getAttribute("t"), date1904);
          values.put(header, value);
        }
      }
      if (i == 0 && columns.size() != headers.size())
        throw new SpreadsheetImportException(INVALID_FILE);
      if (i > 0 && values.values().stream().anyMatch(value -> !value.isBlank())) {
        if (managers) {
          result.add(
              new SourceRow(
                  line,
                  values.getOrDefault("COLABORADOR", ""),
                  "",
                  "",
                  null,
                  new ManagerAssignmentImport.Fields(
                      values.getOrDefault("CONTA AVALIADORA", ""),
                      values.getOrDefault("INICIO", ""))));
          continue;
        }
        result.add(
            new SourceRow(
                line,
                values.getOrDefault("COLABORADOR", ""),
                "",
                "",
                new AllocationImport.Fields(
                    values.getOrDefault("FILIAL", ""),
                    values.getOrDefault("AREA", ""),
                    values.getOrDefault("GESTOR", ""),
                    values.getOrDefault("INICIO DA LOTACAO", ""))));
      }
    }
    if (result.isEmpty()) throw new SpreadsheetImportException(INVALID_FILE);
    return List.copyOf(result);
  }

  private static String value(Element cell, List<String> strings) {
    String type = cell.getAttribute("t");
    String value = RestrictedXlsxReader.text(cell, "v");
    return switch (type) {
      case "s" -> strings.get(Integer.parseInt(value));
      case "inlineStr" -> RestrictedXlsxReader.text(cell, "t");
      case "", "n", "str", "d" -> value;
      default -> throw new SpreadsheetImportException(INVALID_FILE);
    };
  }

  private static String date(String value, String type, boolean date1904) {
    if (value.isBlank()) return value;
    try {
      if (type.equals("d")) return LocalDate.parse(value).format(AllocationImport.DATE);
      if (!type.isEmpty() && !type.equals("n")) return value;
      int serial = new BigDecimal(value).intValueExact();
      // O serial 60 do sistema 1900 representa um dia inexistente. Frações não são truncadas.
      if (serial < (date1904 ? 0 : 1) || (!date1904 && serial == 60) || serial > 2958465)
        return "Data inválida";
      LocalDate date =
          date1904
              ? LocalDate.of(1904, 1, 1).plusDays(serial)
              : LocalDate.of(1899, 12, 31).plusDays(serial >= 61 ? serial - 1L : serial);
      if (date.getYear() > 9999) return "Data inválida";
      return date.format(AllocationImport.DATE);
    } catch (RuntimeException exception) {
      return "Data inválida";
    }
  }
}

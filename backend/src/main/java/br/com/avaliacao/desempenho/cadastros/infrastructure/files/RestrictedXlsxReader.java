package br.com.avaliacao.desempenho.cadastros.infrastructure.files;

import static br.com.avaliacao.desempenho.cadastros.application.SpreadsheetImportException.Reason.*;

import br.com.avaliacao.desempenho.cadastros.application.SpreadsheetImportException;
import br.com.avaliacao.desempenho.cadastros.application.SpreadsheetReader;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.Kind;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.SourceRow;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipInputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

/** Leitor de tabelas XLSX literais. Não executa Excel, fórmulas, links ou objetos. */
@Component
public class RestrictedXlsxReader implements SpreadsheetReader {
  private static final String SHEET_NS =
      "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  private static final int EXPANDED_LIMIT = 8 * MAX_BYTES;
  private static final Set<String> PARTS =
      Set.of(
          "[Content_Types].xml",
          "_rels/.rels",
          "xl/workbook.xml",
          "xl/_rels/workbook.xml.rels",
          "xl/worksheets/sheet1.xml",
          "xl/theme/theme1.xml",
          "xl/styles.xml",
          "xl/sharedStrings.xml",
          "docProps/core.xml",
          "docProps/app.xml");

  @Override
  public List<SourceRow> read(byte[] bytes, Kind kind) {
    if (bytes.length == 0 || bytes.length > MAX_BYTES) throw failure(LIMIT_EXCEEDED);
    try {
      Map<String, Document> parts = unzip(bytes);
      Document content = required(parts, "[Content_Types].xml");
      boolean workbookType = false;
      NodeList types = content.getElementsByTagNameNS("*", "Override");
      for (int i = 0; i < types.getLength(); i++) {
        Element type = (Element) types.item(i);
        if (type.getAttribute("PartName").equals("/xl/workbook.xml")) {
          workbookType =
              type.getAttribute("ContentType")
                  .equals(
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml");
        }
      }
      if (!workbookType) throw failure(INVALID_FILE);
      Document workbook = required(parts, "xl/workbook.xml");
      NodeList sheets = workbook.getElementsByTagNameNS(SHEET_NS, "sheet");
      if (sheets.getLength() != 1) throw failure(INVALID_FILE);
      // O modelo recebido contém o intervalo do filtro automático do Excel.
      // Só esse nome interno, com referência literal à própria aba, é permitido.
      String sheetName = ((Element) sheets.item(0)).getAttribute("name");
      NodeList definedNames = workbook.getElementsByTagNameNS(SHEET_NS, "definedName");
      for (int i = 0; i < definedNames.getLength(); i++) {
        Element name = (Element) definedNames.item(i);
        String reference = name.getTextContent();
        String prefix = sheetName + "!";
        String quotedPrefix = "'" + sheetName.replace("'", "''") + "'!";
        String range =
            reference.startsWith(prefix)
                ? reference.substring(prefix.length())
                : reference.startsWith(quotedPrefix)
                    ? reference.substring(quotedPrefix.length())
                    : "";
        if (!name.getAttribute("name").equals("_xlnm._FilterDatabase")
            || !range.matches(
                (kind == Kind.ALLOCATIONS || kind == Kind.MANAGER_ASSIGNMENTS)
                    ? "\\$[A-Z]\\$[1-9][0-9]{0,4}:\\$[A-Z]\\$[1-9][0-9]{0,4}"
                    : "\\$[A-D]\\$[1-9][0-9]{0,4}:\\$[A-D]\\$[1-9][0-9]{0,4}"))
          throw failure(INVALID_FILE);
      }
      String id =
          ((Element) sheets.item(0))
              .getAttributeNS(
                  "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      NodeList links =
          required(parts, "xl/_rels/workbook.xml.rels").getElementsByTagNameNS("*", "Relationship");
      boolean worksheetLinked = false;
      for (int i = 0; i < links.getLength(); i++) {
        Element link = (Element) links.item(i);
        if (id.equals(link.getAttribute("Id"))
            && link.getAttribute("Type").endsWith("/worksheet")
            && Set.of("worksheets/sheet1.xml", "/xl/worksheets/sheet1.xml")
                .contains(link.getAttribute("Target"))) worksheetLinked = true;
      }
      if (!worksheetLinked) throw failure(INVALID_FILE);
      if (kind == Kind.ALLOCATIONS || kind == Kind.MANAGER_ASSIGNMENTS) {
        NodeList properties = workbook.getElementsByTagNameNS(SHEET_NS, "workbookPr");
        if (properties.getLength() > 1) throw failure(INVALID_FILE);
        String dateSystem =
            properties.getLength() == 0
                ? ""
                : ((Element) properties.item(0)).getAttribute("date1904");
        if (!Set.of("", "0", "1", "false", "true").contains(dateSystem))
          throw failure(INVALID_FILE);
        return XlsxAllocationRows.read(
            required(parts, "xl/worksheets/sheet1.xml"),
            strings(parts.get("xl/sharedStrings.xml"), 26026),
            dateSystem.equals("1") || dateSystem.equals("true"),
            kind == Kind.MANAGER_ASSIGNMENTS);
      }
      return rows(
          required(parts, "xl/worksheets/sheet1.xml"),
          strings(parts.get("xl/sharedStrings.xml"), 5000),
          kind);
    } catch (SpreadsheetImportException exception) {
      throw exception;
    } catch (Exception exception) {
      // Não propagar XML, valores, caminhos ou mensagens do parser ao log/API.
      throw failure(INVALID_FILE);
    }
  }

  private Map<String, Document> unzip(byte[] bytes) throws Exception {
    Map<String, Document> parts = new HashMap<>();
    int expanded = 0;
    try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
      for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
        String name = entry.getName();
        if (!PARTS.contains(name) || parts.containsKey(name)) throw failure(INVALID_FILE);
        byte[] xml = zip.readNBytes(EXPANDED_LIMIT - expanded + 1);
        expanded += xml.length;
        if (expanded > EXPANDED_LIMIT) throw failure(LIMIT_EXCEEDED);
        Document document = xml(xml);
        NodeList relationships = document.getElementsByTagNameNS("*", "Relationship");
        for (int i = 0; i < relationships.getLength(); i++) {
          Element relationship = (Element) relationships.item(i);
          String target = relationship.getAttribute("Target");
          String type = relationship.getAttribute("Type");
          if (!relationship.getAttribute("TargetMode").isEmpty()
              || target.contains(":")
              || target.contains("..")
              || target.contains("\\")
              || !(type.endsWith("/officeDocument")
                  || type.endsWith("/worksheet")
                  || type.endsWith("/styles")
                  || type.endsWith("/sharedStrings")
                  || type.endsWith("/theme")
                  || type.endsWith("/metadata/core-properties")
                  || type.endsWith("/extended-properties"))) throw failure(INVALID_FILE);
        }
        for (String tag :
            List.of("f", "formula1", "formula2", "hyperlink", "externalReference", "oleObject"))
          if (document.getElementsByTagNameNS(SHEET_NS, tag).getLength() != 0)
            throw failure(INVALID_FILE);
        parts.put(name, document);
      }
    }
    return parts;
  }

  private static Document xml(byte[] bytes) throws Exception {
    var factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    factory.setAttribute("jdk.xml.maxElementDepth", "64");
    factory.setXIncludeAware(false);
    factory.setExpandEntityReferences(false);
    var builder = factory.newDocumentBuilder();
    builder.setErrorHandler(
        new DefaultHandler() {
          @Override
          public void error(SAXParseException e) throws SAXParseException {
            throw e;
          }

          @Override
          public void fatalError(SAXParseException e) throws SAXParseException {
            throw e;
          }
        });
    return builder.parse(new ByteArrayInputStream(bytes));
  }

  private static List<String> strings(Document document, int maximum) {
    if (document == null) return List.of();
    NodeList items = document.getElementsByTagNameNS(SHEET_NS, "si");
    if (items.getLength() > maximum) throw failure(LIMIT_EXCEEDED);
    List<String> result = new ArrayList<>();
    for (int i = 0; i < items.getLength(); i++) result.add(text((Element) items.item(i), "t"));
    return result;
  }

  private static List<SourceRow> rows(Document sheet, List<String> strings, Kind kind) {
    NodeList rows = sheet.getElementsByTagNameNS(SHEET_NS, "row");
    if (rows.getLength() < 2 || rows.getLength() > 1001) throw failure(LIMIT_EXCEEDED);
    List<String> expected =
        kind == Kind.COLLABORATORS
            ? List.of("COLABORADORES")
            : List.of(
                "CICLO EM RASCUNHO", "FILIAL", "COLABORADOR", "QUESTIONARIO APLICADO NO CICLO");
    List<SourceRow> result = new ArrayList<>();
    int previous = 0;
    for (int i = 0; i < rows.getLength(); i++) {
      Element row = (Element) rows.item(i);
      int line = Integer.parseInt(row.getAttribute("r"));
      if (line <= previous || line > 10001 || (i == 0 && line != 1)) throw failure(INVALID_FILE);
      previous = line;
      String[] values = new String[expected.size()];
      java.util.Arrays.fill(values, "");
      Set<Integer> seen = new HashSet<>();
      NodeList cells = row.getElementsByTagNameNS(SHEET_NS, "c");
      if (cells.getLength() > expected.size()) throw failure(INVALID_FILE);
      for (int j = 0; j < cells.getLength(); j++) {
        Element cell = (Element) cells.item(j);
        String reference = cell.getAttribute("r");
        if (!reference.matches("[A-D]" + line)) throw failure(INVALID_FILE);
        int column = reference.charAt(0) - 'A';
        if (column >= values.length || !seen.add(column)) throw failure(INVALID_FILE);
        // Filial não participa dos dados nem torna uma linha vazia em atribuição.
        if (i > 0 && kind == Kind.ASSIGNMENTS && column == 1) continue;
        String type = cell.getAttribute("t");
        String value = text(cell, "v");
        values[column] =
            switch (type) {
              case "s" -> strings.get(Integer.parseInt(value));
              case "inlineStr" -> text(cell, "t");
              case "", "n", "str" -> value;
              default -> throw failure(INVALID_FILE);
            };
      }
      if (i == 0) {
        for (int column = 0; column < values.length; column++)
          if (!SpreadsheetImport.key(values[column]).equals(expected.get(column)))
            throw failure(INVALID_FILE);
      } else if (java.util.Arrays.stream(values).anyMatch(value -> !value.isBlank())) {
        result.add(
            kind == Kind.COLLABORATORS
                ? new SourceRow(line, values[0], "", "")
                : new SourceRow(line, values[2], values[0], values[3]));
      }
    }
    if (result.isEmpty()) throw failure(INVALID_FILE);
    return List.copyOf(result);
  }

  static String text(Element element, String tag) {
    NodeList nodes = element.getElementsByTagNameNS(SHEET_NS, tag);
    StringBuilder value = new StringBuilder();
    for (int i = 0; i < nodes.getLength(); i++) {
      value.append(nodes.item(i).getTextContent());
      if (value.length() > 2000) throw failure(LIMIT_EXCEEDED);
    }
    return SpreadsheetImport.cleanText(value.toString());
  }

  private static Document required(Map<String, Document> parts, String name) {
    Document part = parts.get(name);
    if (part == null) throw failure(INVALID_FILE);
    return part;
  }

  private static SpreadsheetImportException failure(SpreadsheetImportException.Reason reason) {
    return new SpreadsheetImportException(reason);
  }
}

package br.com.avaliacao.desempenho.avaliacoes.infrastructure.files;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.Entry;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentExportRepository.ExportRow;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentWorkbookWriter;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Function;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.xml.stream.XMLOutputFactory;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamWriter;
import org.springframework.stereotype.Component;

/**
 * OOXML mínimo: somente texto literal, sem fórmulas, vínculos externos, macros ou arquivos locais.
 */
@Component
public final class AssessmentXlsxWriter implements AssessmentWorkbookWriter {
  private static final String NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

  @Override
  public byte[] write(List<ExportRow> rows) {
    return writeSheet(
        "Avaliações",
        List.of("Gestor", "Colaborador avaliado", "Status da Avaliação", "Status do Feedback"),
        new int[] {38, 42, 25, 25},
        rows,
        AssessmentXlsxWriter::assessmentCells);
  }

  @Override
  public byte[] writeCoverage(List<Entry> rows) {
    return writeSheet(
        "Acompanhamento do início",
        List.of("Colaborador", "Gestor responsável", "Início da avaliação"),
        new int[] {42, 42, 24},
        rows,
        entry ->
            List.of(
                entry.displayName(),
                entry.managerName() == null ? "Sem gestor vinculado" : entry.managerName(),
                entry.assessmentId() == null ? "Pendente" : "Iniciada"));
  }

  private static List<String> assessmentCells(ExportRow value) {
    String status =
        switch (value.assessmentStatus()) {
          case RASCUNHO -> "Rascunho";
          case ENVIADA -> "Enviada";
          case PUBLICADA -> "Publicada";
        };
    String feedback =
        switch (value.feedbackStatus()) {
          case PENDENTE -> "Pendente";
          case CONCLUIDO -> "Concluído";
          case NAO_APLICAVEL -> "Não aplicável";
        };
    return List.of(
        value.managerName() == null ? "Não se aplica" : value.managerName(),
        value.evaluatedName(),
        status,
        feedback);
  }

  private static <Row> byte[] writeSheet(
      String sheetName,
      List<String> headings,
      int[] widths,
      List<Row> rows,
      Function<Row, List<String>> cells) {
    String range = "A1:" + (char) ('A' + headings.size() - 1) + (rows.size() + 1);
    try (var bytes = new ByteArrayOutputStream();
        var zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
      entry(
          zip,
          "[Content_Types].xml",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Default Extension="xml" ContentType="application/xml"/>
            <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
            <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
            <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
          </Types>
          """);
      entry(
          zip,
          "_rels/.rels",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
          </Relationships>
          """);
      entry(
          zip,
          "xl/workbook.xml",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <sheets><sheet name="%s" sheetId="1" r:id="rId1"/></sheets>
          </workbook>
          """
              .formatted(sheetName));
      entry(
          zip,
          "xl/_rels/workbook.xml.rels",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
            <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
          </Relationships>
          """);
      entry(
          zip,
          "xl/styles.xml",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
            <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>
            <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F4F8"/><bgColor indexed="64"/></patternFill></fill></fills>
            <borders count="1"><border/></borders>
            <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
            <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
            <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
          </styleSheet>
          """);
      zip.putNextEntry(new ZipEntry("xl/worksheets/sheet1.xml"));
      var xml = XMLOutputFactory.newFactory().createXMLStreamWriter(zip, "UTF-8");
      xml.writeStartDocument("UTF-8", "1.0");
      xml.writeStartElement("worksheet");
      xml.writeDefaultNamespace(NS);
      xml.writeEmptyElement("dimension");
      xml.writeAttribute("ref", range);
      xml.writeStartElement("sheetViews");
      xml.writeStartElement("sheetView");
      xml.writeAttribute("workbookViewId", "0");
      xml.writeEmptyElement("pane");
      xml.writeAttribute("ySplit", "1");
      xml.writeAttribute("topLeftCell", "A2");
      xml.writeAttribute("activePane", "bottomLeft");
      xml.writeAttribute("state", "frozen");
      xml.writeEndElement();
      xml.writeEndElement();
      xml.writeStartElement("cols");
      for (int col = 0; col < widths.length; col++) {
        xml.writeEmptyElement("col");
        xml.writeAttribute("min", String.valueOf(col + 1));
        xml.writeAttribute("max", String.valueOf(col + 1));
        xml.writeAttribute("width", String.valueOf(widths[col]));
        xml.writeAttribute("customWidth", "1");
      }
      xml.writeEndElement();
      xml.writeStartElement("sheetData");
      row(xml, 1, 1, headings);
      int number = 2;
      for (Row value : rows) {
        row(xml, number, number % 2 == 0 ? 2 : 3, cells.apply(value));
        number++;
      }
      xml.writeEndElement();
      xml.writeEmptyElement("autoFilter");
      xml.writeAttribute("ref", range);
      xml.writeEndElement();
      xml.writeEndDocument();
      xml.flush();
      zip.closeEntry();
      zip.finish();
      return bytes.toByteArray();
    } catch (IOException | XMLStreamException exception) {
      throw new IllegalStateException("Não foi possível preparar a planilha.", exception);
    }
  }

  private static void row(XMLStreamWriter xml, int number, int style, List<String> values)
      throws XMLStreamException {
    xml.writeStartElement("row");
    xml.writeAttribute("r", String.valueOf(number));
    if (number == 1) {
      xml.writeAttribute("ht", "30");
      xml.writeAttribute("customHeight", "1");
    }
    for (int col = 0; col < values.size(); col++) {
      xml.writeStartElement("c");
      xml.writeAttribute("r", String.valueOf((char) ('A' + col)) + number);
      xml.writeAttribute("s", String.valueOf(style));
      xml.writeAttribute("t", "inlineStr");
      xml.writeStartElement("is");
      xml.writeStartElement("t");
      xml.writeAttribute("xml", "http://www.w3.org/XML/1998/namespace", "space", "preserve");
      xml.writeCharacters(xmlText(values.get(col)));
      xml.writeEndElement();
      xml.writeEndElement();
      xml.writeEndElement();
    }
    xml.writeEndElement();
  }

  private static String xmlText(String input) {
    var value = new StringBuilder();
    input
        .codePoints()
        .filter(
            c ->
                c == 9
                    || c == 10
                    || c == 13
                    || (c >= 32 && c <= 0xD7FF)
                    || (c >= 0xE000 && c <= 0xFFFD)
                    || (c >= 0x10000 && c <= 0x10FFFF))
        .forEach(value::appendCodePoint);
    return value.toString();
  }

  private static void entry(ZipOutputStream zip, String name, String content) throws IOException {
    zip.putNextEntry(new ZipEntry(name));
    zip.write(content.getBytes(StandardCharsets.UTF_8));
    zip.closeEntry();
  }
}

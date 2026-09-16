package br.com.avaliacao.desempenho.cadastros.importacao;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Arquivos gerados apenas com dados fictícios; sem dependência de arquivos do usuário. */
public final class XlsxFixture {
  private XlsxFixture() {}

  public static byte[] collaborators(String... names) {
    String[][] cells = new String[names.length + 1][];
    cells[0] = new String[] {"Colaboradores"};
    for (int i = 0; i < names.length; i++) cells[i + 1] = new String[] {names[i]};
    return zip(parts(cells));
  }

  public static Map<String, String> parts(String[][] rows) {
    Map<String, String> parts = new LinkedHashMap<>();
    parts.put(
        "[Content_Types].xml",
        """
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        </Types>""");
    parts.put(
        "xl/workbook.xml",
        """
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Planilha" sheetId="1" r:id="rId1"/></sheets></workbook>""");
    parts.put(
        "xl/_rels/workbook.xml.rels",
        """
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>
        </Relationships>""");
    StringBuilder sheet =
        new StringBuilder(
            "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
    for (int r = 0; r < rows.length; r++) {
      sheet.append("<row r=\"").append(r + 1).append("\">");
      for (int c = 0; c < rows[r].length; c++)
        sheet
            .append("<c r=\"")
            .append((char) ('A' + c))
            .append(r + 1)
            .append("\" t=\"inlineStr\"><is><t>")
            .append(escape(rows[r][c]))
            .append("</t></is></c>");
      sheet.append("</row>");
    }
    parts.put("xl/worksheets/sheet1.xml", sheet.append("</sheetData></worksheet>").toString());
    return parts;
  }

  public static byte[] zip(Map<String, String> parts) {
    try {
      var bytes = new ByteArrayOutputStream();
      try (var zip = new ZipOutputStream(bytes)) {
        for (var entry : parts.entrySet()) {
          zip.putNextEntry(new ZipEntry(entry.getKey()));
          zip.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
          zip.closeEntry();
        }
      }
      return bytes.toByteArray();
    } catch (Exception e) {
      throw new AssertionError("Fixture inválida", e);
    }
  }

  private static String escape(String value) {
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }
}

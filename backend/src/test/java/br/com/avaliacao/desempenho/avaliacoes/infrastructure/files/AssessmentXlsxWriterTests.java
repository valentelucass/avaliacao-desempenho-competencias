package br.com.avaliacao.desempenho.avaliacoes.infrastructure.files;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentExportRepository.ExportRow;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipInputStream;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;

class AssessmentXlsxWriterTests {
  @Test
  void createsReadableWorkbookWithLiteralTextAndAllSituations() throws Exception {
    var rows =
        List.of(
            new ExportRow(
                "=HYPERLINK(\"https://example.invalid\")",
                "João & <Ana>\u0001",
                AssessmentStatus.PUBLICADA,
                FeedbackStatus.CONCLUIDO),
            new ExportRow(null, "+Pessoa", AssessmentStatus.ENVIADA, FeedbackStatus.NAO_APLICAVEL),
            new ExportRow("Gestora", "Pessoa", AssessmentStatus.RASCUNHO, FeedbackStatus.PENDENTE));
    var parts = unzip(new AssessmentXlsxWriter().write(rows));
    assertThat(parts.keySet())
        .containsExactlyInAnyOrder(
            "[Content_Types].xml",
            "_rels/.rels",
            "xl/workbook.xml",
            "xl/_rels/workbook.xml.rels",
            "xl/styles.xml",
            "xl/worksheets/sheet1.xml");
    for (String value : parts.values()) {
      var factory = DocumentBuilderFactory.newInstance();
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory
          .newDocumentBuilder()
          .parse(new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)));
    }
    String sheet = parts.get("xl/worksheets/sheet1.xml");
    assertThat(sheet)
        .contains(
            "Gestor",
            "Colaborador avaliado",
            "Status da Avaliação",
            "Status do Feedback",
            "João &amp; &lt;Ana&gt;",
            "HYPERLINK",
            "Não se aplica",
            "Não aplicável",
            "Concluído",
            "Enviada",
            "Rascunho",
            "Pendente",
            "ySplit=\"1\"",
            "autoFilter ref=\"A1:D4\"");
    assertThat(sheet).doesNotContain("<f>", "\u0001", "externalLink");
    assertThat(sheet.split("t=\"inlineStr\"", -1)).hasSize(17);
  }

  @Test
  void emptyExportStillHasExactlyTheFourHeaders() throws Exception {
    assertThat(unzip(new AssessmentXlsxWriter().write(List.of())).get("xl/worksheets/sheet1.xml"))
        .contains("A1:D1")
        .doesNotContain("r=\"A2\"");
  }

  static Map<String, String> unzip(byte[] content) throws Exception {
    var result = new LinkedHashMap<String, String>();
    try (var zip = new ZipInputStream(new ByteArrayInputStream(content), StandardCharsets.UTF_8)) {
      for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
        result.put(entry.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
      }
    }
    return result;
  }
}

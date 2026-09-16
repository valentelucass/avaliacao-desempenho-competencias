package br.com.avaliacao.desempenho.cadastros.importacao;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.cadastros.application.*;
import br.com.avaliacao.desempenho.cadastros.domain.model.ManagerAssignmentImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;
import br.com.avaliacao.desempenho.cadastros.infrastructure.files.RestrictedXlsxReader;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class ManagerAssignmentImportTests {
  private final UUID person = UUID.randomUUID(),
      manager = UUID.randomUUID(),
      actor = UUID.randomUUID();
  private final RestrictedXlsxReader reader = new RestrictedXlsxReader();

  static byte[] file(String manager, String person, String start) {
    return XlsxFixture.zip(
        XlsxFixture.parts(
            new String[][] {
              {"Conta avaliadora", "Colaborador", "Início"}, {manager, person, start}
            }));
  }

  private ManagerAssignmentImport.Snapshot snapshot(
      List<ManagerAssignmentImport.Existing> existing) {
    return new ManagerAssignmentImport.Snapshot(
        Map.of("PESSOA", List.of(new Collaborator(person, true))),
        Map.of("GESTORA", List.of(manager)),
        Map.of(person, existing));
  }

  private List<SourceRow> source() {
    return reader.read(file("Gestora", "Pessoa", "16/09/2026"), Kind.MANAGER_ASSIGNMENTS);
  }

  @Test
  void downloadableTemplateHasTheExpectedHeadersAndAcceptsFilledRows() throws Exception {
    var parts = new java.util.LinkedHashMap<String, String>();
    try (var zip =
        new java.util.zip.ZipInputStream(
            java.nio.file.Files.newInputStream(
                java.nio.file.Path.of(
                    "../frontend/public/templates/vinculos-gestor-colaborador.xlsx")))) {
      java.util.zip.ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null)
        parts.put(
            entry.getName(),
            new String(zip.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
    }
    String generated =
        XlsxFixture.parts(
                new String[][] {
                  {"Conta avaliadora", "Colaborador", "Início"}, {"Gestora", "Pessoa", "16/09/2026"}
                })
            .get("xl/worksheets/sheet1.xml");
    String row =
        generated.substring(generated.indexOf("<row r=\"2\""), generated.indexOf("</sheetData>"));
    parts.compute(
        "xl/worksheets/sheet1.xml", (k, v) -> v.replace("</sheetData>", row + "</sheetData>"));
    var result = reader.read(XlsxFixture.zip(parts), Kind.MANAGER_ASSIGNMENTS);
    assertThat(result).isEqualTo(source());
  }

  @Test
  void readsNamedColumnsInAnyOrderAndExcelDatesButRejectsUnsafeContent() {
    var parts =
        XlsxFixture.parts(
            new String[][] {
              {"Início", "Colaborador", "Extra", "Conta avaliadora"},
              {"16/09/2026", "Pessoa", "ignorar", "Gestora"}
            });
    parts.compute(
        "xl/worksheets/sheet1.xml",
        (k, v) ->
            v.replace(
                "<c r=\"A2\" t=\"inlineStr\"><is><t>16/09/2026</t></is></c>",
                "<c r=\"A2\" t=\"n\"><v>46281</v></c>"));
    var rows = reader.read(XlsxFixture.zip(parts), Kind.MANAGER_ASSIGNMENTS);
    assertThat(rows.getFirst().managerAssignment().startsOn()).isEqualTo("16/09/2026");
    assertThat(rows.getFirst().managerAssignment().manager()).isEqualTo("Gestora");
    assertThat(rows.toString()).doesNotContain("ignorar");
    parts.compute(
        "xl/worksheets/sheet1.xml",
        (k, v) -> v.replace("<is><t>ignorar</t></is>", "<f>1+1</f><v>2</v>"));
    assertThatThrownBy(() -> reader.read(XlsxFixture.zip(parts), Kind.MANAGER_ASSIGNMENTS))
        .isInstanceOf(SpreadsheetImportException.class);
    assertThatThrownBy(
            () -> reader.read(XlsxFixture.collaborators("Pessoa"), Kind.MANAGER_ASSIGNMENTS))
        .isInstanceOf(SpreadsheetImportException.class);
  }

  @Test
  void keepsIdenticalAssignmentsAndRejectsOtherManagersDatesOrOverlaps() {
    var start = LocalDate.of(2026, 9, 16);
    var identical = new ManagerAssignmentImport.Existing(manager, start, null, false);
    assertThat(ManagerAssignmentImport.review(source(), snapshot(List.of())).getFirst().status())
        .isEqualTo(Status.CREATE);
    assertThat(
            ManagerAssignmentImport.review(source(), snapshot(List.of(identical)))
                .getFirst()
                .status())
        .isEqualTo(Status.EXISTS);
    for (var other :
        List.of(
            new ManagerAssignmentImport.Existing(UUID.randomUUID(), start, null, false),
            new ManagerAssignmentImport.Existing(manager, start.minusDays(1), null, false),
            new ManagerAssignmentImport.Existing(manager, start.minusDays(3), start, true),
            new ManagerAssignmentImport.Existing(manager, start.plusDays(1), null, false))) {
      assertThat(
              ManagerAssignmentImport.review(source(), snapshot(List.of(other)))
                  .getFirst()
                  .status())
          .isEqualTo(Status.ERROR);
    }
    var past =
        new ManagerAssignmentImport.Existing(manager, start.minusDays(3), start.minusDays(1), true);
    assertThat(
            ManagerAssignmentImport.review(source(), snapshot(List.of(past))).getFirst().status())
        .isEqualTo(Status.CREATE);
  }

  @Test
  void blocksInactiveAmbiguousMissingOrRepeatedPeopleAndUnavailableAccounts() {
    for (var people :
        List.of(
            List.<Collaborator>of(),
            List.of(new Collaborator(person, false)),
            List.of(new Collaborator(person, true), new Collaborator(UUID.randomUUID(), true)))) {
      var data =
          new ManagerAssignmentImport.Snapshot(
              Map.of("PESSOA", people), snapshot(List.of()).managers(), Map.of());
      assertThat(ManagerAssignmentImport.review(source(), data).getFirst().status())
          .isEqualTo(Status.ERROR);
    }
    for (var managers : List.of(List.<UUID>of(), List.of(manager, UUID.randomUUID()))) {
      var data =
          new ManagerAssignmentImport.Snapshot(
              snapshot(List.of()).collaborators(), Map.of("GESTORA", managers), Map.of());
      assertThat(ManagerAssignmentImport.review(source(), data).getFirst().status())
          .isEqualTo(Status.ERROR);
    }
    assertThat(
            ManagerAssignmentImport.review(
                    List.of(source().getFirst(), source().getFirst()), snapshot(List.of()))
                .getLast()
                .status())
        .isEqualTo(Status.ERROR);
  }

  @Test
  void rejectsInvalidDatesAndAcceptsLeapDays() {
    for (String date : List.of("29/02/2026", "31/04/2026", "16/09/2026 10:00", "", "01/01/0000")) {
      var rows = reader.read(file("Gestora", "Pessoa", date), Kind.MANAGER_ASSIGNMENTS);
      assertThat(ManagerAssignmentImport.review(rows, snapshot(List.of())).getFirst().status())
          .isEqualTo(Status.ERROR);
    }
    assertThat(
            ManagerAssignmentImport.review(
                    reader.read(file("Gestora", "Pessoa", "29/02/2028"), Kind.MANAGER_ASSIGNMENTS),
                    snapshot(List.of()))
                .getFirst()
                .status())
        .isEqualTo(Status.CREATE);
  }

  @Test
  void scopesEveryPreviewOperationByActorAndPermissionFamilyAndRevalidatesBeforeWriting() {
    var repository = mock(SpreadsheetImportRepository.class);
    var writes = mock(MasterDataApplicationService.class);
    var transaction = mock(TransactionTemplate.class);
    when(transaction.execute(any()))
        .thenAnswer(
            inv ->
                ((TransactionCallback<?>) inv.getArgument(0))
                    .doInTransaction(mock(TransactionStatus.class)));
    when(repository.managerAssignmentSnapshot(any(), any(), anyBoolean()))
        .thenReturn(snapshot(List.of()));
    var service =
        new SpreadsheetImportService(reader, repository, writes, transaction, Clock.systemUTC());
    var preview =
        service.preview(
            Kind.MANAGER_ASSIGNMENTS, null, file("Gestora", "Pessoa", "16/09/2026"), actor);
    var context = new MasterDataCommandContext(actor, "fixture-import");
    assertThatThrownBy(() -> service.get(preview.id(), actor))
        .isInstanceOf(SpreadsheetImportException.class);
    assertThatThrownBy(() -> service.confirm(preview.id(), context))
        .isInstanceOf(SpreadsheetImportException.class);
    assertThatThrownBy(() -> service.get(preview.id(), UUID.randomUUID(), Kind.MANAGER_ASSIGNMENTS))
        .isInstanceOf(SpreadsheetImportException.class);
    service.discard(preview.id(), actor);
    assertThat(service.get(preview.id(), actor, Kind.MANAGER_ASSIGNMENTS)).isEqualTo(preview);
    verifyNoInteractions(writes);
    assertThat(service.confirm(preview.id(), context, Kind.MANAGER_ASSIGNMENTS).created())
        .isEqualTo(1);
    service.confirm(preview.id(), context, Kind.MANAGER_ASSIGNMENTS);
    verify(writes, times(1))
        .createManagerAssignment(manager, person, LocalDate.of(2026, 9, 16), context);
    service.discard(preview.id(), actor, Kind.MANAGER_ASSIGNMENTS);
    assertThatThrownBy(() -> service.get(preview.id(), actor, Kind.MANAGER_ASSIGNMENTS))
        .isInstanceOf(SpreadsheetImportException.class);
    var stale =
        service.preview(
            Kind.MANAGER_ASSIGNMENTS, null, file("Gestora", "Pessoa", "16/09/2026"), actor);
    when(repository.managerAssignmentSnapshot(any(), any(), eq(true)))
        .thenReturn(new ManagerAssignmentImport.Snapshot(Map.of(), Map.of(), Map.of()));
    assertThatThrownBy(() -> service.confirm(stale.id(), context, Kind.MANAGER_ASSIGNMENTS))
        .isInstanceOf(SpreadsheetImportException.class);
    verifyNoMoreInteractions(writes);
    when(repository.snapshot(any(), isNull(), anyBoolean()))
        .thenReturn(new Snapshot(Map.of(), null, Map.of()));
    var ordinary =
        service.preview(Kind.COLLABORATORS, null, XlsxFixture.collaborators("Pessoa"), actor);
    assertThatThrownBy(() -> service.get(ordinary.id(), actor, Kind.MANAGER_ASSIGNMENTS))
        .isInstanceOf(SpreadsheetImportException.class);
    assertThatThrownBy(() -> service.confirm(ordinary.id(), context, Kind.MANAGER_ASSIGNMENTS))
        .isInstanceOf(SpreadsheetImportException.class);
  }
}

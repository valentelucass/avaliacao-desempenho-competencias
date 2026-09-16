package br.com.avaliacao.desempenho.cadastros.importacao;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.cadastros.application.*;
import br.com.avaliacao.desempenho.cadastros.domain.model.AllocationImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;
import br.com.avaliacao.desempenho.cadastros.infrastructure.files.RestrictedXlsxReader;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class AllocationImportTests {
  static final String[] HEADERS = {"Filial", "Colaborador", "Área", "Gestor", "Início da Lotação"};
  final RestrictedXlsxReader reader = new RestrictedXlsxReader();
  final UUID person = UUID.randomUUID(), branch = UUID.randomUUID(), area = UUID.randomUUID();
  final LocalDate start = LocalDate.of(2026, 9, 15);

  static byte[] allocationFile(String name, String date) {
    return XlsxFixture.zip(
        XlsxFixture.parts(
            new String[][] {
              HEADERS, {"Filial Exemplo", name, "Área Exemplo", "Gestor Exemplo", date}
            }));
  }

  private SourceRow source(String date) {
    return new SourceRow(
        2,
        "Pessoa Exemplo",
        "",
        "",
        new AllocationImport.Fields("Filial Exemplo", "Área Exemplo", "Gestor Exemplo", date));
  }

  private AllocationImport.Snapshot snapshot(List<AllocationImport.Existing> history) {
    return new AllocationImport.Snapshot(
        Map.of("PESSOA EXEMPLO", List.of(new Collaborator(person, true))),
        Map.of("FILIAL EXEMPLO", List.of(new AllocationImport.NamedResource(branch, true))),
        Map.of("AREA EXEMPLO", List.of(new AllocationImport.NamedResource(area, true))),
        Map.of(person, history));
  }

  @Test
  void readsOnlyApprovedColumnsRegardlessOfOrderAndDropsOtherData() {
    var parts =
        XlsxFixture.parts(
            new String[][] {
              {
                "Não importar",
                " Gestor\u00a0",
                "Início da Lotação",
                "Colaborador",
                "Área",
                "Filial",
                "Outra coluna"
              },
              {
                "Conteúdo descartado",
                "Gestor Exemplo\u00a0",
                "15/09/2026",
                "Pessoa Exemplo\u00a0",
                "Área Exemplo",
                "Filial Exemplo",
                "Outro descarte"
              },
              {"Linha sem dados úteis", "", "", "", "", "", "Ignorar"}
            });
    var rows = reader.read(XlsxFixture.zip(parts), Kind.ALLOCATIONS);
    assertThat(rows).containsExactly(source("15/09/2026"));
    assertThat(rows.toString()).doesNotContain("descartado", "descarte", "Ignorar", "\u00a0");
    assertThat(SpreadsheetImport.key("\u00a0Pessoa Exemplo\u202f")).isEqualTo("PESSOA EXEMPLO");
  }

  @Test
  void acceptsExcel1900And1904DatesWithoutTimezoneOrRounding() {
    for (boolean date1904 : List.of(false, true)) {
      var parts =
          XlsxFixture.parts(
              new String[][] {
                HEADERS,
                {"Filial Exemplo", "Pessoa Exemplo", "Área Exemplo", "Gestor Exemplo", "DATE"}
              });
      parts.compute(
          "xl/worksheets/sheet1.xml",
          (k, v) ->
              v.replace(
                  "<c r=\"E2\" t=\"inlineStr\"><is><t>DATE</t></is></c>",
                  "<c r=\"E2\" t=\"n\"><v>" + (date1904 ? "44818" : "46280") + "</v></c>"));
      if (date1904)
        parts.compute(
            "xl/workbook.xml",
            (k, v) -> v.replace("<sheets>", "<workbookPr date1904=\"1\"/><sheets>"));
      assertThat(
              reader
                  .read(XlsxFixture.zip(parts), Kind.ALLOCATIONS)
                  .getFirst()
                  .allocation()
                  .startsOn())
          .isEqualTo("15/09/2026");
    }
    for (String value : List.of("60", "46280.5", "-1", "2958466")) {
      var parts =
          XlsxFixture.parts(new String[][] {HEADERS, {"", "Pessoa Exemplo", "", "", "DATE"}});
      parts.compute(
          "xl/worksheets/sheet1.xml",
          (k, v) ->
              v.replace(
                  "<c r=\"E2\" t=\"inlineStr\"><is><t>DATE</t></is></c>",
                  "<c r=\"E2\" t=\"n\"><v>" + value + "</v></c>"));
      var rows = reader.read(XlsxFixture.zip(parts), Kind.ALLOCATIONS);
      assertThat(AllocationImport.review(rows, snapshot(List.of())).getFirst().status())
          .isEqualTo(Status.ERROR);
    }
  }

  @Test
  void rejectsMissingRepeatedHeadersAndDangerousContentEvenInIgnoredColumns() {
    for (String[] headers :
        List.of(
            new String[] {"Filial", "Colaborador", "Área", "Gestor"},
            new String[] {
              "Filial", "Colaborador", "Área", "Gestor", "Início da Lotação", "COLABORADOR"
            })) {
      var parts = XlsxFixture.parts(new String[][] {headers, {"", "Pessoa Exemplo"}});
      assertThatThrownBy(() -> reader.read(XlsxFixture.zip(parts), Kind.ALLOCATIONS))
          .isInstanceOf(SpreadsheetImportException.class);
    }
    var parts =
        XlsxFixture.parts(
            new String[][] {
              {"Filial", "Colaborador", "Área", "Gestor", "Início da Lotação", "Descartar"},
              {"", "Pessoa Exemplo", "", "", "15/09/2026", "DADO"}
            });
    parts.compute(
        "xl/worksheets/sheet1.xml",
        (k, v) ->
            v.replace(
                "<c r=\"F2\" t=\"inlineStr\"><is><t>DADO</t></is></c>",
                "<c r=\"F2\"><f>1+1</f><v>2</v></c>"));
    assertThatThrownBy(() -> reader.read(XlsxFixture.zip(parts), Kind.ALLOCATIONS))
        .isInstanceOf(SpreadsheetImportException.class);
  }

  @Test
  void requiresValidDateAndUniqueActiveNamesWhileKeepingManualOptionalFields() {
    for (String date :
        List.of(
            "",
            "31/02/2026",
            "29/02/2025",
            "15/09/26",
            "15/09/2026 14:00",
            "46280",
            "00/09/2026",
            "15/09/0000"))
      assertThat(
              AllocationImport.review(List.of(source(date)), snapshot(List.of()))
                  .getFirst()
                  .status())
          .isEqualTo(Status.ERROR);
    assertThat(
            AllocationImport.review(List.of(source("29/02/2024")), snapshot(List.of()))
                .getFirst()
                .status())
        .isEqualTo(Status.CREATE);
    assertThat(
            AllocationImport.review(
                List.of(source("15/09/2026"), source("16/09/2026")), snapshot(List.of())))
        .extracting(Row::status)
        .containsExactly(Status.CREATE, Status.ERROR);
    for (var persons :
        List.of(
            List.<Collaborator>of(),
            List.of(new Collaborator(person, false)),
            List.of(new Collaborator(person, true), new Collaborator(UUID.randomUUID(), true)))) {
      var data = snapshot(List.of());
      assertThat(
              AllocationImport.review(
                      List.of(source("15/09/2026")),
                      new AllocationImport.Snapshot(
                          Map.of("PESSOA EXEMPLO", persons),
                          data.branches(),
                          data.areas(),
                          Map.of()))
                  .getFirst()
                  .status())
          .isEqualTo(Status.ERROR);
    }
    var optional =
        new SourceRow(
            2, "Pessoa Exemplo", "", "", new AllocationImport.Fields("", "", "", "15/09/2026"));
    var resolved = AllocationImport.review(List.of(optional), snapshot(List.of())).getFirst();
    assertThat(resolved.status()).isEqualTo(Status.CREATE);
    assertThat(resolved.allocation().branchId()).isNull();
    assertThat(resolved.allocation().areaId()).isNull();
  }

  @Test
  void blocksMissingInactiveAndAmbiguousBranchesOrAreas() {
    var data = snapshot(List.of());
    for (var matches :
        List.of(
            List.<AllocationImport.NamedResource>of(),
            List.of(new AllocationImport.NamedResource(branch, false)),
            List.of(
                new AllocationImport.NamedResource(branch, true),
                new AllocationImport.NamedResource(UUID.randomUUID(), true)))) {
      var branchData =
          new AllocationImport.Snapshot(
              data.collaborators(), Map.of("FILIAL EXEMPLO", matches), data.areas(), Map.of());
      var areaData =
          new AllocationImport.Snapshot(
              data.collaborators(), data.branches(), Map.of("AREA EXEMPLO", matches), Map.of());
      assertThat(
              AllocationImport.review(List.of(source("15/09/2026")), branchData)
                  .getFirst()
                  .status())
          .isEqualTo(Status.ERROR);
      assertThat(
              AllocationImport.review(List.of(source("15/09/2026")), areaData).getFirst().status())
          .isEqualTo(Status.ERROR);
    }
  }

  @Test
  void recognizesIdenticalAllocationsAndBlocksOverlapsIncludingInclusiveEndAndFutureRecords() {
    var identical =
        new AllocationImport.Existing(branch, area, "GESTOR EXEMPLO\u00a0", start, null, false);
    assertThat(
            AllocationImport.review(List.of(source("15/09/2026")), snapshot(List.of(identical)))
                .getFirst()
                .status())
        .isEqualTo(Status.EXISTS);
    var earlier =
        new AllocationImport.Existing(
            branch, area, "Outro gestor", start.minusYears(1), start.minusDays(1), true);
    assertThat(
            AllocationImport.review(List.of(source("15/09/2026")), snapshot(List.of(earlier)))
                .getFirst()
                .status())
        .isEqualTo(Status.CREATE);
    for (var overlap :
        List.of(
            new AllocationImport.Existing(branch, area, "Outro gestor", start, null, false),
            new AllocationImport.Existing(
                branch, area, "Gestor Exemplo", start.minusYears(1), start, true),
            new AllocationImport.Existing(
                branch, area, "Gestor Exemplo", start.plusYears(1), null, false),
            new AllocationImport.Existing(null, null, null, null, null, false)))
      assertThat(
              AllocationImport.review(List.of(source("15/09/2026")), snapshot(List.of(overlap)))
                  .getFirst()
                  .status())
          .isEqualTo(Status.ERROR);
    assertThat(
            AllocationImport.review(
                    List.of(source("15/09/2026")), snapshot(List.of(identical, identical)))
                .getFirst()
                .status())
        .isEqualTo(Status.ERROR);
  }

  @Test
  void confirmsOnlyResolvedAllocationAndRevalidatesResources() {
    var repository = mock(SpreadsheetImportRepository.class);
    var writes = mock(MasterDataApplicationService.class);
    var tx = mock(TransactionTemplate.class);
    when(tx.execute(any()))
        .thenAnswer(
            call ->
                ((TransactionCallback<?>) call.getArgument(0))
                    .doInTransaction(mock(TransactionStatus.class)));
    when(repository.allocationSnapshot(any(), any(), any(), anyBoolean()))
        .thenReturn(snapshot(List.of()));
    var service = new SpreadsheetImportService(reader, repository, writes, tx, Clock.systemUTC());
    UUID actor = UUID.randomUUID();
    var context = new MasterDataCommandContext(actor, "allocation-test");
    var preview =
        service.preview(
            Kind.ALLOCATIONS, null, allocationFile("Pessoa Exemplo", "15/09/2026"), actor);
    verifyNoInteractions(writes);
    assertThat(service.confirm(preview.id(), context).created()).isEqualTo(1);
    assertThat(service.confirm(preview.id(), context).created()).isEqualTo(1);
    verify(writes).createAllocation(person, branch, area, "Gestor Exemplo", start, context);
    var stale =
        service.preview(
            Kind.ALLOCATIONS, null, allocationFile("Pessoa Exemplo", "15/09/2026"), actor);
    var previous = snapshot(List.of());
    when(repository.allocationSnapshot(any(), any(), any(), eq(true)))
        .thenReturn(
            new AllocationImport.Snapshot(
                previous.collaborators(), Map.of(), previous.areas(), Map.of()));
    assertThatThrownBy(() -> service.confirm(stale.id(), context))
        .isInstanceOf(SpreadsheetImportException.class);
    verifyNoMoreInteractions(writes);
  }
}

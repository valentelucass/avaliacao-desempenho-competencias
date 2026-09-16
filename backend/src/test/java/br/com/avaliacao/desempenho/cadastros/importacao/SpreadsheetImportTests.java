package br.com.avaliacao.desempenho.cadastros.importacao;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.cadastros.application.*;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;
import br.com.avaliacao.desempenho.cadastros.infrastructure.files.RestrictedXlsxReader;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class SpreadsheetImportTests {
  final RestrictedXlsxReader reader = new RestrictedXlsxReader();
  final UUID person = UUID.randomUUID(),
      questionnaire = UUID.randomUUID(),
      cycle = UUID.randomUUID();
  final Cycle draft =
      new Cycle(
          cycle,
          "2026",
          "Ciclo fictício",
          List.of(new Questionnaire(questionnaire, "Questionário fictício")));

  @Test
  void ignoresRowsContainingOnlyTheDiscardedBranchAndPreservesSourceLineNumbers() {
    var parts =
        XlsxFixture.parts(
            new String[][] {
              {"Ciclo em Rascunho", "Filial", "Colaborador", "Questionário Aplicado no Ciclo"},
              {"", "Referência sem atribuição", "", ""},
              {"Ciclo fictício", "Filial ignorada", "Pessoa Exemplo", "Questionário fictício"}
            });
    assertThat(reader.read(XlsxFixture.zip(parts), Kind.ASSIGNMENTS))
        .containsExactly(
            new SourceRow(3, "Pessoa Exemplo", "Ciclo fictício", "Questionário fictício"));
  }

  @Test
  void readsBothModelsAndDiscardsBranchCompletely() {
    assertThat(reader.read(XlsxFixture.collaborators("Pessoa Exemplo"), Kind.COLLABORATORS))
        .containsExactly(new SourceRow(2, "Pessoa Exemplo", "", ""));
    var parts =
        XlsxFixture.parts(
            new String[][] {
              {"Ciclo em Rascunho", "Filial", "Colaborador", "Questionário Aplicado no Ciclo"},
              {"Ciclo fictício", "Filial ignorada", "Pessoa Exemplo", "Questionário fictício"}
            });
    var rows = reader.read(XlsxFixture.zip(parts), Kind.ASSIGNMENTS);
    assertThat(rows)
        .containsExactly(
            new SourceRow(2, "Pessoa Exemplo", "Ciclo fictício", "Questionário fictício"));
    assertThat(rows.toString()).doesNotContain("Filial ignorada");
  }

  @Test
  void acceptsTheLiteralExcelAutoFilterRangeButRejectsOtherDefinedNames() {
    var parts = XlsxFixture.parts(new String[][] {{"Colaboradores"}, {"Pessoa Exemplo"}});
    parts.compute(
        "xl/workbook.xml",
        (k, v) ->
            v.replace(
                "</workbook>",
                "<definedNames><definedName name=\"_xlnm._FilterDatabase\" localSheetId=\"0\" hidden=\"1\">Planilha!$A$1:$A$2</definedName></definedNames></workbook>"));
    assertThat(reader.read(XlsxFixture.zip(parts), Kind.COLLABORATORS)).hasSize(1);
    parts.compute("xl/workbook.xml", (k, v) -> v.replace("Planilha!$A$1:$A$2", "EXEC(1)"));
    assertThatThrownBy(() -> reader.read(XlsxFixture.zip(parts), Kind.COLLABORATORS))
        .isInstanceOf(SpreadsheetImportException.class);
    parts.compute(
        "xl/workbook.xml",
        (k, v) ->
            v.replace("EXEC(1)", "Planilha!$A$1:$A$2")
                .replace("_xlnm._FilterDatabase", "OtherName"));
    assertThatThrownBy(() -> reader.read(XlsxFixture.zip(parts), Kind.COLLABORATORS))
        .isInstanceOf(SpreadsheetImportException.class);
  }

  @Test
  void readsSharedStringsAndRejectsWrongHeadersAndFormulas() {
    var parts = XlsxFixture.parts(new String[][] {{"Colaboradores"}, {"Pessoa Exemplo"}});
    parts.put(
        "xl/sharedStrings.xml",
        "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><si><t>Pessoa Exemplo</t></si></sst>");
    parts.compute(
        "xl/worksheets/sheet1.xml",
        (k, v) ->
            v.replace(
                "<c r=\"A2\" t=\"inlineStr\"><is><t>Pessoa Exemplo</t></is></c>",
                "<c r=\"A2\" t=\"s\"><v>0</v></c>"));
    assertThat(reader.read(XlsxFixture.zip(parts), Kind.COLLABORATORS).getFirst().name())
        .isEqualTo("Pessoa Exemplo");
    parts.compute(
        "xl/worksheets/sheet1.xml", (k, v) -> v.replace("<v>0</v>", "<f>1+1</f><v>0</v>"));
    assertThatThrownBy(() -> reader.read(XlsxFixture.zip(parts), Kind.COLLABORATORS))
        .isInstanceOf(SpreadsheetImportException.class);
    assertThatThrownBy(
            () ->
                reader.read(
                    XlsxFixture.zip(XlsxFixture.parts(new String[][] {{"Nome"}, {"Pessoa"}})),
                    Kind.COLLABORATORS))
        .isInstanceOf(SpreadsheetImportException.class);
  }

  @Test
  void rejectsEntitiesMacrosExternalLinksAndZipExpansion() {
    for (String attack : List.of("entity", "macro", "external", "expansion", "sheet")) {
      var parts = XlsxFixture.parts(new String[][] {{"Colaboradores"}, {"Pessoa Exemplo"}});
      switch (attack) {
        case "entity" ->
            parts.put(
                "docProps/core.xml",
                "<!DOCTYPE root [<!ENTITY x SYSTEM 'file:///does-not-exist'>]><root>&x;</root>");
        case "macro" -> parts.put("xl/vbaProject.bin", "content");
        case "external" ->
            parts.compute(
                "xl/_rels/workbook.xml.rels",
                (k, v) -> v.replace("Target=", "TargetMode=\"External\" Target="));
        case "expansion" ->
            parts.put(
                "docProps/core.xml",
                "<root>" + "x".repeat(8 * SpreadsheetReader.MAX_BYTES) + "</root>");
        case "sheet" -> parts.put("xl/worksheets/sheet2.xml", "<worksheet/>");
        default -> throw new AssertionError();
      }
      assertThatThrownBy(() -> reader.read(XlsxFixture.zip(parts), Kind.COLLABORATORS))
          .isInstanceOf(SpreadsheetImportException.class);
    }
    assertThatThrownBy(
            () -> reader.read(new byte[SpreadsheetReader.MAX_BYTES + 1], Kind.COLLABORATORS))
        .isInstanceOf(SpreadsheetImportException.class);
    String[] names = new String[1001];
    java.util.Arrays.fill(names, "Pessoa Exemplo");
    assertThatThrownBy(() -> reader.read(XlsxFixture.collaborators(names), Kind.COLLABORATORS))
        .isInstanceOf(SpreadsheetImportException.class);
  }

  @Test
  void doesNotGuessHomonymsOrReactivatePeopleAndDetectsRepeatedNames() {
    var source =
        List.of(new SourceRow(2, "Pessoa Á", "", ""), new SourceRow(3, "pessoa a", "", ""));
    var rows =
        SpreadsheetImport.review(
            Kind.COLLABORATORS, source, new Snapshot(Map.of(), null, Map.of()));
    assertThat(rows).extracting(Row::status).containsExactly(Status.CREATE, Status.ERROR);
    for (var matches :
        List.of(
            List.of(new Collaborator(person, false)),
            List.of(new Collaborator(person, true), new Collaborator(UUID.randomUUID(), true)))) {
      assertThat(
              SpreadsheetImport.review(
                  Kind.COLLABORATORS,
                  source,
                  new Snapshot(Map.of("PESSOA A", matches), null, Map.of())))
          .allMatch(row -> row.status() == Status.ERROR);
    }
  }

  @Test
  void distinguishesMissingFromAmbiguousQuestionnairesAndAcceptsBothAppliedTitles() {
    var otherPerson = UUID.randomUUID();
    var otherQuestionnaire = new Questionnaire(UUID.randomUUID(), "Outro questionário fictício");
    var people =
        Map.of(
            "PESSOA A",
            List.of(new Collaborator(person, true)),
            "PESSOA B",
            List.of(new Collaborator(otherPerson, true)));
    var source =
        List.of(
            new SourceRow(2, "Pessoa A", "2026", "Questionário fictício"),
            new SourceRow(3, "Pessoa B", "2026", otherQuestionnaire.title()));
    var missing =
        SpreadsheetImport.review(Kind.ASSIGNMENTS, source, new Snapshot(people, draft, Map.of()));
    assertThat(missing).extracting(Row::status).containsExactly(Status.CREATE, Status.ERROR);
    assertThat(missing.get(1).message()).contains("não aplicado", "Administração de ciclos");
    var both =
        new Cycle(
            cycle,
            draft.code(),
            draft.name(),
            List.of(draft.questionnaires().getFirst(), otherQuestionnaire));
    var valid =
        SpreadsheetImport.review(Kind.ASSIGNMENTS, source, new Snapshot(people, both, Map.of()));
    assertThat(valid)
        .extracting(Row::questionnaireId)
        .containsExactly(questionnaire, otherQuestionnaire.id());
    assertThat(valid).allMatch(row -> row.status() == Status.CREATE);
    var ambiguous =
        new Cycle(
            cycle,
            draft.code(),
            draft.name(),
            List.of(draft.questionnaires().getFirst(), draft.questionnaires().getFirst()));
    assertThat(
            SpreadsheetImport.review(
                    Kind.ASSIGNMENTS, source, new Snapshot(people, ambiguous, Map.of()))
                .getFirst()
                .message())
        .contains("mais de um questionário");
  }

  @Test
  void assignmentsRequireMatchingDraftCycleUniqueAppliedTitleAndActiveCollaborator() {
    var source =
        List.of(new SourceRow(2, "Pessoa Exemplo", "Ciclo fictício", "Questionário fictício"));
    var people = Map.of("PESSOA EXEMPLO", List.of(new Collaborator(person, true)));
    assertThat(
            SpreadsheetImport.review(
                    Kind.ASSIGNMENTS, source, new Snapshot(people, draft, Map.of()))
                .getFirst()
                .status())
        .isEqualTo(Status.CREATE);
    assertThat(
            SpreadsheetImport.review(
                    Kind.ASSIGNMENTS,
                    source,
                    new Snapshot(people, draft, Map.of(person, questionnaire)))
                .getFirst()
                .status())
        .isEqualTo(Status.EXISTS);
    for (Snapshot invalid :
        List.of(
            new Snapshot(people, null, Map.of()),
            new Snapshot(Map.of(), draft, Map.of()),
            new Snapshot(people, draft, Map.of(person, UUID.randomUUID())),
            new Snapshot(
                people, new Cycle(cycle, "2027", "Outro ciclo", draft.questionnaires()), Map.of()),
            new Snapshot(people, new Cycle(cycle, "2026", "Ciclo fictício", List.of()), Map.of()),
            new Snapshot(
                people,
                new Cycle(
                    cycle,
                    "2026",
                    "Ciclo fictício",
                    List.of(draft.questionnaires().getFirst(), draft.questionnaires().getFirst())),
                Map.of())))
      assertThat(SpreadsheetImport.review(Kind.ASSIGNMENTS, source, invalid).getFirst().status())
          .isEqualTo(Status.ERROR);
  }

  @Test
  void requiresOwnerRevalidatesAndReplaysTheSameConfirmationWithoutNewWrites() {
    var repository = mock(SpreadsheetImportRepository.class);
    var writes = mock(MasterDataApplicationService.class);
    var tx = mock(TransactionTemplate.class);
    when(tx.execute(any()))
        .thenAnswer(
            call ->
                ((TransactionCallback<?>) call.getArgument(0))
                    .doInTransaction(mock(TransactionStatus.class)));
    when(repository.snapshot(any(), isNull(), anyBoolean()))
        .thenReturn(new Snapshot(Map.of(), null, Map.of()));
    Clock clock = mock(Clock.class);
    when(clock.instant()).thenReturn(Instant.parse("2026-09-16T12:00:00Z"));
    var service = new SpreadsheetImportService(reader, repository, writes, tx, clock);
    UUID actor = UUID.randomUUID();
    var context = new MasterDataCommandContext(actor, "import-test");
    var preview =
        service.preview(
            Kind.COLLABORATORS, null, XlsxFixture.collaborators("Pessoa Exemplo"), actor);
    verifyNoInteractions(writes);
    assertThatThrownBy(
            () ->
                service.confirm(
                    preview.id(), new MasterDataCommandContext(UUID.randomUUID(), "other")))
        .isInstanceOf(SpreadsheetImportException.class);
    assertThat(service.confirm(preview.id(), context).created()).isEqualTo(1);
    assertThat(service.confirm(preview.id(), context).created()).isEqualTo(1);
    verify(writes, times(1)).createCollaborator("Pessoa Exemplo", context);
    var next =
        service.preview(
            Kind.COLLABORATORS, null, XlsxFixture.collaborators("Pessoa Exemplo"), actor);
    when(repository.snapshot(any(), isNull(), eq(true)))
        .thenReturn(
            new Snapshot(
                Map.of("PESSOA EXEMPLO", List.of(new Collaborator(person, true))), null, Map.of()));
    assertThatThrownBy(() -> service.confirm(next.id(), context))
        .isInstanceOf(SpreadsheetImportException.class);
    verifyNoMoreInteractions(writes);
    when(clock.instant()).thenReturn(Instant.parse("2026-09-16T12:16:00Z"));
    assertThatThrownBy(() -> service.get(preview.id(), actor))
        .isInstanceOf(SpreadsheetImportException.class);
  }

  @Test
  void limitsAttemptsAndPendingPreviewsAndAllowsDiscard() {
    var repository = mock(SpreadsheetImportRepository.class);
    when(repository.snapshot(any(), isNull(), anyBoolean()))
        .thenReturn(new Snapshot(Map.of(), null, Map.of()));
    var service =
        new SpreadsheetImportService(
            reader,
            repository,
            mock(MasterDataApplicationService.class),
            mock(TransactionTemplate.class),
            Clock.fixed(Instant.now(), ZoneOffset.UTC));
    UUID actor = UUID.randomUUID();
    for (int i = 0; i < 10; i++) service.admit(actor);
    assertThatThrownBy(() -> service.admit(actor)).isInstanceOf(SpreadsheetImportException.class);
    var file = XlsxFixture.collaborators("Pessoa Exemplo");
    var first = service.preview(Kind.COLLABORATORS, null, file, actor);
    for (int i = 0; i < 3; i++) service.preview(Kind.COLLABORATORS, null, file, actor);
    assertThatThrownBy(() -> service.preview(Kind.COLLABORATORS, null, file, actor))
        .isInstanceOf(SpreadsheetImportException.class);
    service.discard(first.id(), UUID.randomUUID());
    assertThat(service.get(first.id(), actor)).isNotNull();
    service.discard(first.id(), actor);
    assertThatThrownBy(() -> service.get(first.id(), actor))
        .isInstanceOf(SpreadsheetImportException.class);
    assertThat(service.preview(Kind.COLLABORATORS, null, file, actor)).isNotNull();
  }
}

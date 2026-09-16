package br.com.avaliacao.desempenho.cadastros.importacao;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.cadastros.api.SpreadsheetImportController;
import br.com.avaliacao.desempenho.cadastros.application.*;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;
import br.com.avaliacao.desempenho.cadastros.infrastructure.files.RestrictedXlsxReader;
import br.com.avaliacao.desempenho.cadastros.infrastructure.persistence.*;
import com.jayway.jsonpath.JsonPath;
import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/** HTTP/SQL reais com dados fictícios, rollback obrigatório e sem qualquer carga do usuário. */
@EnabledIfSystemProperty(named = "adc.dev.import.rollback", matches = "true")
class AllocationImportDevSqlTests {
  @Test
  void importsAllocationsWithExcelDatesAndIgnoredColumnsWithoutPartialWritesOrHistoryChanges() {
    var source = new DriverManagerDataSource();
    source.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    source.setUrl(
        "jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;trustServerCertificate=true;integratedSecurity=true;authenticationScheme=NativeAuthentication");
    var jdbc = new JdbcTemplate(source);
    jdbc.setQueryTimeout(30);
    assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    UUID actor =
        jdbc.queryForObject(
            "SELECT TOP (1) usuario_id FROM dbo.usuario WHERE login_normalizado LIKE 'qa.feedback.rh.%' AND situacao = 'ATIVO' ORDER BY usuario_id",
            (rs, row) -> rs.getObject(1, UUID.class));
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    transaction.setTimeout(90);
    // Savepoints isolam falhas esperadas dentro da transação externa sempre desfeita.
    var nested = new TransactionTemplate(new DataSourceTransactionManager(source));
    nested.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
    var writes =
        new MasterDataApplicationService(new SqlServerMasterDataRepository(jdbc), transaction);
    var reads = new SqlServerSpreadsheetImportRepository(jdbc, new ObjectMapper());
    var service =
        new SpreadsheetImportService(
            new RestrictedXlsxReader(), reads, writes, nested, Clock.systemUTC());
    var mvc = SpreadsheetImportHttpTests.mvc(service, actor);
    String prefix = "QA-ALLOCATION-" + UUID.randomUUID();
    String reference = "allocation-check-" + UUID.randomUUID();
    var context = new MasterDataCommandContext(actor, reference);
    LocalDate date = LocalDate.of(2026, 9, 15);
    try {
      transaction.executeWithoutResult(
          status -> {
            status.setRollbackOnly();
            try {
              UUID branch = writes.createBranch(prefix + " Filial", context);
              String[] names = new String[5];
              for (int i = 0; i < names.length; i++) names[i] = prefix + " Pessoa " + i;
              // Inclui cadastro preexistente com espaço não separável, recebido em algumas
              // planilhas.
              writes.createCollaborator(names[0] + "\u00a0", context);
              var people =
                  service.preview(
                      Kind.COLLABORATORS, null, XlsxFixture.collaborators(names), actor);
              assertThat(service.confirm(people.id(), context).created()).isEqualTo(4);
              service.discard(people.id(), actor);
              String[][] cells = new String[6][];
              cells[0] =
                  new String[] {
                    "Filial", "Colaborador", "Área", "Gestor", "Início da Lotação", "Descartar"
                  };
              for (int i = 1; i <= 5; i++)
                cells[i] =
                    new String[] {
                      prefix + " Filial",
                      names[i - 1] + "\u00a0",
                      prefix + " Área",
                      "Gestor fictício\u00a0",
                      "15/09/2026",
                      "CONTEUDO_IGNORADO"
                    };
              var parts = XlsxFixture.parts(cells);
              parts.compute(
                  "xl/worksheets/sheet1.xml",
                  (k, v) ->
                      v.replace(
                          "<c r=\"E2\" t=\"inlineStr\"><is><t>15/09/2026</t></is></c>",
                          "<c r=\"E2\" t=\"n\"><v>46280</v></c>"));
              byte[] file = XlsxFixture.zip(parts);
              var missingArea = service.preview(Kind.ALLOCATIONS, null, file, actor);
              assertThat(missingArea.rows())
                  .allSatisfy(
                      row -> {
                        assertThat(row.status()).isEqualTo(Status.ERROR);
                        assertThat(row.message()).contains("Área não encontrada");
                      });
              mvc.perform(post("/api/v1/master-data/imports/" + missingArea.id() + "/confirm"))
                  .andExpect(status().isConflict())
                  .andExpect(jsonPath("$.code").value("IMPORT_STALE"));
              assertThat(allocations(jdbc, prefix)).isZero();
              service.discard(missingArea.id(), actor);
              // Mesmo cadastro individual usado em produção; nova conferência libera o lote.
              UUID area = writes.createArea(prefix + " Área", context);
              String body =
                  mvc.perform(
                          post("/api/v1/master-data/imports/allocations/preview")
                              .contentType(SpreadsheetImportController.XLSX)
                              .content(file))
                      .andExpect(status().isOk())
                      .andExpect(jsonPath("$.creates").value(5))
                      .andExpect(jsonPath("$.errors").value(0))
                      .andExpect(jsonPath("$.rows[0].allocation.startsOn").value("15/09/2026"))
                      .andExpect(jsonPath("$.rows[0].allocation.branchId").doesNotExist())
                      .andReturn()
                      .getResponse()
                      .getContentAsString();
              assertThat(body).doesNotContain("CONTEUDO_IGNORADO");
              UUID id = UUID.fromString(JsonPath.read(body, "$.id"));
              assertThat(allocations(jdbc, prefix)).isZero();
              for (int i = 0; i < 2; i++)
                mvc.perform(
                        post("/api/v1/master-data/imports/" + id + "/confirm")
                            .header("X-Request-Id", reference))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.created").value(5));
              assertThat(allocations(jdbc, prefix)).isEqualTo(5);
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.lotacao_colaborador l JOIN dbo.colaborador c ON c.colaborador_id=l.colaborador_id WHERE c.nome_exibicao LIKE ? AND l.filial_id=? AND l.area_id=? AND l.inicio_vigencia=? AND l.gestor_texto_livre=?",
                          Integer.class,
                          prefix + "%",
                          branch,
                          area,
                          date,
                          "Gestor fictício"))
                  .isEqualTo(5);
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=? AND acao='CADASTRO.LOTACAO.CRIAR'",
                          Integer.class,
                          reference))
                  .isEqualTo(5);
              service.discard(id, actor);
              var repeat = service.preview(Kind.ALLOCATIONS, null, file, actor);
              assertThat(repeat.rows()).allMatch(row -> row.status() == Status.EXISTS);
              assertThat(service.confirm(repeat.id(), context).created()).isZero();
              service.discard(repeat.id(), actor);

              cells[1][3] = "Outro gestor fictício";
              var conflict =
                  service.preview(
                      Kind.ALLOCATIONS, null, XlsxFixture.zip(XlsxFixture.parts(cells)), actor);
              assertThat(conflict.rows().getFirst().status()).isEqualTo(Status.ERROR);
              mvc.perform(post("/api/v1/master-data/imports/" + conflict.id() + "/confirm"))
                  .andExpect(status().isConflict())
                  .andExpect(jsonPath("$.code").value("IMPORT_STALE"));
              assertThat(allocations(jdbc, prefix)).isEqualTo(5);
              service.discard(conflict.id(), actor);

              // Histórico encerrado no dia anterior permanece intacto; o limite é inclusivo.
              UUID historicalPerson = writes.createCollaborator(prefix + " Histórico", context);
              UUID oldAllocation =
                  writes.createAllocation(
                      historicalPerson, branch, area, "Gestor antigo", date.minusYears(1), context);
              writes.closeAllocation(oldAllocation, date.minusDays(1), context);
              var historyFile = rows(prefix, "Histórico", "15/09/2026");
              var historical = service.preview(Kind.ALLOCATIONS, null, historyFile, actor);
              assertThat(service.confirm(historical.id(), context).created()).isEqualTo(1);
              assertThat(
                      jdbc.queryForObject(
                              "SELECT fim_vigencia FROM dbo.lotacao_colaborador WHERE lotacao_colaborador_id=?",
                              java.sql.Date.class,
                              oldAllocation)
                          .toLocalDate())
                  .isEqualTo(date.minusDays(1));
              service.discard(historical.id(), actor);

              UUID stalePerson = writes.createCollaborator(prefix + " Alterado", context);
              var stale =
                  service.preview(
                      Kind.ALLOCATIONS, null, rows(prefix, "Alterado", "15/09/2026"), actor);
              writes.createAllocation(stalePerson, branch, area, "Gestor fictício", date, context);
              assertThatThrownBy(() -> service.confirm(stale.id(), context))
                  .isInstanceOf(SpreadsheetImportException.class);
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.lotacao_colaborador WHERE colaborador_id=?",
                          Integer.class,
                          stalePerson))
                  .isEqualTo(1);
              service.discard(stale.id(), actor);

              // Falha após primeira gravação/auditoria: desfazer o lote inteiro por savepoint no
              // teste.
              writes.createCollaborator(prefix + " Falha A", context);
              writes.createCollaborator(prefix + " Falha B", context);
              var failingWrites =
                  new MasterDataApplicationService(
                      new SqlServerMasterDataRepository(jdbc), transaction) {
                    private int calls;

                    @Override
                    public UUID createAllocation(
                        UUID person,
                        UUID branchId,
                        UUID areaId,
                        String manager,
                        LocalDate begins,
                        MasterDataCommandContext ctx) {
                      if (++calls == 2)
                        throw new IllegalStateException("Falha fictícia na segunda lotação");
                      return super.createAllocation(person, branchId, areaId, manager, begins, ctx);
                    }
                  };
              var failing =
                  new SpreadsheetImportService(
                      new RestrictedXlsxReader(), reads, failingWrites, nested, Clock.systemUTC());
              var failedFile =
                  XlsxFixture.zip(
                      XlsxFixture.parts(
                          new String[][] {
                            AllocationImportTests.HEADERS,
                            {
                              prefix + " Filial",
                              prefix + " Falha A",
                              prefix + " Área",
                              "Gestor fictício",
                              "15/09/2026"
                            },
                            {
                              prefix + " Filial",
                              prefix + " Falha B",
                              prefix + " Área",
                              "Gestor fictício",
                              "15/09/2026"
                            }
                          }));
              var failed = failing.preview(Kind.ALLOCATIONS, null, failedFile, actor);
              String failedReference = "failed-" + reference;
              assertThatThrownBy(
                      () ->
                          failing.confirm(
                              failed.id(), new MasterDataCommandContext(actor, failedReference)))
                  .isInstanceOf(IllegalStateException.class);
              assertThat(allocations(jdbc, prefix + " Falha")).isZero();
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=?",
                          Integer.class,
                          failedReference))
                  .isZero();
            } catch (Exception exception) {
              throw new AssertionError("Falha no ensaio fictício de lotações", exception);
            }
          });
    } finally {
      assertThat(allocations(jdbc, prefix)).isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.colaborador WHERE nome_exibicao LIKE ?",
                  Integer.class,
                  prefix + "%"))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.filial WHERE nome LIKE ?", Integer.class, prefix + "%"))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.area WHERE nome LIKE ?", Integer.class, prefix + "%"))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=?",
                  Integer.class,
                  reference))
          .isZero();
    }
  }

  private static byte[] rows(String prefix, String person, String date) {
    return XlsxFixture.zip(
        XlsxFixture.parts(
            new String[][] {
              AllocationImportTests.HEADERS,
              {prefix + " Filial", prefix + " " + person, prefix + " Área", "Gestor fictício", date}
            }));
  }

  private static int allocations(JdbcTemplate jdbc, String prefix) {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM dbo.lotacao_colaborador l JOIN dbo.colaborador c ON c.colaborador_id=l.colaborador_id WHERE c.nome_exibicao LIKE ?",
        Integer.class,
        prefix + "%");
  }
}

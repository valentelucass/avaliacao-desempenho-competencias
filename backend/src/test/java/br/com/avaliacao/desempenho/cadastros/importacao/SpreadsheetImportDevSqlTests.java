package br.com.avaliacao.desempenho.cadastros.importacao;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.administracao.infrastructure.persistence.SqlServerAdministrativeReadRepository;
import br.com.avaliacao.desempenho.cadastros.api.SpreadsheetImportController;
import br.com.avaliacao.desempenho.cadastros.application.*;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;
import br.com.avaliacao.desempenho.cadastros.infrastructure.files.RestrictedXlsxReader;
import br.com.avaliacao.desempenho.cadastros.infrastructure.persistence.*;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.*;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.*;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleConfigurationDraft.AppliedQuestionnaireDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence.SqlServerEvaluationCycleAdministrationRepository;
import com.jayway.jsonpath.JsonPath;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/**
 * Somente dados fictícios, alvo DEV fixo, rollback obrigatório e ausência de resíduos conferida.
 */
@EnabledIfSystemProperty(named = "adc.dev.import.rollback", matches = "true")
class SpreadsheetImportDevSqlTests {
  @Test
  void importsRealHttpXlsxBatchesAuditsRevalidatesAndRollsBack() {
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
    transaction.setTimeout(180);
    var writes =
        new MasterDataApplicationService(new SqlServerMasterDataRepository(jdbc), transaction);
    var reads = new SqlServerSpreadsheetImportRepository(jdbc, new ObjectMapper());
    var importTransaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    importTransaction.setPropagationBehavior(
        org.springframework.transaction.TransactionDefinition.PROPAGATION_NESTED);
    var service =
        new SpreadsheetImportService(
            new RestrictedXlsxReader(), reads, writes, importTransaction, Clock.systemUTC());
    var mvc = SpreadsheetImportHttpTests.mvc(service, actor);
    String prefix = "QA-IMPORT-" + UUID.randomUUID();
    String reference = "import-check-" + UUID.randomUUID();
    var context = new MasterDataCommandContext(actor, reference);
    try {
      transaction.executeWithoutResult(
          status -> {
            status.setRollbackOnly();
            try {
              var version =
                  new SqlServerAdministrativeReadRepository(jdbc)
                      .listApprovedQuestionnaireVersions()
                      .getFirst();
              var config = version.configurationOptions().getFirst();
              var draft =
                  new EvaluationCycleDraft(
                      prefix,
                      new EvaluationCycleConfigurationDraft(
                          "Ciclo fictício " + prefix,
                          LocalDateTime.of(2026, 9, 16, 0, 0),
                          LocalDateTime.of(2026, 10, 17, 0, 0),
                          "America/Sao_Paulo",
                          false,
                          List.of(
                              new AppliedQuestionnaireDraft(
                                  version.questionnaireVersionId(),
                                  config.calculationConfigurationVersionId(),
                                  config.classificationMatrixVersionId()))));
              var createdCycle =
                  new EvaluationCycleAdministrationService(
                          new SqlServerEvaluationCycleAdministrationRepository(jdbc), transaction)
                      .createDraftCycle(draft, new EvaluationCycleCommandContext(actor, reference));
              UUID cycleId = createdCycle.cycleId();
              var cycle = reads.snapshot(java.util.Set.of(), cycleId, false).cycle();
              assertThat(cycle).isNotNull();
              String[] names = new String[379];
              for (int i = 0; i < names.length; i++) names[i] = prefix + " Pessoa fictícia " + i;
              String response =
                  mvc.perform(
                          post("/api/v1/master-data/imports/collaborators/preview")
                              .contentType(SpreadsheetImportController.XLSX)
                              .content(XlsxFixture.collaborators(names)))
                      .andExpect(status().isOk())
                      .andExpect(jsonPath("$.creates").value(379))
                      .andExpect(jsonPath("$.errors").value(0))
                      .andReturn()
                      .getResponse()
                      .getContentAsString();
              String id = JsonPath.read(response, "$.id");
              assertThat(count(jdbc, prefix)).isZero();
              for (int attempt = 0; attempt < 2; attempt++)
                mvc.perform(
                        post("/api/v1/master-data/imports/" + id + "/confirm")
                            .header("X-Request-Id", reference))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.created").value(379));
              assertThat(count(jdbc, prefix)).isEqualTo(379);
              service.discard(UUID.fromString(id), actor);
              var repeated =
                  service.preview(
                      Kind.COLLABORATORS, null, XlsxFixture.collaborators(names), actor);
              assertThat(repeated.rows()).allMatch(row -> row.status() == Status.EXISTS);
              service.discard(repeated.id(), actor);
              String[][] assignments = new String[379][];
              assignments[0] =
                  new String[] {
                    "Ciclo em Rascunho", "Filial", "Colaborador", "Questionário Aplicado no Ciclo"
                  };
              for (int i = 1; i < assignments.length; i++)
                assignments[i] =
                    new String[] {
                      cycle.name(),
                      "Não cadastrar esta filial",
                      names[i - 1],
                      cycle.questionnaires().getFirst().title()
                    };
              for (int i = 1; i <= 334; i++) assignments[i][3] = "Questionário fictício ausente";
              var missingQuestionnaire =
                  service.preview(
                      Kind.ASSIGNMENTS,
                      cycleId,
                      XlsxFixture.zip(XlsxFixture.parts(assignments)),
                      actor);
              assertThat(
                      missingQuestionnaire.rows().stream()
                          .filter(row -> row.status() == Status.ERROR)
                          .count())
                  .isEqualTo(334);
              assertThat(
                      missingQuestionnaire.rows().stream()
                          .filter(row -> row.status() == Status.CREATE)
                          .count())
                  .isEqualTo(44);
              mvc.perform(
                      post("/api/v1/master-data/imports/" + missingQuestionnaire.id() + "/confirm"))
                  .andExpect(status().isConflict())
                  .andExpect(jsonPath("$.code").value("IMPORT_STALE"));
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.atribuicao_questionario_colaborador WHERE ciclo_avaliacao_id = ?",
                          Integer.class,
                          cycleId))
                  .isZero();
              service.discard(missingQuestionnaire.id(), actor);
              for (int i = 1; i <= 334; i++)
                assignments[i][3] = cycle.questionnaires().getFirst().title();
              response =
                  mvc.perform(
                          post("/api/v1/master-data/imports/assignments/preview")
                              .param("cycleId", cycleId.toString())
                              .contentType(SpreadsheetImportController.XLSX)
                              .content(XlsxFixture.zip(XlsxFixture.parts(assignments))))
                      .andExpect(status().isOk())
                      .andExpect(jsonPath("$.creates").value(378))
                      .andExpect(jsonPath("$.errors").value(0))
                      .andReturn()
                      .getResponse()
                      .getContentAsString();
              id = JsonPath.read(response, "$.id");
              mvc.perform(
                      post("/api/v1/master-data/imports/" + id + "/confirm")
                          .header("X-Request-Id", reference))
                  .andExpect(status().isOk())
                  .andExpect(jsonPath("$.created").value(378));
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.atribuicao_questionario_colaborador WHERE ciclo_avaliacao_id = ?",
                          Integer.class,
                          cycleId))
                  .isEqualTo(378);
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id = ? AND acao IN ('CADASTRO.COLABORADOR.CRIAR','ATRIBUICAO.QUESTIONARIO.CRIAR')",
                          Integer.class,
                          reference))
                  .isEqualTo(757);
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.lotacao_colaborador l JOIN dbo.colaborador c ON c.colaborador_id = l.colaborador_id WHERE c.nome_exibicao LIKE ?",
                          Integer.class,
                          prefix + "%"))
                  .isZero();
              service.discard(UUID.fromString(id), actor);
              var nested = new TransactionTemplate(new DataSourceTransactionManager(source));
              nested.setPropagationBehavior(
                  org.springframework.transaction.TransactionDefinition.PROPAGATION_NESTED);
              var failingWrites =
                  new MasterDataApplicationService(
                      new SqlServerMasterDataRepository(jdbc), transaction) {
                    private int count;

                    @Override
                    public UUID createCollaborator(String name, MasterDataCommandContext ctx) {
                      if (++count == 2)
                        throw new IllegalStateException("Falha fictícia na segunda linha");
                      return super.createCollaborator(name, ctx);
                    }
                  };
              var failingService =
                  new SpreadsheetImportService(
                      new RestrictedXlsxReader(), reads, failingWrites, nested, Clock.systemUTC());
              var failed =
                  failingService.preview(
                      Kind.COLLABORATORS,
                      null,
                      XlsxFixture.collaborators(prefix + " rollback-A", prefix + " rollback-B"),
                      actor);
              String failedReference = "failed-" + reference;
              assertThatThrownBy(
                      () ->
                          failingService.confirm(
                              failed.id(), new MasterDataCommandContext(actor, failedReference)))
                  .isInstanceOf(IllegalStateException.class);
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.colaborador WHERE nome_exibicao LIKE ?",
                          Integer.class,
                          prefix + " rollback-%"))
                  .isZero();
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id = ?",
                          Integer.class,
                          failedReference))
                  .isZero();

              var stale =
                  service.preview(
                      Kind.COLLABORATORS,
                      null,
                      XlsxFixture.collaborators(prefix + " stale", prefix + " should-not-create"),
                      actor);
              writes.createCollaborator(prefix + " stale", context);
              assertThatThrownBy(() -> service.confirm(stale.id(), context))
                  .isInstanceOf(SpreadsheetImportException.class);
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.colaborador WHERE nome_exibicao = ?",
                          Integer.class,
                          prefix + " should-not-create"))
                  .isZero();
            } catch (Exception exception) {
              throw new AssertionError("Falha na importação fictícia HTTP/SQL", exception);
            }
          });
    } finally {
      assertThat(count(jdbc, prefix)).isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.ciclo_avaliacao WHERE codigo = ?",
                  Integer.class,
                  prefix))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id = ?",
                  Integer.class,
                  reference))
          .isZero();
    }
  }

  private int count(JdbcTemplate jdbc, String prefix) {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM dbo.colaborador WHERE nome_exibicao LIKE ?",
        Integer.class,
        prefix + "%");
  }
}

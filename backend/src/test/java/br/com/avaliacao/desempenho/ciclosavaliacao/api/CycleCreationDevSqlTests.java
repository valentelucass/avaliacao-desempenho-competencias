package br.com.avaliacao.desempenho.ciclosavaliacao.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.administracao.api.AdministrativeReadController;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadService;
import br.com.avaliacao.desempenho.administracao.infrastructure.persistence.SqlServerAdministrativeReadRepository;
import br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.EvaluationCycleAdministrationController;
import br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.EvaluationCycleAdministrationExceptionHandler;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationService;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadService;
import br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence.SqlServerEvaluationCycleAdministrationRepository;
import br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence.SqlServerEvaluationCycleReadRepository;
import br.com.avaliacao.desempenho.identidadeacesso.api.ApiProblemDiagnosticsAdvice;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.*;

/**
 * HTTP/serviços/repositórios reais no DEV, sem abrir servidor. Somente o principal é fornecido pelo
 * teste; login/filtros possuem cobertura separada. Toda escrita é revertida, inclusive em falhas.
 */
@EnabledIfSystemProperty(named = "adc.dev.cycles.rollback", matches = "true")
class CycleCreationDevSqlTests {
  @Test
  void createsReadsEditsAndRejectsDuplicateWithoutLeavingData() throws Exception {
    var source = new DriverManagerDataSource();
    source.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    // Alvo fixo DEV: este teste não aceita URL/configuração externa de produção.
    source.setUrl(
        "jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;"
            + "trustServerCertificate=true;integratedSecurity=true;authenticationScheme=NativeAuthentication");
    var jdbc = new JdbcTemplate(source);
    jdbc.setQueryTimeout(15);
    assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    UUID actor =
        jdbc.queryForObject(
            """
            SELECT TOP (1) usuario_id FROM dbo.usuario
            WHERE login_normalizado LIKE 'qa.feedback.rh.%' AND situacao = 'ATIVO'
            ORDER BY usuario_id
            """,
            (rs, row) -> rs.getObject(1, UUID.class));
    var principal =
        new AuthenticatedPrincipal(
            new AuthorizedUser(actor, "Pessoa fictícia", false, Set.of("CICLOS.GERIR")),
            UUID.randomUUID());
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    transaction.setTimeout(45);
    var administrativeReads = new SqlServerAdministrativeReadRepository(jdbc);
    var writes =
        new EvaluationCycleAdministrationService(
            new SqlServerEvaluationCycleAdministrationRepository(jdbc), transaction);
    MockMvc mvc =
        MockMvcBuilders.standaloneSetup(
                new EvaluationCycleAdministrationController(writes),
                new EvaluationCycleController(
                    new EvaluationCycleReadService(
                        new SqlServerEvaluationCycleReadRepository(jdbc))),
                new AdministrativeReadController(
                    new AdministrativeReadService(administrativeReads)))
            .setControllerAdvice(
                new EvaluationCycleAdministrationExceptionHandler(),
                new EvaluationCycleExceptionHandler(),
                new ApiProblemDiagnosticsAdvice())
            .addFilters(new RequestCorrelationFilter())
            .setCustomArgumentResolvers(
                new HandlerMethodArgumentResolver() {
                  public boolean supportsParameter(MethodParameter parameter) {
                    return parameter.getParameterType() == AuthenticatedPrincipal.class;
                  }

                  public Object resolveArgument(
                      MethodParameter parameter,
                      ModelAndViewContainer container,
                      NativeWebRequest request,
                      WebDataBinderFactory factory) {
                    return principal;
                  }
                })
            .build();
    String reference = "cycle-release-" + UUID.randomUUID();
    String code = "QA-ROLLBACK-" + UUID.randomUUID();
    var version = administrativeReads.listApprovedQuestionnaireVersions().getFirst();
    var configuration = version.configurationOptions().getFirst();
    String payload =
        """
        {"code":"%s","configuration":{"name":"Ciclo fictício de verificação",
        "openingAtLocal":"2026-09-01T00:00","closingAtLocal":"2026-09-16T00:00",
        "timeZone":"America/Sao_Paulo","selfAssessmentEnabled":false,
        "questionnaires":[{"questionnaireVersionId":"%s",
        "calculationConfigurationVersionId":"%s","classificationMatrixVersionId":"%s"}]}}
        """
            .formatted(
                code,
                version.questionnaireVersionId(),
                configuration.calculationConfigurationVersionId(),
                configuration.classificationMatrixVersionId());
    try {
      transaction.executeWithoutResult(
          status -> {
            // Marcar antes da primeira escrita garante rollback até se uma asserção falhar.
            status.setRollbackOnly();
            try {
              mvc.perform(get("/api/v1/questionnaire-versions/approved"))
                  .andExpect(status().isOk())
                  .andExpect(
                      jsonPath("$[0].configurationOptions[0].classificationMatrixVersionId")
                          .exists());
              mvc.perform(
                      post("/api/v1/evaluation-cycles")
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(payload.replace("2026-09-01", "2026-09-02")))
                  .andExpect(status().isUnprocessableContent())
                  .andExpect(jsonPath("$.reasonCode").value("CYCLE_WINDOW_INVALID"));
              assertThat(countCycles(jdbc, code)).isZero();
              String response =
                  mvc.perform(
                          post("/api/v1/evaluation-cycles")
                              .header("X-Request-Id", reference)
                              .contentType(MediaType.APPLICATION_JSON)
                              .content(payload))
                      .andExpect(status().isCreated())
                      .andExpect(jsonPath("$.questionnaires.length()").value(1))
                      .andReturn()
                      .getResponse()
                      .getContentAsString();
              UUID cycleId = UUID.fromString(JsonPath.read(response, "$.cycleId"));
              var stored = administrativeReads.findDraftCycleConfiguration(cycleId).orElseThrow();
              assertThat(stored.code()).isEqualTo(code.toUpperCase(Locale.ROOT));
              assertThat(stored.openingAtUtc()).isEqualTo(Instant.parse("2026-09-01T03:00:00Z"));
              assertThat(stored.closingAtUtc()).isEqualTo(Instant.parse("2026-09-16T03:00:00Z"));
              assertThat(stored.questionnaires()).hasSize(1);
              assertThat(stored.questionnaires().getFirst().questionnaireVersionId())
                  .isEqualTo(version.questionnaireVersionId());
              assertThat(
                      jdbc.queryForObject(
                          "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id = ? AND acao = 'CICLO.CRIAR'",
                          Integer.class,
                          reference))
                  .isEqualTo(1);
              // Percorre o cursor SQL real, incluindo o ciclo criado, sem depender de sua posição.
              String cursor = null;
              boolean found = false;
              var seen = new HashSet<String>();
              do {
                String url =
                    "/api/v1/evaluation-cycles?limit=2"
                        + (cursor == null ? "" : "&cursor=" + cursor);
                String page =
                    mvc.perform(get(url))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
                found |=
                    JsonPath.<java.util.List<String>>read(page, "$.items[*].id")
                        .contains(cycleId.toString());
                cursor = JsonPath.read(page, "$.page.nextCursor");
                if (cursor != null) assertThat(seen.add(cursor)).isTrue();
                assertThat(seen.size()).isLessThan(1000);
              } while (cursor != null);
              assertThat(found).isTrue();
              // O PUT recebe somente configuration; montar explicitamente evita campos extras.
              String update =
                  "{"
                      + payload
                          .substring(payload.indexOf("\"configuration\""))
                          .replace("Ciclo fictício de verificação", "Ciclo fictício revisado");
              mvc.perform(
                      put("/api/v1/evaluation-cycles/" + cycleId)
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(update))
                  .andExpect(status().isNoContent());
              var edited = administrativeReads.findDraftCycleConfiguration(cycleId).orElseThrow();
              assertThat(edited.name()).isEqualTo("Ciclo fictício revisado");
              assertThat(edited.questionnaires()).isEqualTo(stored.questionnaires());
              mvc.perform(
                      post("/api/v1/evaluation-cycles")
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(payload))
                  .andExpect(status().isConflict());
            } catch (Exception exception) {
              throw new AssertionError("Falha no fluxo HTTP/SQL fictício", exception);
            }
          });
    } finally {
      assertThat(countCycles(jdbc, code)).isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id = ?",
                  Integer.class,
                  reference))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.transicao_ciclo_avaliacao WHERE request_id = ?",
                  Integer.class,
                  reference))
          .isZero();
    }
  }

  private int countCycles(JdbcTemplate jdbc, String code) {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM dbo.ciclo_avaliacao WHERE codigo = ?", Integer.class, code);
  }
}

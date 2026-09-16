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
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
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
        "openingAtLocal":"2026-09-16T14:00","closingAtLocal":"2026-10-16T23:59",
        "timeZone":"America/Sao_Paulo","selfAssessmentEnabled":true,
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
                          .content(payload.replace("2026-09-16T14:00", "2026-10-17T14:00")))
                  .andExpect(status().isUnprocessableContent())
                  .andExpect(jsonPath("$.reasonCode").value("CYCLE_WINDOW_ORDER_INVALID"));
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
              assertThat(stored.openingAtUtc()).isEqualTo(Instant.parse("2026-09-16T17:00:00Z"));
              assertThat(stored.closingAtUtc()).isEqualTo(Instant.parse("2026-10-17T02:59:00Z"));
              assertThat(stored.selfAssessmentEnabled()).isTrue();
              assertThat(stored.questionnaires()).hasSize(1);
              assertThat(stored.questionnaires().getFirst().questionnaireVersionId())
                  .isEqualTo(version.questionnaireVersionId());
              mvc.perform(
                      post("/api/v1/evaluation-cycles")
                          .header("X-Request-Id", reference)
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(payload.replace(code, code.toLowerCase(Locale.ROOT))))
                  .andExpect(status().isConflict())
                  .andExpect(jsonPath("$.reasonCode").value("CYCLE_CODE_ALREADY_EXISTS"));
              assertThat(countCycles(jdbc, code)).isEqualTo(1);
              assertThat(administrativeReads.findDraftCycleConfiguration(cycleId).orElseThrow())
                  .isEqualTo(stored);
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
                          .header("X-Request-Id", reference)
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(update))
                  .andExpect(status().isNoContent());
              var edited = administrativeReads.findDraftCycleConfiguration(cycleId).orElseThrow();
              assertThat(edited.name()).isEqualTo("Ciclo fictício revisado");
              assertThat(edited.openingAtUtc()).isEqualTo(stored.openingAtUtc());
              assertThat(edited.closingAtUtc()).isEqualTo(stored.closingAtUtc());
              assertThat(edited.selfAssessmentEnabled()).isTrue();
              assertThat(edited.questionnaires()).isEqualTo(stored.questionnaires());
              // Abre o próprio ciclo fictício numa janela corrente para verificar a imutabilidade.
              var now = LocalDateTime.now(ZoneId.of("America/Sao_Paulo")).withNano(0);
              for (var rejected :
                  List.of(
                      new RejectedWindow(
                          now.plusDays(1), now.plusDays(2), "CYCLE_OPENING_NOT_REACHED"),
                      new RejectedWindow(
                          now.minusDays(2), now.minusDays(1), "CYCLE_WINDOW_ENDED"))) {
                String rejectedWindow =
                    update
                        .replace("2026-09-16T14:00", rejected.opening().toString())
                        .replace("2026-10-16T23:59", rejected.closing().toString());
                mvc.perform(
                        put("/api/v1/evaluation-cycles/" + cycleId)
                            .header("X-Request-Id", reference)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(rejectedWindow))
                    .andExpect(status().isNoContent());
                mvc.perform(
                        post("/api/v1/evaluation-cycles/" + cycleId + "/open")
                            .header("X-Request-Id", reference))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("CONFLICT"))
                    .andExpect(jsonPath("$.reasonCode").value(rejected.reason()))
                    .andExpect(jsonPath("$.requestId").value(reference));
                assertThat(administrativeReads.findDraftCycleConfiguration(cycleId)).isPresent();
                assertThat(
                        jdbc.queryForObject(
                            "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id = ? AND acao = 'CICLO.ABRIR'",
                            Integer.class,
                            reference))
                    .isZero();
              }
              String currentWindow =
                  update
                      .replace("2026-09-16T14:00", now.minusDays(1).toString())
                      .replace("2026-10-16T23:59", now.plusDays(1).toString());
              mvc.perform(
                      put("/api/v1/evaluation-cycles/" + cycleId)
                          .header("X-Request-Id", reference)
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(currentWindow))
                  .andExpect(status().isNoContent());
              mvc.perform(
                      post("/api/v1/evaluation-cycles/" + cycleId + "/open")
                          .header("X-Request-Id", reference))
                  .andExpect(status().isNoContent());
              String readWindow =
                  """
                  SELECT situacao, janela_abertura_em_utc, janela_encerramento_em_utc,
                         fuso_horario_iana, autoavaliacao_habilitada
                  FROM dbo.ciclo_avaliacao WHERE ciclo_avaliacao_id = ?
                  """;
              var opened = jdbc.queryForMap(readWindow, cycleId);
              assertThat(opened.get("situacao")).isEqualTo("ABERTO");
              mvc.perform(
                      post("/api/v1/evaluation-cycles/" + cycleId + "/close")
                          .header("X-Request-Id", reference))
                  .andExpect(status().isConflict())
                  .andExpect(jsonPath("$.reasonCode").value("CYCLE_CLOSING_NOT_REACHED"));
              assertThat(jdbc.queryForMap(readWindow, cycleId)).isEqualTo(opened);
              mvc.perform(
                      put("/api/v1/evaluation-cycles/" + cycleId)
                          .header("X-Request-Id", reference)
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(update))
                  .andExpect(status().isConflict());
              assertThat(jdbc.queryForMap(readWindow, cycleId)).isEqualTo(opened);
              mvc.perform(
                      post("/api/v1/evaluation-cycles")
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(payload))
                  .andExpect(status().isConflict())
                  .andExpect(jsonPath("$.reasonCode").value("CYCLE_CODE_ALREADY_EXISTS"))
                  .andExpect(jsonPath("$.requestId").isString());
              assertThat(countCycles(jdbc, code)).isEqualTo(1);
              assertThat(jdbc.queryForMap(readWindow, cycleId)).isEqualTo(opened);
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

  private record RejectedWindow(LocalDateTime opening, LocalDateTime closing, String reason) {}

  private int countCycles(JdbcTemplate jdbc, String code) {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM dbo.ciclo_avaliacao WHERE codigo = ?", Integer.class, code);
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.avaliacoes.api.AssessmentController;
import br.com.avaliacao.desempenho.avaliacoes.api.AssessmentCoverageController;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentApplicationService;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageService;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAuthorizationPolicy;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.SqlIdentityAccessRepository;
import br.com.avaliacao.desempenho.indicadores.api.IndicatorController;
import br.com.avaliacao.desempenho.indicadores.api.IndicatorDashboardController;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorExportResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorFilterOptionsResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorResponseMapper;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorDashboardService;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorFilterOptionsRequestApplicationService;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorRequestApplicationService;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOptions;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;
import jakarta.servlet.http.Cookie;
import java.sql.ResultSet;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = "app.security.supreme-review.login=SUPREMO-REVISAO@EXAMPLE.INVALID")
@Import(SupremeReviewSecurityTests.Fixtures.class)
class SupremeReviewSecurityTests {
  private static final String ASSESSMENTS = "/api/v1/assessments";
  private static final String INDICATORS = "/api/v1/indicators";
  private static final UUID ASSESSMENT = new UUID(0, 20);
  private static final UUID CYCLE = new UUID(0, 21);
  private static final String REVIEW_LOGIN = "supremo-revisao@example.invalid";
  private static final String ADMINISTRATOR = "ADMINISTRADOR_PLATAFORMA";

  @Autowired WebApplicationContext web;
  @Autowired AssessmentRepository assessments;
  @Autowired IdentityAccessRepository identities;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    reset(assessments);
    mvc = MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();
  }

  @Test
  void selectedSupremeAccountCanReadAllAssessmentsAndSafeIndicators() throws Exception {
    var summary =
        new AssessmentRepository.AssessmentSummaryView(
            ASSESSMENT,
            CYCLE,
            "Ciclo de demonstração",
            "Pessoa fictícia",
            AssessmentType.GESTOR,
            "PUBLICADA",
            FeedbackStatus.PENDENTE,
            "revisao-1",
            Instant.EPOCH);
    when(assessments.listAccessible(any(), any(), anyInt(), isNull()))
        .thenReturn(new AssessmentRepository.AssessmentPageView(List.of(summary), null));
    when(assessments.findAccessible(eq(ASSESSMENT), any()))
        .thenReturn(
            Optional.of(
                new AssessmentRepository.AssessmentDetailView(
                    summary,
                    "DEMO",
                    List.of(),
                    List.of(),
                    null,
                    null,
                    null,
                    List.of(),
                    null,
                    new AssessmentRepository.AllowedActionsView(
                        false, false, false, false, false))));

    Cookie selected = cookie(Account.SELECTED);
    mvc.perform(get(ASSESSMENTS).cookie(selected))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(ASSESSMENT.toString()));
    mvc.perform(get(ASSESSMENTS + "/" + ASSESSMENT).cookie(selected))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.allowedActions.edit").value(false));
    mvc.perform(get(INDICATORS + "/options").param("cycleId", CYCLE.toString()).cookie(selected))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.branches").isArray());
    mvc.perform(
            get(INDICATORS)
                .param("cycleId", CYCLE.toString())
                .param("metric", "FINAL_SCORE_AVERAGE")
                .cookie(selected))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.availability").value("INSUFFICIENT_DATA"))
        .andExpect(jsonPath("$.averageScore").doesNotExist());
    mvc.perform(get(INDICATORS + "/dashboard").param("cycleId", CYCLE.toString()).cookie(selected))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metrics.averagePercent").doesNotExist())
        .andExpect(jsonPath("$.byBranch").isArray());
    mvc.perform(
            get(ASSESSMENTS + "/coverage")
                .param("cycleId", CYCLE.toString())
                .param("status", "PENDENTE")
                .cookie(selected))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].displayName").value("Cobertura fictícia"))
        .andExpect(jsonPath("$.items[0].assessmentId").doesNotExist());
    var review =
        new AssessmentAccessContext(
            Account.SELECTED.id,
            Set.of(AssessmentAuthorizationPolicy.VIEW_ALL),
            Set.of(ADMINISTRATOR));
    verify(assessments).listAccessible(eq(review), any(), eq(12), isNull());
    verify(assessments).findAccessible(ASSESSMENT, review);
  }

  @Test
  void deniesOtherSupremeTechnicalAndIneligibleAccountsEvenWithStaleGrants() throws Exception {
    for (Account denied :
        List.of(Account.OTHER_SUPREME, Account.TECHNICAL, Account.MUST_CHANGE, Account.LOST_ROLE)) {
      var persisted =
          identities
              .findAuthorizedUserForActiveSession(
                  denied.id, denied.id, "fixture-jti", Instant.EPOCH)
              .orElseThrow();
      assertThat(persisted.permissions()).doesNotContain(AuthorizedUser.SUPREME_REVIEW);
      Cookie session = cookie(denied);
      for (String route :
          List.of(
              ASSESSMENTS,
              ASSESSMENTS + "/" + ASSESSMENT,
              ASSESSMENTS + "/coverage",
              INDICATORS,
              INDICATORS + "/options",
              INDICATORS + "/dashboard")) {
        mvc.perform(get(route).cookie(session)).andExpect(status().isForbidden());
      }
    }
    mvc.perform(get(ASSESSMENTS).cookie(cookie(Account.INACTIVE)))
        .andExpect(status().isUnauthorized());
    mvc.perform(get(INDICATORS)).andExpect(status().isUnauthorized());
    verifyNoInteractions(assessments);
    assertThat(
            new SqlIdentityAccessRepository(Fixtures.jdbc(), "")
                .findAuthorizedUserForActiveSession(
                    Account.SELECTED.id, Account.SELECTED.id, "fixture-jti", Instant.EPOCH)
                .orElseThrow()
                .permissions())
        .doesNotContain(AuthorizedUser.SUPREME_REVIEW);
  }

  @Test
  void deniesAssessmentChangesPrintingExportsAndCreationOptionsForSelectedSupreme()
      throws Exception {
    Cookie selected = cookie(Account.SELECTED);
    String detail = ASSESSMENTS + "/" + ASSESSMENT;
    mvc.perform(patch(detail).with(csrf()).cookie(selected)).andExpect(status().isForbidden());
    for (String route :
        List.of(
            ASSESSMENTS,
            ASSESSMENTS + "/exports",
            detail + "/submit",
            detail + "/publish",
            detail + "/reopen",
            detail + "/feedback",
            detail + "/print-events",
            INDICATORS + "/exports")) {
      mvc.perform(post(route).with(csrf()).cookie(selected)).andExpect(status().isForbidden());
    }
    mvc.perform(get(ASSESSMENTS + "/creation-cycle-options").cookie(selected))
        .andExpect(status().isForbidden());
    verifyNoInteractions(assessments);
  }

  private static Cookie cookie(Account account) {
    return new Cookie(AccessTokenAuthenticationFilter.ACCESS_COOKIE_NAME, account.name());
  }

  private enum Account {
    SELECTED(1, REVIEW_LOGIN, true, false, ADMINISTRATOR),
    OTHER_SUPREME(2, "contingencia@example.invalid", true, false, ADMINISTRATOR),
    TECHNICAL(3, REVIEW_LOGIN, false, false, ADMINISTRATOR),
    MUST_CHANGE(4, REVIEW_LOGIN, true, true, ADMINISTRATOR),
    LOST_ROLE(5, REVIEW_LOGIN, true, false, "COLABORADOR"),
    INACTIVE(6, REVIEW_LOGIN, true, false, ADMINISTRATOR);

    final UUID id;
    final String login;
    final boolean supreme;
    final boolean mustChange;
    final String role;

    Account(long id, String login, boolean supreme, boolean mustChange, String role) {
      this.id = new UUID(0, id);
      this.login = login;
      this.supreme = supreme;
      this.mustChange = mustChange;
      this.role = role;
    }

    static Account fromId(UUID id) {
      return values()[Math.toIntExact(id.getLeastSignificantBits()) - 1];
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Fixtures {
    static JdbcTemplate jdbc() {
      return mock(
          JdbcTemplate.class,
          invocation -> {
            Object[] arguments = invocation.getRawArguments();
            String sql = (String) arguments[0];
            Object[] params = (Object[]) arguments[2];
            Account account = Account.fromId((UUID) params[0]);
            if (invocation.getMethod().getName().equals("queryForList")) {
              return sql.contains("papel_permissao")
                  ? List.of("CICLOS.GERIR", AuthorizedUser.SUPREME_REVIEW)
                  : List.of(account.role);
            }
            if (arguments[1] instanceof ResultSetExtractor<?> extractor) {
              ResultSet record = mock(ResultSet.class);
              when(record.next()).thenReturn(account != Account.INACTIVE);
              when(record.getObject("usuario_id", UUID.class)).thenReturn(account.id);
              when(record.getString("nome_exibicao")).thenReturn("Conta fictícia");
              when(record.getString("login_normalizado")).thenReturn(account.login);
              when(record.getBoolean("administrador_supremo")).thenReturn(account.supreme);
              when(record.getBoolean("senha_deve_ser_trocada")).thenReturn(account.mustChange);
              return extractor.extractData(record);
            }
            return null;
          });
    }

    @Bean
    IdentityAccessRepository supremeReviewIdentity(
        @Value("${app.security.supreme-review.login:}") String login) {
      return new SqlIdentityAccessRepository(jdbc(), login);
    }

    @Bean
    AccessTokenAuthenticationFilter accessTokenAuthenticationFilter(
        IdentityAccessRepository identities) {
      AccessTokenService tokens = mock(AccessTokenService.class);
      for (Account account : Account.values()) {
        when(tokens.decode(account.name()))
            .thenReturn(
                Optional.of(
                    new AccessTokenService.DecodedAccessToken(
                        account.id, account.id, "fixture-jti")));
      }
      return new AccessTokenAuthenticationFilter(tokens, identities, Clock.systemUTC());
    }

    @Bean
    AssessmentRepository reviewAssessments() {
      return mock(AssessmentRepository.class);
    }

    @Bean
    AssessmentController assessmentController(AssessmentRepository repository) {
      return new AssessmentController(new AssessmentApplicationService(repository));
    }

    @Bean
    AssessmentCoverageController coverageController() {
      var repository = mock(AssessmentCoverageRepository.class);
      when(repository.list(any(), anyInt(), anyInt()))
          .thenReturn(
              new AssessmentCoverageRepository.Page(
                  List.of(
                      new AssessmentCoverageRepository.Entry(
                          ASSESSMENT, "Cobertura fictícia", "Gestora fictícia", null)),
                  false));
      return new AssessmentCoverageController(new AssessmentCoverageService(repository));
    }

    @Bean
    IndicatorDashboardController dashboardController() {
      return new IndicatorDashboardController(
          new IndicatorDashboardService(
              (ignored, periods) -> List.of(), ignored -> {}, ignored -> {}, Clock.systemUTC()));
    }

    @Bean
    IndicatorController indicatorController() {
      var query =
          new IndicatorRequestApplicationService(
              ignored -> new IndicatorResult.InsufficientData(),
              ignored -> {
                throw new AssertionError("Exportação indevida");
              },
              ignored -> {},
              ignored -> {});
      var options =
          new IndicatorFilterOptionsRequestApplicationService(
              ignored -> new IndicatorFilterOptions(List.of(), List.of(), List.of(), List.of()),
              ignored -> {},
              ignored -> {});
      var mapper = new IndicatorResponseMapper();
      return new IndicatorController(
          query,
          options,
          mapper,
          new IndicatorExportResponseMapper(mapper),
          new IndicatorFilterOptionsResponseMapper());
    }
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.administracao.api.AdministrativeReadController;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadRepository;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadRepository.*;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadService;
import br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.EvaluationCycleAdministrationController;
import br.com.avaliacao.desempenho.ciclosavaliacao.api.EvaluationCycleController;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationException;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationRepository;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationService;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadService;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleWindowStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import({
  CycleConfigurationHttpSecurityTests.Config.class,
  ApiSecurityConfigurationTests.JwtAccessFilterTestConfiguration.class
})
class CycleConfigurationHttpSecurityTests {
  @Autowired WebApplicationContext web;
  @Autowired AdministrativeReadRepository repository;
  @Autowired EvaluationCycleReadRepository cycles;
  @Autowired EvaluationCycleAdministrationRepository writes;
  private MockMvc mvc;
  private final UUID cycleId = UUID.randomUUID();
  private final Instant opening = Instant.parse("2026-09-16T17:00:00Z");
  private final Instant closing = Instant.parse("2026-10-17T02:59:00Z");

  @BeforeEach
  void setup() {
    reset(repository, cycles, writes);
    mvc = MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();
  }

  @Test
  void requiresCycleManagementBeforeReadingConfigurationRegardlessOfItsState() throws Exception {
    mvc.perform(get(configurationUrl())).andExpect(status().isUnauthorized());
    for (String permission :
        List.of("AVALIACOES.AVALIAR_VINCULADOS", "INDICADORES.VISUALIZAR", "QUESTIONARIOS.GERIR")) {
      mvc.perform(get(configurationUrl()).with(actor(permission)))
          .andExpect(status().isForbidden());
    }
    verifyNoInteractions(repository);
  }

  @Test
  void returnsPersistedFieldsForEveryAdministrativeStateAndKeepsDraftEndpointRestricted()
      throws Exception {
    UUID appliedId = UUID.randomUUID();
    for (EvaluationCycleStatus state : EvaluationCycleStatus.values()) {
      var view =
          new DraftCycleConfigurationView(
              cycleId,
              "2026.1",
              "Avaliação 2026",
              opening,
              closing,
              "America/Sao_Paulo",
              true,
              List.of(
                  new DraftAppliedQuestionnaireView(
                      appliedId, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())));
      when(repository.findCycleConfiguration(cycleId))
          .thenReturn(
              Optional.of(
                  new CycleConfigurationView(
                      view, state, EvaluationCycleWindowStatus.PRAZO_ENCERRADO)));
      mvc.perform(get(configurationUrl()).with(actor("CICLOS.GERIR")))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.cycleId").value(cycleId.toString()))
          .andExpect(jsonPath("$.code").value("2026.1"))
          .andExpect(jsonPath("$.name").value("Avaliação 2026"))
          .andExpect(jsonPath("$.openingAtLocal").value("2026-09-16T14:00:00"))
          .andExpect(jsonPath("$.closingAtLocal").value("2026-10-16T23:59:00"))
          .andExpect(jsonPath("$.timeZone").value("America/Sao_Paulo"))
          .andExpect(jsonPath("$.selfAssessmentEnabled").value(true))
          .andExpect(
              jsonPath("$.questionnaires[0].cycleQuestionnaireId").value(appliedId.toString()))
          .andExpect(jsonPath("$.status").value(state.name()))
          .andExpect(jsonPath("$.windowStatus").value("PRAZO_ENCERRADO"));
      mvc.perform(get(configurationUrl()).with(actor("CICLOS.GERIR")))
          .andExpect(jsonPath("$.closingAt").value("2026-10-17T02:59:00Z"));
    }
    mvc.perform(
            get("/api/v1/evaluation-cycles/" + cycleId + "/administration-draft")
                .with(actor("CICLOS.GERIR")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
  }

  @Test
  void absentConfigurationIsASafeNotFoundResponse() throws Exception {
    when(repository.findCycleConfiguration(cycleId)).thenReturn(Optional.empty());
    mvc.perform(get(configurationUrl()).with(actor("CICLOS.GERIR")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
        .andExpect(jsonPath("$.detail").value("A configuração solicitada não está disponível."));
  }

  @Test
  void listDistinguishesAnOpenExpiredCycleAndPreservesUtcDates() throws Exception {
    when(cycles.listAccessible(any(), any(), eq(20), isNull()))
        .thenReturn(
            new EvaluationCycleReadRepository.EvaluationCyclePage(
                List.of(
                    new EvaluationCycleReadRepository.EvaluationCycleView(
                        cycleId,
                        "Avaliação 2026",
                        EvaluationCycleStatus.ABERTO,
                        opening,
                        closing,
                        EvaluationCycleWindowStatus.PRAZO_ENCERRADO)),
                null));
    mvc.perform(get("/api/v1/evaluation-cycles").with(actor("CICLOS.GERIR")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].status").value("ABERTO"))
        .andExpect(jsonPath("$.items[0].openingAt").value("2026-09-16T17:00:00Z"))
        .andExpect(jsonPath("$.items[0].closingAt").value("2026-10-17T02:59:00Z"))
        .andExpect(jsonPath("$.items[0].windowStatus").value("PRAZO_ENCERRADO"));
  }

  private String configurationUrl() {
    return "/api/v1/evaluation-cycles/" + cycleId + "/administration-configuration";
  }

  @Test
  void extendingClosingRequiresAuthenticationCycleManagementAndCsrfBeforeAnyWrite()
      throws Exception {
    mvc.perform(
            post(extensionUrl())
                .contentType("application/json")
                .content(extensionBody())
                .with(csrf()))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post(extensionUrl())
                .contentType("application/json")
                .content(extensionBody())
                .with(csrf())
                .with(actor("AVALIACOES.AVALIAR_VINCULADOS")))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(extensionUrl())
                .contentType("application/json")
                .content(extensionBody())
                .with(actor("CICLOS.GERIR")))
        .andExpect(status().isForbidden());
    verifyNoInteractions(writes);
  }

  @Test
  void extendingClosingPassesOnlyTheValidatedCommandAndServerActorAndReturnsNoContent()
      throws Exception {
    mvc.perform(
            post(extensionUrl())
                .header("X-Request-Id", "cycle-extension-qa")
                .contentType("application/json")
                .content(extensionBody())
                .with(csrf())
                .with(actor("CICLOS.GERIR")))
        .andExpect(status().isNoContent());
    verify(writes)
        .extendClosing(
            eq(cycleId),
            argThat(
                extension ->
                    extension
                            .expectedClosingAt()
                            .equals(Instant.parse("2026-10-17T02:59:00.1234567Z"))
                        && extension.closingAtUtc().equals(Instant.parse("2026-10-31T02:59:00Z"))
                        && extension.reason().equals("Motivo fictício para prorrogar")),
            any(UUID.class),
            eq("cycle-extension-qa"));
    verifyNoMoreInteractions(writes);
  }

  @Test
  void invalidExtensionCommandsDoNotReachPersistence() throws Exception {
    for (String body :
        List.of(
            "{}",
            extensionBody().replace("Motivo fictício para prorrogar", "curto"),
            extensionBody().replace("2026-10-30T23:59", "invalid"),
            extensionBody().replace("2026-10-30T23:59", "2026-10-30T23:59Z"),
            extensionBody().replace("2026-10-30T23:59", "2026-10-30T23:59-03:00"),
            extensionBody().replace("\"reason\":", "\"status\":\"ENCERRADO\",\"reason\":"))) {
      mvc.perform(
              post(extensionUrl())
                  .contentType("application/json")
                  .content(body)
                  .with(csrf())
                  .with(actor("CICLOS.GERIR")))
          .andExpect(status().isUnprocessableContent());
    }
    verifyNoInteractions(writes);
  }

  @Test
  void extensionConflictsExposeSafeReasonsWithoutSqlOrAuditText() throws Exception {
    for (var reason :
        List.of(
            EvaluationCycleAdministrationException.Reason.EXTENSION_CONFLICT,
            EvaluationCycleAdministrationException.Reason.EXTENSION_NOT_FUTURE)) {
      doThrow(new EvaluationCycleAdministrationException(reason, "private SQL audit text"))
          .when(writes)
          .extendClosing(any(), any(), any(), any());
      mvc.perform(
              post(extensionUrl())
                  .contentType("application/json")
                  .content(extensionBody())
                  .with(csrf())
                  .with(actor("CICLOS.GERIR")))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.reasonCode").value("CYCLE_" + reason.name()))
          .andExpect(
              content()
                  .string(
                      org.hamcrest.Matchers.not(
                          org.hamcrest.Matchers.containsString("private SQL audit text"))));
    }
  }

  private String extensionUrl() {
    return "/api/v1/evaluation-cycles/" + cycleId + "/extend-closing";
  }

  private String extensionBody() {
    return """
        {"closingAtLocal":"2026-10-30T23:59","expectedClosingAt":"2026-10-17T02:59:00.1234567Z",
        "reason":"Motivo fictício para prorrogar"}
        """;
  }

  @Test
  void missingWindowIsReturnedAsNullDatesInsteadOfAnInventedSchedule() throws Exception {
    when(repository.findCycleConfiguration(cycleId))
        .thenReturn(
            Optional.of(
                new CycleConfigurationView(
                    new DraftCycleConfigurationView(
                        cycleId,
                        "SEM.JANELA",
                        "Ciclo sem janela",
                        null,
                        null,
                        "America/Sao_Paulo",
                        false,
                        List.of()),
                    EvaluationCycleStatus.RASCUNHO,
                    EvaluationCycleWindowStatus.SEM_JANELA)));
    mvc.perform(get(configurationUrl()).with(actor("CICLOS.GERIR")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.openingAtLocal").value(org.hamcrest.Matchers.nullValue()))
        .andExpect(jsonPath("$.closingAtLocal").value(org.hamcrest.Matchers.nullValue()))
        .andExpect(jsonPath("$.selfAssessmentEnabled").value(false))
        .andExpect(jsonPath("$.windowStatus").value("SEM_JANELA"));
  }

  private RequestPostProcessor actor(String permission) {
    var principal =
        new AuthenticatedPrincipal(
            new AuthorizedUser(UUID.randomUUID(), "Pessoa fictícia", false, Set.of(permission)),
            UUID.randomUUID());
    return authentication(
        new UsernamePasswordAuthenticationToken(
            principal, null, List.of(new SimpleGrantedAuthority("PERMISSION:" + permission))));
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Config {
    @Bean
    EvaluationCycleAdministrationRepository extensionRepository() {
      return mock(EvaluationCycleAdministrationRepository.class);
    }

    @Bean
    EvaluationCycleAdministrationService extensionService(
        EvaluationCycleAdministrationRepository repository) {
      return new EvaluationCycleAdministrationService(
          repository, new TransactionTemplate(mock(PlatformTransactionManager.class)));
    }

    @Bean
    EvaluationCycleAdministrationController extensionController(
        EvaluationCycleAdministrationService service) {
      return new EvaluationCycleAdministrationController(service);
    }

    @Bean
    AdministrativeReadRepository cycleAdministrativeRepository() {
      return mock(AdministrativeReadRepository.class);
    }

    @Bean
    AdministrativeReadService cycleAdministrativeService(AdministrativeReadRepository repository) {
      return new AdministrativeReadService(repository);
    }

    @Bean
    AdministrativeReadController cycleAdministrativeController(AdministrativeReadService service) {
      return new AdministrativeReadController(service);
    }

    @Bean
    EvaluationCycleReadRepository cycleReadRepository() {
      return mock(EvaluationCycleReadRepository.class);
    }

    @Bean
    EvaluationCycleReadService cycleReadService(EvaluationCycleReadRepository repository) {
      return new EvaluationCycleReadService(repository);
    }

    @Bean
    EvaluationCycleController cycleReadController(EvaluationCycleReadService service) {
      return new EvaluationCycleController(service);
    }
  }
}

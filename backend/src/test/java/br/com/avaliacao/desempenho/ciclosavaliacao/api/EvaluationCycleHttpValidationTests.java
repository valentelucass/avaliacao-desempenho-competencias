package br.com.avaliacao.desempenho.ciclosavaliacao.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.EvaluationCycleAdministrationController;
import br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.EvaluationCycleAdministrationExceptionHandler;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.*;
import br.com.avaliacao.desempenho.identidadeacesso.api.ApiProblemDiagnosticsAdvice;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.*;

class EvaluationCycleHttpValidationTests {
  private final EvaluationCycleAdministrationService writes =
      mock(EvaluationCycleAdministrationService.class);
  private final EvaluationCycleReadService reads = mock(EvaluationCycleReadService.class);
  private final MockMvc mvc =
      MockMvcBuilders.standaloneSetup(
              new EvaluationCycleAdministrationController(writes),
              new EvaluationCycleController(reads))
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
                  return new AuthenticatedPrincipal(
                      new AuthorizedUser(
                          UUID.randomUUID(), "Pessoa fictícia", false, Set.of("CICLOS.GERIR")),
                      UUID.randomUUID());
                }
              })
          .build();

  @Test
  void acceptsCanonicalCycleAndMapsTheHttpContract() throws Exception {
    when(writes.createDraftCycle(any(), any()))
        .thenReturn(
            new EvaluationCycleAdministrationRepository.CreatedCycle(UUID.randomUUID(), List.of()));
    mvc.perform(
            post("/api/v1/evaluation-cycles")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    body(
                        "CICLO-2026", "2026-09-01T00:00", "2026-09-16T00:00", "America/Sao_Paulo")))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.cycleId").isString());
    verify(writes).createDraftCycle(any(), any());
  }

  @ParameterizedTest
  @CsvSource({
    "CICLO-2026,2026-09-02T00:00,2026-09-16T00:00,America/Sao_Paulo,CYCLE_WINDOW_INVALID",
    "CICLO-2026,2026-09-01T00:00,2026-09-15T23:59,America/Sao_Paulo,CYCLE_WINDOW_INVALID",
    "CICLO-2026,2026-09-01T00:00,2026-09-16T00:00,America/Manaus,CYCLE_TIME_ZONE_INVALID",
    "CODIGO COM ESPACO,2026-09-01T00:00,2026-09-16T00:00,America/Sao_Paulo,CYCLE_CODE_INVALID"
  })
  void rejectsInvalidConfigurationBeforeCallingTheService(
      String code, String opening, String closing, String zone, String reason) throws Exception {
    mvc.perform(
            post("/api/v1/evaluation-cycles")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(code, opening, closing, zone)))
        .andExpect(status().isUnprocessableContent())
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.reasonCode").value(reason))
        .andExpect(jsonPath("$.requestId").isString());
    verifyNoInteractions(writes);
  }

  @Test
  void invalidReadCursorIsAReadValidationError() throws Exception {
    mvc.perform(get("/api/v1/evaluation-cycles?limit=100&cursor=undefined"))
        .andExpect(status().isUnprocessableContent())
        .andExpect(jsonPath("$.detail").value("Revise os campos e a paginação informados."));
    verifyNoInteractions(reads);
  }

  private String body(String code, String opening, String closing, String zone) {
    return """
        {"code":"%s","configuration":{"name":"Ciclo fictício","openingAtLocal":"%s",
        "closingAtLocal":"%s","timeZone":"%s","selfAssessmentEnabled":false,
        "questionnaires":[{"questionnaireVersionId":"00000000-0000-0000-0000-000000000001",
        "calculationConfigurationVersionId":"00000000-0000-0000-0000-000000000002",
        "classificationMatrixVersionId":"00000000-0000-0000-0000-000000000003"}]}}
        """
        .formatted(code, opening, closing, zone);
  }
}

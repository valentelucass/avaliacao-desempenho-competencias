package br.com.avaliacao.desempenho.avaliacoes.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentApplicationService;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.MethodParameter;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

class AssessmentListControllerTests {
  @Test
  void bindsOptionalFiltersAndKeepsTheOldUnfilteredContract() throws Exception {
    var service = mock(AssessmentApplicationService.class);
    when(service.list(any(), any(), anyInt(), any()))
        .thenReturn(new AssessmentRepository.AssessmentPageView(List.of(), null));
    var mvc =
        MockMvcBuilders.standaloneSetup(new AssessmentController(service))
            .setControllerAdvice(new AssessmentExceptionHandler())
            .setCustomArgumentResolvers(principalResolver())
            .build();
    mvc.perform(
            get("/api/v1/assessments")
                .param("evaluatedName", "  Ana  ")
                .param("managerName", "João")
                .param("status", "PUBLICADA")
                .param("feedbackStatus", "CONCLUIDO"))
        .andExpect(status().isOk());
    var filters = ArgumentCaptor.forClass(AssessmentRepository.AssessmentListFilter.class);
    verify(service).list(any(), filters.capture(), eq(12), isNull());
    assertThat(filters.getValue())
        .isEqualTo(
            new AssessmentRepository.AssessmentListFilter(
                null, null, "Ana", "João", AssessmentStatus.PUBLICADA, FeedbackStatus.CONCLUIDO));
    mvc.perform(get("/api/v1/assessments")).andExpect(status().isOk());
    verify(service)
        .list(any(), eq(AssessmentRepository.AssessmentListFilter.none()), eq(12), isNull());
  }

  @Test
  void rejectsInvalidStatusesAndNamesWithoutEchoingInputOrCallingTheService() throws Exception {
    var service = mock(AssessmentApplicationService.class);
    var mvc =
        MockMvcBuilders.standaloneSetup(new AssessmentController(service))
            .setControllerAdvice(new AssessmentExceptionHandler())
            .setCustomArgumentResolvers(principalResolver())
            .build();
    for (String name : List.of("status", "feedbackStatus")) {
      var response =
          mvc.perform(get("/api/v1/assessments").param(name, "VALOR_INVALIDO_FICTICIO"))
              .andExpect(status().is(422))
              .andReturn()
              .getResponse();
      assertThat(response.getContentAsString()).doesNotContain("VALOR_INVALIDO_FICTICIO");
    }
    for (String name : List.of("evaluatedName", "managerName")) {
      mvc.perform(get("/api/v1/assessments").param(name, "a".repeat(161)))
          .andExpect(status().is(422));
    }
    verifyNoInteractions(service);
  }

  private static HandlerMethodArgumentResolver principalResolver() {
    return new HandlerMethodArgumentResolver() {
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
                UUID.randomUUID(),
                "Gestor fictício",
                false,
                Set.of("AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS")),
            UUID.randomUUID());
      }
    };
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.identidadeacesso.api.AuthenticationController;
import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.application.LocalAuthenticationService;
import br.com.avaliacao.desempenho.identidadeacesso.application.LoginRateLimiter;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.ObjectMapper;

/** Exercita cookies e token mascarado reais, sem o atalho de teste with(csrf()). */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.MOCK,
    properties = {"debug=false", "logging.level.org.springframework.web=INFO"})
@Import(AuthenticatedCsrfFlowTests.Fixture.class)
class AuthenticatedCsrfFlowTests {
  @Autowired WebApplicationContext context;
  @Autowired ObjectMapper json;

  @Test
  void reusesIssuedCsrfAcrossAuthenticatedReadsAndRepeatedImportWrites() throws Exception {
    var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    Cookie access = new Cookie("ADC-ACCESS", "synthetic-access");
    var issued =
        mvc.perform(get("/api/v1/auth/csrf").cookie(access))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse();
    Cookie csrf = issued.getCookie("ADC-XSRF-TOKEN");
    String token = json.readTree(issued.getContentAsString()).get("token").asString();
    assertThat(csrf).isNotNull();
    for (int attempt = 0; attempt < 3; attempt++) {
      var read =
          mvc.perform(get("/api/v1/master-data/areas").cookie(access, csrf))
              .andExpect(status().isNotFound())
              .andReturn()
              .getResponse();
      assertThat(read.getCookie("ADC-XSRF-TOKEN")).isNull();
      for (String kind : new String[] {"collaborators", "assignments", "allocations"}) {
        mvc.perform(
                post("/api/v1/master-data/imports/" + kind + "/preview")
                    .cookie(access, csrf)
                    .header("X-CSRF-TOKEN", token))
            .andExpect(
                status().isNotFound()); // Rota persistida ausente; todos os filtros permitiram.
      }
      mvc.perform(
              delete("/api/v1/master-data/imports/00000000-0000-0000-0000-000000000001")
                  .cookie(access, csrf)
                  .header("X-CSRF-TOKEN", token))
          .andExpect(status().isNotFound());
    }
    mvc.perform(post("/api/v1/master-data/imports/allocations/preview").cookie(access, csrf))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    mvc.perform(
            post("/api/v1/master-data/imports/allocations/preview")
                .cookie(access, csrf)
                .header("X-CSRF-TOKEN", "invalid"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
  }

  @Test
  void rotatesCsrfOnlyAtSuccessfulSessionBoundariesAndRejectsTheOldToken() throws Exception {
    var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    Cookie access = new Cookie("ADC-ACCESS", "synthetic-access");
    for (MockHttpServletRequestBuilder transition :
        new MockHttpServletRequestBuilder[] {
          post("/api/v1/auth/sessions")
              .contentType(MediaType.APPLICATION_JSON)
              .content("{\"login\":\"qa@example.test\",\"password\":\"synthetic-test-password\"}"),
          post("/api/v1/auth/sessions/refresh"),
          delete("/api/v1/auth/sessions/current"),
          put("/api/v1/auth/password")
              .contentType(MediaType.APPLICATION_JSON)
              .content("{\"currentPassword\":\"synthetic-old\",\"newPassword\":\"synthetic-new\"}")
        }) {
      var issued =
          mvc.perform(get("/api/v1/auth/csrf").cookie(access))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse();
      Cookie csrf = issued.getCookie("ADC-XSRF-TOKEN");
      String token = json.readTree(issued.getContentAsString()).get("token").asString();
      var transitioned =
          mvc.perform(transition.cookie(access, csrf).header("X-CSRF-TOKEN", token))
              .andExpect(status().isNoContent())
              .andReturn()
              .getResponse();
      assertThat(transitioned.getCookie("ADC-XSRF-TOKEN").getMaxAge()).isZero();
      // O navegador descarta o cookie expirado e precisa obter um novo par cookie/token.
      var renewed =
          mvc.perform(get("/api/v1/auth/csrf").cookie(access))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse();
      Cookie nextCookie = renewed.getCookie("ADC-XSRF-TOKEN");
      assertThat(nextCookie.getValue()).isNotEqualTo(csrf.getValue());
      mvc.perform(
              post("/api/v1/master-data/imports/allocations/preview")
                  .cookie(access, nextCookie)
                  .header("X-CSRF-TOKEN", token))
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
      String nextToken = json.readTree(renewed.getContentAsString()).get("token").asString();
      mvc.perform(
              post("/api/v1/master-data/imports/allocations/preview")
                  .cookie(access, nextCookie)
                  .header("X-CSRF-TOKEN", nextToken))
          .andExpect(status().isNotFound());
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Fixture {
    @Bean
    AuthenticationController authenticationController(CsrfTokenRepository csrf) {
      var service = mock(LocalAuthenticationService.class);
      var now = Instant.now();
      var credentials =
          new LocalAuthenticationService.SessionCredentials(
              UUID.randomUUID(),
              "Pessoa fictícia",
              false,
              UUID.randomUUID(),
              "synthetic-access",
              now.plusSeconds(300),
              "synthetic-refresh",
              now.plusSeconds(3600));
      when(service.authenticate(anyString(), anyString(), anyString())).thenReturn(credentials);
      when(service.refresh(anyString(), anyString())).thenReturn(credentials);
      return new AuthenticationController(service, mock(LoginRateLimiter.class), csrf);
    }

    @Bean
    AccessTokenAuthenticationFilter accessTokenAuthenticationFilter() {
      var jwt = mock(AccessTokenService.class);
      var repository = mock(IdentityAccessRepository.class);
      var userId = UUID.randomUUID();
      var sessionId = UUID.randomUUID();
      when(jwt.decode("synthetic-access"))
          .thenReturn(
              Optional.of(
                  new AccessTokenService.DecodedAccessToken(userId, sessionId, "synthetic-jti")));
      when(repository.findAuthorizedUserForActiveSession(
              eq(sessionId), eq(userId), eq("synthetic-jti"), any()))
          .thenReturn(
              Optional.of(
                  new AuthorizedUser(userId, "Pessoa fictícia", false, Set.of("CADASTROS.GERIR"))));
      return new AccessTokenAuthenticationFilter(jwt, repository, Clock.systemUTC());
    }
  }
}

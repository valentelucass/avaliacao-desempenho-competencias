package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.identidadeacesso.api.AuthenticationController;
import br.com.avaliacao.desempenho.identidadeacesso.application.AuthenticationFailureException;
import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.application.LocalAuthenticationService;
import br.com.avaliacao.desempenho.identidadeacesso.application.LoginRateLimiter;
import br.com.avaliacao.desempenho.identidadeacesso.application.RateLimitedException;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Instant;
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
import org.springframework.http.MediaType;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.ObjectMapper;

/** Contrato de restauração opcional com filtros e par cookie/token CSRF reais. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import(SessionRestorationHttpTests.Fixture.class)
class SessionRestorationHttpTests {
  @Autowired WebApplicationContext context;
  @Autowired LocalAuthenticationService service;
  @Autowired ObjectMapper json;
  MockMvc mvc;

  @BeforeEach
  void setup() {
    reset(service);
    mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
  }

  @Test
  void absentSessionIsNormalAndDoesNotCallRefreshOrReturnIdentity() throws Exception {
    var response =
        mvc.perform(withCsrf(post("/api/v1/auth/sessions/restore")))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"authenticated\":false}"))
            .andExpect(
                header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            .andReturn()
            .getResponse();
    assertThat(response.getCookies()).isEmpty();
    verifyNoInteractions(service);
  }

  @Test
  void rejectedRefreshIsAnonymousAndDoesNotGrantAccess() throws Exception {
    when(service.refresh(eq("synthetic-invalid"), anyString()))
        .thenThrow(new AuthenticationFailureException());
    mvc.perform(
            withCsrf(post("/api/v1/auth/sessions/restore"))
                .cookie(
                    new Cookie("ADC-ACCESS", "synthetic-expired"),
                    new Cookie("ADC-REFRESH", "synthetic-invalid")))
        .andExpect(status().isOk())
        .andExpect(content().json("{\"authenticated\":false}"))
        .andExpect(header().doesNotExist("Set-Cookie"));
    mvc.perform(get("/api/v1/auth/me").cookie(new Cookie("ADC-ACCESS", "synthetic-expired")))
        .andExpect(status().isUnauthorized());
    verify(service).refresh(eq("synthetic-invalid"), anyString());
  }

  @Test
  void validAccessPreservesSessionAndCsrfWithoutRotatingRefresh() throws Exception {
    var response =
        mvc.perform(
                withCsrf(post("/api/v1/auth/sessions/restore"))
                    .cookie(new Cookie("ADC-ACCESS", "synthetic-valid")))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"authenticated\":true}"))
            .andReturn()
            .getResponse();
    assertThat(response.getCookies()).isEmpty();
    verifyNoInteractions(service);
  }

  @Test
  void validRefreshRotatesSecureCookiesAndCsrfBeforeReadingIdentity() throws Exception {
    var now = Instant.now();
    when(service.refresh(eq("synthetic-refresh"), anyString()))
        .thenReturn(
            new LocalAuthenticationService.SessionCredentials(
                UUID.randomUUID(),
                "Conta fictícia",
                false,
                UUID.randomUUID(),
                "synthetic-valid",
                now.plusSeconds(300),
                "synthetic-replacement",
                now.plusSeconds(3600)));
    var response =
        mvc.perform(
                withCsrf(post("/api/v1/auth/sessions/restore"))
                    .cookie(new Cookie("ADC-REFRESH", "synthetic-refresh")))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"authenticated\":true}"))
            .andReturn()
            .getResponse();
    for (String name : new String[] {"ADC-ACCESS", "ADC-REFRESH"}) {
      var cookie = response.getCookie(name);
      assertThat(cookie.isHttpOnly()).isTrue();
      assertThat(cookie.getSecure()).isTrue();
      assertThat(cookie.getAttribute("SameSite")).isEqualTo("Strict");
    }
    assertThat(response.getCookie("ADC-XSRF-TOKEN").getMaxAge()).isZero();
    mvc.perform(get("/api/v1/auth/me").cookie(response.getCookie("ADC-ACCESS")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.displayName").value("Conta fictícia"));
    verify(service).refresh(eq("synthetic-refresh"), anyString());
  }

  @Test
  void restorationStillRequiresCsrfAndOnlyPostIsAllowed() throws Exception {
    mvc.perform(post("/api/v1/auth/sessions/restore"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    mvc.perform(
            withCsrf(post("/api/v1/auth/sessions/restore"))
                .with(
                    request -> {
                      request.removeHeader("X-CSRF-TOKEN");
                      request.addHeader("X-CSRF-TOKEN", "invalid");
                      return request;
                    }))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/auth/sessions/restore")).andExpect(status().isUnauthorized());
    verifyNoInteractions(service);
  }

  @Test
  void existingLoginRefreshAndProtectedRoutesKeepUnauthorizedResponses() throws Exception {
    when(service.refresh(anyString(), anyString())).thenThrow(new AuthenticationFailureException());
    when(service.authenticate(anyString(), anyString(), anyString()))
        .thenThrow(new AuthenticationFailureException());
    mvc.perform(withCsrf(post("/api/v1/auth/sessions/refresh")))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            withCsrf(post("/api/v1/auth/sessions"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"synthetic\",\"password\":\"synthetic-invalid\"}"))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/master-data/areas")).andExpect(status().isUnauthorized());
  }

  @Test
  void nonAuthenticationFailuresAreNotConvertedToAnonymousSuccess() throws Exception {
    when(service.refresh(eq("synthetic-refresh"), anyString()))
        .thenThrow(new RateLimitedException());
    mvc.perform(
            withCsrf(post("/api/v1/auth/sessions/restore"))
                .cookie(new Cookie("ADC-REFRESH", "synthetic-refresh")))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
  }

  private MockHttpServletRequestBuilder withCsrf(MockHttpServletRequestBuilder request)
      throws Exception {
    var issued =
        mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn().getResponse();
    return request
        .cookie(issued.getCookie("ADC-XSRF-TOKEN"))
        .header("X-CSRF-TOKEN", json.readTree(issued.getContentAsString()).get("token").asString());
  }

  @TestConfiguration
  static class Fixture {
    @Bean
    LocalAuthenticationService authenticationService() {
      return mock(LocalAuthenticationService.class);
    }

    @Bean
    AuthenticationController authenticationController(
        LocalAuthenticationService service, CsrfTokenRepository csrf) {
      return new AuthenticationController(service, mock(LoginRateLimiter.class), csrf);
    }

    @Bean
    AccessTokenAuthenticationFilter accessTokenAuthenticationFilter() {
      var jwt = mock(AccessTokenService.class);
      var repository = mock(IdentityAccessRepository.class);
      var userId = UUID.randomUUID();
      var sessionId = UUID.randomUUID();
      when(jwt.decode("synthetic-valid"))
          .thenReturn(
              Optional.of(
                  new AccessTokenService.DecodedAccessToken(userId, sessionId, "synthetic-jti")));
      when(repository.findAuthorizedUserForActiveSession(
              eq(sessionId), eq(userId), eq("synthetic-jti"), any()))
          .thenReturn(Optional.of(new AuthorizedUser(userId, "Conta fictícia", false, Set.of())));
      return new AccessTokenAuthenticationFilter(jwt, repository, Clock.systemUTC());
    }
  }
}

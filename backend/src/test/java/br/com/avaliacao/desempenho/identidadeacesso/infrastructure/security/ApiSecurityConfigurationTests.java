package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import jakarta.servlet.Filter;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import(ApiSecurityConfigurationTests.JwtAccessFilterTestConfiguration.class)
class ApiSecurityConfigurationTests {

  private static final String FRONTEND_ORIGIN = "https://formulario.rodogarcia.com.br";

  @Autowired private WebApplicationContext webApplicationContext;

  @Autowired private PasswordEncoder passwordEncoder;

  @Autowired private AccessTokenAuthenticationFilter accessTokenAuthenticationFilter;

  @Autowired private FilterChainProxy filterChainProxy;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    mockMvc =
        MockMvcBuilders.webAppContextSetup(webApplicationContext).apply(springSecurity()).build();
  }

  @Test
  void rejectsAnonymousRequestsWithSafeProblemDetail() throws Exception {
    mockMvc
        .perform(
            get("/api/v1/assessments")
                .header(RequestCorrelationFilter.REQUEST_ID_HEADER, "test-123"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
        .andExpect(jsonPath("$.requestId").value("test-123"))
        .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        .andExpect(
            header()
                .string(
                    "Permissions-Policy",
                    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"))
        .andExpect(header().stringValues("Strict-Transport-Security", "max-age=31536000"));
  }

  @Test
  void rejectsAuthenticatedRequestWithoutExplicitPermission() throws Exception {
    mockMvc
        .perform(get("/api/v1/assessments").with(user("manager")))
        .andExpect(status().isForbidden())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
  }

  @Test
  void appliesTheSpecificAdministrativeReadGateBeforeTheBroaderAdministrativeRouteGate()
      throws Exception {
    mockMvc
        .perform(
            get("/api/v1/master-data/branches")
                .with(
                    user("link-manager")
                        .authorities(
                            new SimpleGrantedAuthority(
                                "PERMISSION:VINCULOS_GESTOR_COLABORADOR.GERIR"))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

    mockMvc
        .perform(
            get("/api/v1/administration/manager-assignments/active")
                .with(
                    user("master-data")
                        .authorities(new SimpleGrantedAuthority("PERMISSION:CADASTROS.GERIR"))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

    mockMvc
        .perform(
            get("/api/v1/master-data/user-collaborator-links/options")
                .with(
                    user("manager-link")
                        .authorities(
                            new SimpleGrantedAuthority(
                                "PERMISSION:VINCULOS_GESTOR_COLABORADOR.GERIR"))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

    mockMvc
        .perform(
            get("/api/v1/administration/manager-assignments/options")
                .with(
                    user("user-link")
                        .authorities(
                            new SimpleGrantedAuthority(
                                "PERMISSION:VINCULOS_USUARIO_COLABORADOR.GERIR"))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
  }

  @Test
  void permitsACycleAdministratorThroughTheApprovedQuestionnaireReadGate() throws Exception {
    mockMvc
        .perform(
            get("/api/v1/questionnaire-versions/approved")
                .with(
                    user("cycle-administrator")
                        .authorities(new SimpleGrantedAuthority("PERMISSION:CICLOS.GERIR"))))
        // A rota persistida não é registrada neste contexto; 404 prova que o gate não devolveu 403.
        .andExpect(status().isNotFound());
  }

  @Test
  void acceptsCorsPreflightOnlyForConfiguredFrontend() throws Exception {
    mockMvc
        .perform(
            options("/api/v1/assessments")
                .header(HttpHeaders.ORIGIN, FRONTEND_ORIGIN)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
        .andExpect(status().isOk())
        .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND_ORIGIN))
        .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
  }

  @Test
  void rejectsCorsPreflightForUnknownOrigin() throws Exception {
    mockMvc
        .perform(
            options("/api/v1/assessments")
                .header(HttpHeaders.ORIGIN, "https://untrusted.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
        .andExpect(status().isForbidden());
  }

  @Test
  void encodesPasswordsWithAdaptiveHashInsteadOfPlaintext() {
    String hash = passwordEncoder.encode("temporary-test-password");

    org.assertj.core.api.Assertions.assertThat(hash).isNotEqualTo("temporary-test-password");
    org.assertj.core.api.Assertions.assertThat(
            passwordEncoder.matches("temporary-test-password", hash))
        .isTrue();
  }

  @Test
  void placesAccessTokenAuthenticationAfterSecurityContextInitialization() {
    List<Filter> filters = filterChainProxy.getFilters("/api/v1/auth/me");
    int securityContextIndex = indexOf(filters, SecurityContextHolderFilter.class);

    assertThat(filters.indexOf(accessTokenAuthenticationFilter))
        .isGreaterThan(securityContextIndex);
  }

  private static int indexOf(List<Filter> filters, Class<? extends Filter> filterType) {
    for (int index = 0; index < filters.size(); index++) {
      if (filterType.isInstance(filters.get(index))) {
        return index;
      }
    }
    return -1;
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class JwtAccessFilterTestConfiguration {

    @Bean
    AccessTokenAuthenticationFilter accessTokenAuthenticationFilter() {
      return new AccessTokenAuthenticationFilter(
          org.mockito.Mockito.mock(AccessTokenService.class),
          org.mockito.Mockito.mock(IdentityAccessRepository.class),
          Clock.systemUTC());
    }
  }
}

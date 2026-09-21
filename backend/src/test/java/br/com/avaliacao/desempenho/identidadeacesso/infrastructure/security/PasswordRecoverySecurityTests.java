package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.identidadeacesso.api.PasswordRecoveryController;
import br.com.avaliacao.desempenho.identidadeacesso.application.PasswordRecoveryService;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import({
  PasswordRecoverySecurityTests.Config.class,
  ApiSecurityConfigurationTests.JwtAccessFilterTestConfiguration.class
})
class PasswordRecoverySecurityTests {
  @Autowired WebApplicationContext web;
  @Autowired PasswordRecoveryService service;
  MockMvc mvc;

  @BeforeEach
  void setup() {
    reset(service);
    mvc = MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();
  }

  private org.springframework.test.web.servlet.request.RequestPostProcessor actor(
      String... permissions) {
    var codes = Set.of(permissions);
    var principal =
        new AuthenticatedPrincipal(
            new AuthorizedUser(
                UUID.randomUUID(),
                "Administrador fictício",
                false,
                true,
                codes,
                Set.of("ADMINISTRADOR_PLATAFORMA")),
            UUID.randomUUID());
    return authentication(
        new UsernamePasswordAuthenticationToken(
            principal,
            null,
            codes.stream().map(code -> new SimpleGrantedAuthority("PERMISSION:" + code)).toList()));
  }

  @Test
  void publicRequestRequiresCsrfAndRejectsUnknownFieldsWithoutExposingAccountExistence()
      throws Exception {
    String url = "/api/v1/auth/password-reset-requests";
    String body = "{\"login\":\"fixture@example.invalid\"}";
    mvc.perform(post(url).contentType("application/json").content(body))
        .andExpect(status().isForbidden());
    verifyNoInteractions(service);
    mvc.perform(post(url).with(csrf()).contentType("application/json").content(body))
        .andExpect(status().isAccepted())
        .andExpect(content().string(""))
        .andExpect(header().string("Cache-Control", "no-store"));
    verify(service).request(eq("fixture@example.invalid"), anyString(), anyString());
    clearInvocations(service);
    mvc.perform(post(url).with(csrf()).contentType("application/json").content("{\"login\":\"\"}"))
        .andExpect(status().isUnprocessableContent());
    mvc.perform(
            post(url)
                .with(csrf())
                .contentType("application/json")
                .content("{\"login\":\"fixture\",\"userId\":\"injected\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(service);
  }

  @Test
  void requestQueueAndGenerationDenyUnauthenticatedMissingPermissionsAndMissingCsrf()
      throws Exception {
    String queue = "/api/v1/administration/password-reset-requests";
    String generation = "/api/v1/administration/users/" + UUID.randomUUID() + "/temporary-password";
    mvc.perform(get(queue)).andExpect(status().isUnauthorized());
    mvc.perform(get(queue).with(actor("USUARIOS.LER"))).andExpect(status().isForbidden());
    mvc.perform(post(generation).with(csrf())).andExpect(status().isUnauthorized());
    mvc.perform(post(generation).with(actor("USUARIOS.LER", "USUARIOS.ALTERAR")))
        .andExpect(status().isForbidden());
    mvc.perform(post(generation).with(csrf()).with(actor("USUARIOS.ALTERAR")))
        .andExpect(status().isForbidden());
    verifyNoInteractions(service);
    when(service.list(any(), anySet(), eq(0L), eq(100))).thenReturn(List.of());
    mvc.perform(get(queue).with(actor("USUARIOS.LER", "USUARIOS.ALTERAR")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items").isEmpty())
        .andExpect(jsonPath("$.page.limit").value(100));
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Config {
    @Bean
    PasswordRecoveryService recoveryService() {
      return mock(PasswordRecoveryService.class);
    }

    @Bean
    PasswordRecoveryController recoveryController(PasswordRecoveryService service) {
      return new PasswordRecoveryController(service);
    }
  }
}

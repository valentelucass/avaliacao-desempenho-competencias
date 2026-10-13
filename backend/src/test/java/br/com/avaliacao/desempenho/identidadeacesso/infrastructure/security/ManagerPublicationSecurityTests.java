package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.avaliacoes.api.AssessmentController;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentApplicationService;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentConflictException;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import({
  ManagerPublicationSecurityTests.Config.class,
  ApiSecurityConfigurationTests.JwtAccessFilterTestConfiguration.class
})
class ManagerPublicationSecurityTests {
  @Autowired WebApplicationContext web;
  @Autowired AssessmentApplicationService service;
  MockMvc mvc;
  UUID actorId = UUID.randomUUID();
  UUID assessmentId = UUID.randomUUID();
  String route;

  @BeforeEach
  void setup() {
    reset(service);
    mvc = MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();
    route = "/api/v1/assessments/" + assessmentId + "/publish";
    // A domain conflict proves the authenticated request reached the use case.
    when(service.publish(any(), any(), any(), any()))
        .thenThrow(
            new AssessmentConflictException(
                AssessmentConflictException.Reason.INVALID_STATE_TRANSITION, "Estado inválido."));
  }

  RequestPostProcessor actor(Set<String> roles, Set<String> permissions) {
    var principal =
        new AuthenticatedPrincipal(
            new AuthorizedUser(actorId, "Pessoa fictícia", false, permissions, roles),
            UUID.randomUUID());
    var authorities = new ArrayList<SimpleGrantedAuthority>();
    roles.forEach(role -> authorities.add(new SimpleGrantedAuthority("ROLE:" + role)));
    permissions.forEach(
        permission -> authorities.add(new SimpleGrantedAuthority("PERMISSION:" + permission)));
    return authentication(new UsernamePasswordAuthenticationToken(principal, null, authorities));
  }

  @Test
  void permitsManagerWithExistingTeamPermissionAndKeepsRhAndDirectorateAccess() throws Exception {
    for (String role : List.of("GESTOR", "GERENCIA_RH", "DIRETORIA")) {
      String permission =
          role.equals("GESTOR") ? "AVALIACOES.AVALIAR_VINCULADOS" : "AVALIACOES.PUBLICAR";
      mvc.perform(
              post(route)
                  .header("Idempotency-Key", "fixture-publication")
                  .with(csrf())
                  .with(actor(Set.of(role), Set.of(permission))))
          .andExpect(status().isConflict());
      verify(service)
          .publish(
              eq(assessmentId),
              argThat(
                  context ->
                      context.userId().equals(actorId)
                          && context.hasRole(role)
                          && context.has(permission)),
              eq("fixture-publication"),
              any());
    }
  }

  @Test
  void deniesAnonymousMissingCsrfMissingPermissionWrongRoleAndTechnicalAdministrator()
      throws Exception {
    mvc.perform(post(route).with(csrf())).andExpect(status().isUnauthorized());
    mvc.perform(post(route).with(actor(Set.of("GESTOR"), Set.of("AVALIACOES.AVALIAR_VINCULADOS"))))
        .andExpect(status().isForbidden());
    for (Set<String> roles :
        List.of(
            Set.of("COLABORADOR"),
            Set.of("GESTOR", "ADMINISTRADOR_PLATAFORMA"),
            Set.<String>of())) {
      mvc.perform(
              post(route)
                  .header("Idempotency-Key", "fixture-publication")
                  .with(csrf())
                  .with(
                      actor(roles, Set.of("AVALIACOES.AVALIAR_VINCULADOS", "AVALIACOES.PUBLICAR"))))
          .andExpect(status().isForbidden());
    }
    mvc.perform(
            post(route)
                .header("Idempotency-Key", "fixture-publication")
                .with(csrf())
                .with(actor(Set.of("GESTOR"), Set.of("AVALIACOES.PUBLICAR"))))
        .andExpect(status().isForbidden());
    verifyNoInteractions(service);
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Config {
    @Bean
    AssessmentApplicationService publicationService() {
      return mock(AssessmentApplicationService.class);
    }

    @Bean
    AssessmentController publicationController(AssessmentApplicationService service) {
      return new AssessmentController(service);
    }
  }
}

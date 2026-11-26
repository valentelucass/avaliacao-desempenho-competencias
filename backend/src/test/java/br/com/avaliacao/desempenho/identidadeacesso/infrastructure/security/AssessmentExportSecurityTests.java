package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.avaliacoes.api.AssessmentExportController;
import br.com.avaliacao.desempenho.avaliacoes.application.*;
import br.com.avaliacao.desempenho.avaliacoes.infrastructure.files.AssessmentXlsxWriter;
import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import java.time.Clock;
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
  AssessmentExportSecurityTests.Config.class,
  ApiSecurityConfigurationTests.JwtAccessFilterTestConfiguration.class
})
class AssessmentExportSecurityTests {
  @Autowired WebApplicationContext web;
  @Autowired AssessmentExportRepository repository;
  @Autowired AssessmentCoverageRepository coverage;
  MockMvc mvc;
  static final String URL = "/api/v1/assessments/exports";

  @BeforeEach
  void setup() {
    reset(repository, coverage);
    when(repository.listForExport(any(), any(), anyInt())).thenReturn(List.of());
    when(coverage.listForExport(any(), anyInt())).thenReturn(List.of());
    mvc = MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();
  }

  private RequestPostProcessor actor(String role, Set<String> grants) {
    var principal =
        new AuthenticatedPrincipal(
            new AuthorizedUser(
                UUID.randomUUID(), "Export test", false, false, grants, Set.of(role)),
            UUID.randomUUID());
    return authentication(
        new UsernamePasswordAuthenticationToken(
            principal,
            null,
            grants.stream()
                .map(grant -> new SimpleGrantedAuthority("PERMISSION:" + grant))
                .toList()));
  }

  static Set<String> grants() {
    return Set.of("AVALIACOES.VISUALIZAR_TODAS", "DADOS.EXPORTAR");
  }

  @Test
  void downloadsXlsxForAuthorizedActorAndDoesNotCache() throws Exception {
    mvc.perform(
            post(URL)
                .with(actor("GERENCIA_RH", grants()))
                .with(csrf())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isOk())
        .andExpect(content().contentType(AssessmentExportController.XLSX))
        .andExpect(
            header()
                .string(
                    "Content-Disposition", "attachment; filename=\"avaliacoes-desempenho.xlsx\""))
        .andExpect(header().string("Cache-Control", "no-store"));
    verify(repository).listForExport(any(), any(), eq(50_001));
  }

  @Test
  void requiresSessionCsrfPermissionsAndBusinessRole() throws Exception {
    mvc.perform(post(URL).with(csrf()).contentType("application/json").content("{}"))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post(URL)
                .with(actor("GERENCIA_RH", grants()))
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(URL)
                .with(actor("GERENCIA_RH", Set.of("AVALIACOES.VISUALIZAR_TODAS")))
                .with(csrf())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(URL)
                .with(actor("ADMINISTRADOR_PLATAFORMA", grants()))
                .with(csrf())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
    verifyNoInteractions(repository);
  }

  @Test
  void rejectsInvalidFilterAndJsonCannotSupplyAuthorityOrScope() throws Exception {
    mvc.perform(
            post(URL)
                .with(actor("DIRETORIA", grants()))
                .with(csrf())
                .contentType("application/json")
                .content("{\"status\":\"INVENTADO\"}"))
        .andExpect(status().is4xxClientError());
    mvc.perform(
            post(URL)
                .with(actor("DIRETORIA", grants()))
                .with(csrf())
                .contentType("application/json")
                .content("{\"isAdmin\":true}"))
        .andExpect(status().is4xxClientError());
    verifyNoInteractions(repository);
  }

  @Test
  void coverageUsesTheAppliedFiltersAndProtectsTheDownload() throws Exception {
    UUID cycle = UUID.randomUUID();
    String filter =
        "{\"cycleId\":\"%s\",\"status\":\"PENDENTE\",\"managerName\":\"  João \"}".formatted(cycle);
    String url = URL + "/coverage";
    mvc.perform(post(url).with(csrf()).contentType("application/json").content(filter))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post(url)
                .with(actor("GERENCIA_RH", grants()))
                .contentType("application/json")
                .content(filter))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(url)
                .with(actor("GERENCIA_RH", Set.of("AVALIACOES.VISUALIZAR_TODAS")))
                .with(csrf())
                .contentType("application/json")
                .content(filter))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(url)
                .with(actor("ADMINISTRADOR_PLATAFORMA", grants()))
                .with(csrf())
                .contentType("application/json")
                .content(filter))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(url)
                .with(actor("GERENCIA_RH", grants()))
                .with(csrf())
                .contentType("application/json")
                .content("{\"status\":\"PENDENTE\"}"))
        .andExpect(status().is(422));
    verifyNoInteractions(coverage);

    mvc.perform(
            post(url)
                .with(actor("GERENCIA_RH", grants()))
                .with(csrf())
                .contentType("application/json")
                .content(filter))
        .andExpect(status().isOk())
        .andExpect(content().contentType(AssessmentExportController.XLSX))
        .andExpect(
            header()
                .string(
                    "Content-Disposition",
                    "attachment; filename=\"acompanhamento-do-inicio.xlsx\""))
        .andExpect(header().string("Cache-Control", "no-store"));
    verify(coverage)
        .listForExport(
            new AssessmentCoverageRepository.Filter(
                cycle, AssessmentCoverageRepository.StartStatus.PENDENTE, null, "João"),
            50_001);
    verifyNoInteractions(repository);
  }

  @TestConfiguration
  static class Config {
    @Bean
    AssessmentExportRepository exportRepository() {
      return mock(AssessmentExportRepository.class);
    }

    @Bean
    AssessmentCoverageRepository coverageRepository() {
      return mock(AssessmentCoverageRepository.class);
    }

    @Bean
    IdentityAccessRepository exportAudit() {
      return mock(IdentityAccessRepository.class);
    }

    @Bean
    AssessmentExportService exportService(
        AssessmentExportRepository repository,
        AssessmentCoverageRepository coverage,
        IdentityAccessRepository audit) {
      return new AssessmentExportService(
          repository, coverage, new AssessmentXlsxWriter(), audit, Clock.systemUTC());
    }

    @Bean
    AssessmentExportController exportController(AssessmentExportService service) {
      return new AssessmentExportController(service);
    }
  }
}

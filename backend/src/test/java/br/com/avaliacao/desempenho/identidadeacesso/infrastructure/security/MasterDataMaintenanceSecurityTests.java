package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.cadastros.api.*;
import br.com.avaliacao.desempenho.cadastros.application.*;
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
  MasterDataMaintenanceSecurityTests.Config.class,
  ApiSecurityConfigurationTests.JwtAccessFilterTestConfiguration.class
})
class MasterDataMaintenanceSecurityTests {
  @Autowired WebApplicationContext web;
  @Autowired MasterDataApplicationService writes;
  @Autowired SpreadsheetImportService imports;
  MockMvc mvc;
  UUID actor = UUID.randomUUID();

  @BeforeEach
  void setup() {
    reset(writes, imports);
    mvc = MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();
  }

  private org.springframework.test.web.servlet.request.RequestPostProcessor actor(
      String permission) {
    var principal =
        new AuthenticatedPrincipal(
            new AuthorizedUser(actor, "Pessoa fictícia", false, Set.of(permission)),
            UUID.randomUUID());
    return authentication(
        new UsernamePasswordAuthenticationToken(
            principal, null, List.of(new SimpleGrantedAuthority("PERMISSION:" + permission))));
  }

  @Test
  void checksPermissionCsrfDtoAndActorForEditingInactiveRecords() throws Exception {
    for (String collection : List.of("areas", "collaborators")) {
      String url = "/api/v1/master-data/" + collection + "/" + UUID.randomUUID();
      String field = collection.equals("areas") ? "name" : "displayName";
      String json = "{\"" + field + "\":\"Nome corrigido\"}";
      mvc.perform(patch(url).contentType("application/json").content(json).with(csrf()))
          .andExpect(status().isUnauthorized());
      mvc.perform(
              patch(url)
                  .contentType("application/json")
                  .content(json)
                  .with(csrf())
                  .with(actor("VINCULOS_GESTOR_COLABORADOR.GERIR")))
          .andExpect(status().isForbidden());
      mvc.perform(
              patch(url)
                  .contentType("application/json")
                  .content(json)
                  .with(actor("CADASTROS.GERIR")))
          .andExpect(status().isForbidden());
      mvc.perform(
              patch(url)
                  .contentType("application/json")
                  .content("{\"" + field + "\":\" \"}")
                  .with(csrf())
                  .with(actor("CADASTROS.GERIR")))
          .andExpect(status().isUnprocessableContent());
      mvc.perform(
              patch(url)
                  .contentType("application/json")
                  .content("{\"" + field + "\":\"Nome\",\"active\":true}")
                  .with(csrf())
                  .with(actor("CADASTROS.GERIR")))
          .andExpect(status().isUnprocessableContent());
      mvc.perform(
              patch(url)
                  .contentType("application/json")
                  .content(json)
                  .with(csrf())
                  .with(actor("CADASTROS.GERIR")))
          .andExpect(status().isNoContent());
    }
    verify(writes)
        .updateArea(
            any(), eq("Nome corrigido"), argThat(context -> context.actorUserId().equals(actor)));
    verify(writes)
        .updateCollaborator(
            any(), eq("Nome corrigido"), argThat(context -> context.actorUserId().equals(actor)));
    verifyNoMoreInteractions(writes);
  }

  @Test
  void requiresConfirmationEndpointsPermissionAndCsrfAndReportsSafeDeletionConflict()
      throws Exception {
    for (String collection : List.of("areas", "collaborators")) {
      UUID id = UUID.randomUUID();
      String url = "/api/v1/master-data/" + collection + "/" + id;
      mvc.perform(patch(url + "/reactivate").with(csrf()).with(actor("CADASTROS.GERIR")))
          .andExpect(status().isNoContent());
      mvc.perform(
              patch(url + "/reactivate")
                  .with(csrf())
                  .with(actor("VINCULOS_GESTOR_COLABORADOR.GERIR")))
          .andExpect(status().isForbidden());
      mvc.perform(delete(url).with(actor("CADASTROS.GERIR"))).andExpect(status().isForbidden());
      mvc.perform(delete(url).with(csrf()).with(actor("VINCULOS_GESTOR_COLABORADOR.GERIR")))
          .andExpect(status().isForbidden());
      mvc.perform(delete(url).with(csrf()).with(actor("CADASTROS.GERIR")))
          .andExpect(status().isNoContent());
    }
    doThrow(new MasterDataException(MasterDataException.Reason.DELETION_BLOCKED, "internal"))
        .when(writes)
        .deleteInactiveUnusedArea(any(), any());
    mvc.perform(
            delete("/api/v1/master-data/areas/" + UUID.randomUUID())
                .with(csrf())
                .with(actor("CADASTROS.GERIR")))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("MASTER_DATA_DELETE_BLOCKED"))
        .andExpect(jsonPath("$.requestId").isString());
  }

  @Test
  void protectsAllManagerImportOperationsWithTheirOwnPermissionBeforeReadingTheBody()
      throws Exception {
    String base = "/api/v1/administration/manager-assignment-imports";
    String id = UUID.randomUUID().toString();
    for (var request :
        List.of(
            post(base + "/preview")
                .contentType(SpreadsheetImportController.XLSX)
                .content("fixture"),
            post(base + "/" + id + "/confirm"),
            get(base + "/" + id),
            delete(base + "/" + id))) {
      mvc.perform(request.with(csrf()).with(actor("CADASTROS.GERIR")))
          .andExpect(status().isForbidden());
    }
    mvc.perform(
            post(base + "/preview")
                .contentType(SpreadsheetImportController.XLSX)
                .content("fixture")
                .with(actor("VINCULOS_GESTOR_COLABORADOR.GERIR")))
        .andExpect(status().isForbidden());
    verifyNoInteractions(imports);
    mvc.perform(
            post(base + "/preview")
                .contentType(SpreadsheetImportController.XLSX)
                .content(new byte[SpreadsheetReader.MAX_BYTES + 1])
                .with(csrf())
                .with(actor("VINCULOS_GESTOR_COLABORADOR.GERIR")))
        .andExpect(status().isContentTooLarge())
        .andExpect(jsonPath("$.code").value("IMPORT_LIMIT_EXCEEDED"));
    verify(imports).admit(actor);
    verifyNoMoreInteractions(imports);
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Config {
    @Bean
    MasterDataApplicationService maintenanceWrites() {
      return mock(MasterDataApplicationService.class);
    }

    @Bean
    SpreadsheetImportService maintenanceImports() {
      return mock(SpreadsheetImportService.class);
    }

    @Bean
    MasterDataController maintenanceController(MasterDataApplicationService service) {
      return new MasterDataController(service);
    }

    @Bean
    ManagerAssignmentImportController managerImportController(SpreadsheetImportService service) {
      return new ManagerAssignmentImportController(service);
    }
  }
}

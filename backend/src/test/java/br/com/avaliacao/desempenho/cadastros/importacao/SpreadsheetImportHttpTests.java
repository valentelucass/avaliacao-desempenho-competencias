package br.com.avaliacao.desempenho.cadastros.importacao;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.avaliacao.desempenho.cadastros.api.ManagerAssignmentImportController;
import br.com.avaliacao.desempenho.cadastros.api.MasterDataExceptionHandler;
import br.com.avaliacao.desempenho.cadastros.api.SpreadsheetImportController;
import br.com.avaliacao.desempenho.cadastros.application.*;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.Snapshot;
import br.com.avaliacao.desempenho.cadastros.infrastructure.files.RestrictedXlsxReader;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import com.jayway.jsonpath.JsonPath;
import java.time.Clock;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.*;

class SpreadsheetImportHttpTests {
  static MockMvc mvc(SpreadsheetImportService service, UUID actor) {
    var principal =
        new AuthenticatedPrincipal(
            new AuthorizedUser(actor, "Pessoa fictícia", false, Set.of("CADASTROS.GERIR")),
            UUID.randomUUID());
    return MockMvcBuilders.standaloneSetup(
            new SpreadsheetImportController(service),
            new ManagerAssignmentImportController(service))
        .setControllerAdvice(new MasterDataExceptionHandler())
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
                return principal;
              }
            })
        .build();
  }

  @Test
  void managerPreviewUsesMinimizedDtoAndCannotBeReadThroughMasterDataRoutes() throws Exception {
    var repository = mock(SpreadsheetImportRepository.class);
    UUID person = UUID.randomUUID(), manager = UUID.randomUUID(), actor = UUID.randomUUID();
    when(repository.managerAssignmentSnapshot(any(), any(), anyBoolean()))
        .thenReturn(
            new br.com.avaliacao.desempenho.cadastros.domain.model.ManagerAssignmentImport.Snapshot(
                Map.of(
                    "PESSOA",
                    java.util.List.of(
                        new br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport
                            .Collaborator(person, true))),
                Map.of("GESTORA", java.util.List.of(manager)),
                Map.of()));
    var service =
        new SpreadsheetImportService(
            new RestrictedXlsxReader(),
            repository,
            mock(MasterDataApplicationService.class),
            mock(TransactionTemplate.class),
            Clock.systemUTC());
    var mvc = mvc(service, actor);
    String body =
        mvc.perform(
                post("/api/v1/administration/manager-assignment-imports/preview")
                    .contentType(SpreadsheetImportController.XLSX)
                    .content(ManagerAssignmentImportTests.file("Gestora", "Pessoa", "16/09/2026")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.creates").value(1))
            .andExpect(jsonPath("$.rows[0].managerAssignment.manager").value("Gestora"))
            .andExpect(jsonPath("$.rows[0].managerAssignment.startsOn").value("16/09/2026"))
            .andExpect(jsonPath("$.rows[0].managerAssignment.managerUserId").doesNotExist())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String id = JsonPath.read(body, "$.id");
    assertThat(body)
        .doesNotContain(person.toString(), manager.toString(), actor.toString(), "login");
    mvc.perform(get("/api/v1/master-data/imports/" + id)).andExpect(status().isConflict());
    mvc.perform(get("/api/v1/administration/manager-assignment-imports/" + id))
        .andExpect(status().isOk());
    mvc.perform(delete("/api/v1/administration/manager-assignment-imports/" + id))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/administration/manager-assignment-imports/" + id))
        .andExpect(status().isConflict());
  }

  @Test
  void previewsArePagedBoundToActorAndDoNotWriteAndBodiesAreBounded() throws Exception {
    var repository = mock(SpreadsheetImportRepository.class);
    when(repository.snapshot(any(), isNull(), anyBoolean()))
        .thenReturn(new Snapshot(Map.of(), null, Map.of()));
    var writes = mock(MasterDataApplicationService.class);
    var service =
        new SpreadsheetImportService(
            new RestrictedXlsxReader(),
            repository,
            writes,
            mock(TransactionTemplate.class),
            Clock.systemUTC());
    UUID actor = UUID.randomUUID();
    var mvc = mvc(service, actor);
    String[] names = new String[26];
    for (int i = 0; i < names.length; i++) names[i] = "Pessoa fictícia " + i;
    String response =
        mvc.perform(
                post("/api/v1/master-data/imports/collaborators/preview")
                    .contentType(SpreadsheetImportController.XLSX)
                    .content(XlsxFixture.collaborators(names)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(26))
            .andExpect(jsonPath("$.rows.length()").value(25))
            .andExpect(jsonPath("$.rows[0].collaboratorId").doesNotExist())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String id = JsonPath.read(response, "$.id");
    mvc.perform(get("/api/v1/master-data/imports/" + id).param("page", "2"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.rows.length()").value(1))
        .andExpect(jsonPath("$.rows[0].line").value(27));
    mvc(service, UUID.randomUUID())
        .perform(get("/api/v1/master-data/imports/" + id))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("IMPORT_EXPIRED"));
    mvc.perform(
            post("/api/v1/master-data/imports/collaborators/preview")
                .contentType(SpreadsheetImportController.XLSX)
                .content(new byte[SpreadsheetReader.MAX_BYTES + 1]))
        .andExpect(status().isContentTooLarge())
        .andExpect(jsonPath("$.code").value("IMPORT_LIMIT_EXCEEDED"));
    mvc.perform(
            post("/api/v1/master-data/imports/collaborators/preview")
                .contentType(SpreadsheetImportController.XLSX)
                .content("not a workbook"))
        .andExpect(status().isUnprocessableContent())
        .andExpect(jsonPath("$.code").value("IMPORT_INVALID_FILE"))
        .andExpect(jsonPath("$.requestId").isString());
    verifyNoInteractions(writes);
    assertThat(response).doesNotContain("Filial", "actorUserId");
  }
}

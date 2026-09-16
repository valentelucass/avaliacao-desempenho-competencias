package br.com.avaliacao.desempenho.cadastros.importacao;

import static org.assertj.core.api.Assertions.*;

import br.com.avaliacao.desempenho.cadastros.application.*;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;
import br.com.avaliacao.desempenho.cadastros.infrastructure.files.RestrictedXlsxReader;
import br.com.avaliacao.desempenho.cadastros.infrastructure.persistence.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/**
 * Apenas AVALIACAO_DEV, registros fictícios exclusivos e rollback obrigatório antes de escrever.
 */
@EnabledIfSystemProperty(named = "adc.dev.maintenance.rollback", matches = "true")
class MasterDataMaintenanceDevSqlTests {
  @Test
  void preservesIdentityHistoryAndAuditAndImportsManagerLinksAtomically() {
    var source = new DriverManagerDataSource();
    source.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    source.setUrl(
        "jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;trustServerCertificate=true;integratedSecurity=true;authenticationScheme=NativeAuthentication");
    var jdbc = new JdbcTemplate(source);
    jdbc.setQueryTimeout(30);
    assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    UUID actor =
        jdbc.queryForObject(
            "SELECT TOP (1) usuario_id FROM dbo.usuario WHERE login_normalizado LIKE 'qa.feedback.rh.%' AND situacao='ATIVO' ORDER BY usuario_id",
            (rs, row) -> rs.getObject(1, UUID.class));
    String managerName =
        jdbc.queryForObject(
            "SELECT nome_exibicao FROM dbo.usuario WHERE usuario_id=?", String.class, actor);
    String prefix = "QA-MAINTENANCE-" + UUID.randomUUID(),
        reference = "maintenance-" + UUID.randomUUID();
    var context = new MasterDataCommandContext(actor, reference);
    var outer = new TransactionTemplate(new DataSourceTransactionManager(source));
    outer.setTimeout(90);
    var nested = new TransactionTemplate(new DataSourceTransactionManager(source));
    nested.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
    var repository = new SqlServerMasterDataRepository(jdbc);
    var writes = new MasterDataApplicationService(repository, nested);
    var reads = new SqlServerSpreadsheetImportRepository(jdbc, new ObjectMapper());
    var imports =
        new SpreadsheetImportService(
            new RestrictedXlsxReader(), reads, writes, nested, Clock.systemUTC());
    try {
      outer.executeWithoutResult(
          status -> {
            status.setRollbackOnly();
            UUID area = writes.createArea(prefix + " Área", context);
            UUID person = writes.createCollaborator(prefix + " Pessoa", context);
            writes.deactivateArea(area, context);
            writes.deactivateCollaborator(person, context);
            var blocked =
                imports.preview(
                    Kind.COLLABORATORS, null, XlsxFixture.collaborators(prefix + " Pessoa"), actor);
            assertThat(blocked.rows().getFirst().status()).isEqualTo(Status.ERROR);
            imports.discard(blocked.id(), actor);
            writes.updateArea(area, prefix + " Área corrigida", context);
            writes.updateCollaborator(person, prefix + " Pessoa corrigida", context);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT ativo FROM dbo.colaborador WHERE colaborador_id=?",
                        Boolean.class,
                        person))
                .isFalse();
            writes.reactivateArea(area, context);
            writes.reactivateCollaborator(person, context);
            var restored =
                imports.preview(
                    Kind.COLLABORATORS,
                    null,
                    XlsxFixture.collaborators(prefix + " Pessoa corrigida"),
                    actor);
            assertThat(restored.rows().getFirst().collaboratorId()).isEqualTo(person);
            assertThat(restored.rows().getFirst().status()).isEqualTo(Status.EXISTS);
            imports.discard(restored.id(), actor);
            assertThatThrownBy(() -> writes.deleteInactiveUnusedArea(area, context))
                .isInstanceOf(MasterDataException.class);
            assertThatThrownBy(() -> writes.deleteInactiveUnusedCollaborator(person, context))
                .isInstanceOf(MasterDataException.class);
            UUID allocation =
                writes.createAllocation(
                    person, null, area, null, LocalDate.of(2026, 1, 1), context);
            writes.closeAllocation(allocation, LocalDate.of(2026, 8, 31), context);
            writes.deactivateArea(area, context);
            writes.deactivateCollaborator(person, context);
            assertThatThrownBy(() -> writes.deleteInactiveUnusedArea(area, context))
                .isInstanceOf(MasterDataException.class);
            assertThatThrownBy(() -> writes.deleteInactiveUnusedCollaborator(person, context))
                .isInstanceOf(MasterDataException.class);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.lotacao_colaborador WHERE lotacao_colaborador_id=?",
                        Integer.class,
                        allocation))
                .isEqualTo(1);
            UUID unusedArea = writes.createArea(prefix + " Área sem uso", context);
            UUID unusedPerson = writes.createCollaborator(prefix + " Pessoa sem uso", context);
            writes.deactivateArea(unusedArea, context);
            writes.deactivateCollaborator(unusedPerson, context);
            writes.deleteInactiveUnusedArea(unusedArea, context);
            writes.deleteInactiveUnusedCollaborator(unusedPerson, context);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.colaborador WHERE colaborador_id=?",
                        Integer.class,
                        unusedPerson))
                .isZero();
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.area WHERE area_id=?", Integer.class, unusedArea))
                .isZero();
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=? AND acao IN ('CADASTRO.AREA.EXCLUIR','CADASTRO.COLABORADOR.EXCLUIR')",
                        Integer.class,
                        reference))
                .isEqualTo(2);

            UUID assigned = writes.createCollaborator(prefix + " Vínculo", context);
            byte[] file =
                ManagerAssignmentImportTests.file(managerName, prefix + " Vínculo", "16/09/2026");
            var preview = imports.preview(Kind.MANAGER_ASSIGNMENTS, null, file, actor);
            assertThat(preview.rows().getFirst().status()).isEqualTo(Status.CREATE);
            assertThat(imports.confirm(preview.id(), context, Kind.MANAGER_ASSIGNMENTS).created())
                .isEqualTo(1);
            assertThat(imports.confirm(preview.id(), context, Kind.MANAGER_ASSIGNMENTS).created())
                .isEqualTo(1);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.vinculo_gestor_colaborador WHERE colaborador_id=?",
                        Integer.class,
                        assigned))
                .isEqualTo(1);
            UUID link =
                jdbc.queryForObject(
                    "SELECT vinculo_gestor_colaborador_id FROM dbo.vinculo_gestor_colaborador WHERE colaborador_id=?",
                    (rs, row) -> rs.getObject(1, UUID.class),
                    assigned);
            assertThat(
                    jdbc.<UUID>queryForObject(
                        "SELECT gestor_usuario_id FROM dbo.vinculo_gestor_colaborador WHERE vinculo_gestor_colaborador_id=?",
                        (rs, row) -> rs.getObject(1, UUID.class),
                        link))
                .isEqualTo(actor);
            imports.discard(preview.id(), actor, Kind.MANAGER_ASSIGNMENTS);
            var repeated = imports.preview(Kind.MANAGER_ASSIGNMENTS, null, file, actor);
            assertThat(repeated.rows().getFirst().status()).isEqualTo(Status.EXISTS);
            imports.discard(repeated.id(), actor, Kind.MANAGER_ASSIGNMENTS);
            writes.closeManagerAssignment(link, LocalDate.of(2026, 9, 16), context);
            var overlap = imports.preview(Kind.MANAGER_ASSIGNMENTS, null, file, actor);
            assertThat(overlap.rows().getFirst().status()).isEqualTo(Status.ERROR);
            imports.discard(overlap.id(), actor, Kind.MANAGER_ASSIGNMENTS);
            var next =
                imports.preview(
                    Kind.MANAGER_ASSIGNMENTS,
                    null,
                    ManagerAssignmentImportTests.file(
                        managerName, prefix + " Vínculo", "17/09/2026"),
                    actor);
            assertThat(imports.confirm(next.id(), context, Kind.MANAGER_ASSIGNMENTS).created())
                .isEqualTo(1);
            imports.discard(next.id(), actor, Kind.MANAGER_ASSIGNMENTS);
            writes.deactivateCollaborator(assigned, context);
            assertThatThrownBy(() -> writes.deleteInactiveUnusedCollaborator(assigned, context))
                .isInstanceOf(MasterDataException.class);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.vinculo_gestor_colaborador WHERE colaborador_id=?",
                        Integer.class,
                        assigned))
                .isEqualTo(2);
            UUID stalePerson = writes.createCollaborator(prefix + " Alterado", context);
            var stale =
                imports.preview(
                    Kind.MANAGER_ASSIGNMENTS,
                    null,
                    ManagerAssignmentImportTests.file(
                        managerName, prefix + " Alterado", "16/09/2026"),
                    actor);
            writes.deactivateCollaborator(stalePerson, context);
            assertThatThrownBy(() -> imports.confirm(stale.id(), context, Kind.MANAGER_ASSIGNMENTS))
                .isInstanceOf(SpreadsheetImportException.class);
            imports.discard(stale.id(), actor, Kind.MANAGER_ASSIGNMENTS);

            writes.createCollaborator(prefix + " Falha A", context);
            writes.createCollaborator(prefix + " Falha B", context);
            var failingWrites =
                new MasterDataApplicationService(repository, nested) {
                  int count;

                  @Override
                  public UUID createManagerAssignment(
                      UUID manager,
                      UUID collaborator,
                      LocalDate start,
                      MasterDataCommandContext ctx) {
                    if (++count == 2)
                      throw new IllegalStateException("Falha fictícia na segunda linha");
                    return super.createManagerAssignment(manager, collaborator, start, ctx);
                  }
                };
            var failing =
                new SpreadsheetImportService(
                    new RestrictedXlsxReader(), reads, failingWrites, nested, Clock.systemUTC());
            var failFile =
                XlsxFixture.zip(
                    XlsxFixture.parts(
                        new String[][] {
                          {"Conta avaliadora", "Colaborador", "Início"},
                          {managerName, prefix + " Falha A", "16/09/2026"},
                          {managerName, prefix + " Falha B", "16/09/2026"}
                        }));
            var failPreview = failing.preview(Kind.MANAGER_ASSIGNMENTS, null, failFile, actor);
            String failedRef = "failed-" + reference;
            assertThatThrownBy(
                    () ->
                        failing.confirm(
                            failPreview.id(),
                            new MasterDataCommandContext(actor, failedRef),
                            Kind.MANAGER_ASSIGNMENTS))
                .isInstanceOf(IllegalStateException.class);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.vinculo_gestor_colaborador v JOIN dbo.colaborador c ON c.colaborador_id=v.colaborador_id WHERE c.nome_exibicao LIKE ?",
                        Integer.class,
                        prefix + " Falha%"))
                .isZero();
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=?",
                        Integer.class,
                        failedRef))
                .isZero();
          });
    } finally {
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.colaborador WHERE nome_exibicao LIKE ?",
                  Integer.class,
                  prefix + "%"))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.area WHERE nome LIKE ?", Integer.class, prefix + "%"))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=?",
                  Integer.class,
                  reference))
          .isZero();
    }
  }
}

package br.com.avaliacao.desempenho.cadastros.importacao;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.cadastros.application.MasterDataApplicationService;
import br.com.avaliacao.desempenho.cadastros.application.MasterDataCommandContext;
import br.com.avaliacao.desempenho.cadastros.infrastructure.persistence.SqlServerMasterDataRepository;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Exercita o SQL real em registros fictícios próprios e reverte toda a transação. */
@EnabledIfSystemProperty(named = "adc.dev.maintenance.rollback", matches = "true")
class ManagerReassignmentDevSqlTests {
  @Test
  void closesAnAssignmentAndCreatesAnotherEvaluatorWithoutRemovingHistory() {
    var source = new DriverManagerDataSource();
    source.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    source.setUrl(
        "jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;trustServerCertificate=true;integratedSecurity=true;authenticationScheme=NativeAuthentication");
    var jdbc = new JdbcTemplate(source);
    jdbc.setQueryTimeout(15);
    assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    var writes =
        new MasterDataApplicationService(new SqlServerMasterDataRepository(jdbc), transaction);
    UUID first = UUID.randomUUID(), second = UUID.randomUUID();
    String reference = "qa-reassignment-" + UUID.randomUUID();
    var context = new MasterDataCommandContext(first, reference);
    try {
      transaction.executeWithoutResult(
          status -> {
            status.setRollbackOnly();
            for (UUID user : new UUID[] {first, second}) {
              jdbc.update(
                  "INSERT INTO dbo.usuario (usuario_id,login_normalizado,nome_exibicao) VALUES (?,?,N'Avaliador fictício')",
                  user,
                  reference + user.toString().substring(0, 8));
              jdbc.update(
                  "INSERT INTO dbo.atribuicao_papel (atribuicao_papel_id,usuario_id,papel_id,concedido_por_usuario_id) SELECT NEWID(),?,papel_id,? FROM dbo.papel WHERE codigo='GESTOR'",
                  user,
                  first);
            }
            UUID person = writes.createCollaborator(reference, context);
            UUID original =
                writes.createManagerAssignment(first, person, LocalDate.of(2026, 9, 15), context);
            writes.closeManagerAssignment(original, LocalDate.of(2026, 9, 21), context);
            UUID replacement =
                writes.createManagerAssignment(second, person, LocalDate.of(2026, 9, 22), context);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.vinculo_gestor_colaborador WHERE colaborador_id=?",
                        Integer.class,
                        person))
                .isEqualTo(2);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.vinculo_gestor_colaborador WHERE vinculo_gestor_colaborador_id=? AND revogado_em_utc IS NOT NULL AND fim_vigencia='2026-09-21'",
                        Integer.class,
                        original))
                .isEqualTo(1);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT gestor_usuario_id FROM dbo.vinculo_gestor_colaborador WHERE vinculo_gestor_colaborador_id=? AND revogado_em_utc IS NULL",
                        UUID.class,
                        replacement))
                .isEqualTo(second);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM dbo.evento_auditoria WHERE request_id=? AND resultado='SUCESSO'",
                        Integer.class,
                        reference))
                .isEqualTo(4);
          });
    } finally {
      assertThat(
              jdbc.queryForObject(
                  "SELECT COUNT(*) FROM dbo.usuario WHERE usuario_id IN (?,?)",
                  Integer.class,
                  first,
                  second))
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

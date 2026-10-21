package br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationException.Reason;
import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DataAccessResourceFailureException;

class SqlServerEvaluationCycleAdministrationRepositoryTests {

  @Test
  void transitionSqlEnforcesTheConfiguredUtcWindowAndKeepsTheQuestionnaireFrozenBeforeOpening() {
    assertThat(SqlServerEvaluationCycleAdministrationRepository.OPEN_CYCLE_SQL)
        .contains(
            "ciclo.janela_abertura_em_utc <= SYSUTCDATETIME()",
            "SYSUTCDATETIME() < ciclo.janela_encerramento_em_utc",
            "dbo.ciclo_questionario");
    assertThat(SqlServerEvaluationCycleAdministrationRepository.CLOSE_CYCLE_SQL)
        .contains(
            "janela_encerramento_em_utc IS NOT NULL",
            "SYSUTCDATETIME() >= janela_encerramento_em_utc");
  }

  @ParameterizedTest
  @CsvSource({
    "51210,EXTENSION_CONFLICT",
    "51211,EXTENSION_NOT_FUTURE",
    "547,EXTENSION_CONFLICT",
    "2601,EXTENSION_CONFLICT",
    "2627,EXTENSION_CONFLICT",
    "1205,EXTENSION_CONFLICT",
    "18456,UNAVAILABLE",
    "51220,UNAVAILABLE"
  })
  void mapsConstraintDuplicateAndConcurrentWriteFailuresWithoutExposingSqlDetails(
      int code, Reason expected) {
    var error =
        new DataAccessResourceFailureException(
            "private detail", new SQLException("private SQL", "S0001", code));
    assertThat(SqlServerEvaluationCycleAdministrationRepository.extensionFailureReason(error))
        .isEqualTo(expected);
  }

  @Test
  void extensionIsAnInsertCommandRatherThanAnUnrestrictedCycleUpdate() {
    assertThat(SqlServerEvaluationCycleAdministrationRepository.EXTEND_CLOSING_SQL)
        .contains(
            "INSERT INTO dbo.prorrogacao_ciclo_avaliacao",
            "encerramento_anterior_em_utc",
            "novo_encerramento_em_utc",
            "motivo",
            "ator_usuario_id",
            "request_id")
        .doesNotContain("UPDATE dbo.ciclo_avaliacao", "SESSION_CONTEXT", "EXEC(");
  }
}

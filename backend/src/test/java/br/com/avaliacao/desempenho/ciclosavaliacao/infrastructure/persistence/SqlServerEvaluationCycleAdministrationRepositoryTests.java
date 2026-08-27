package br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

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
}

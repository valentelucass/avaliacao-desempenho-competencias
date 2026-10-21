package br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadScope;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleWindowStatus;
import java.sql.ResultSet;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SqlServerEvaluationCycleReadRepositoryTests {

  @Test
  void relationshipScopedQueriesRequireAnActiveAssignmentAndNeverSelectAnswerPoints() {
    EvaluationCycleReadScope scope = new EvaluationCycleReadScope(false, true, false, true);

    String listSql = SqlServerEvaluationCycleReadRepository.listSql(scope, true);
    String questionnaireSql = SqlServerEvaluationCycleReadRepository.questionnaireSql(scope);

    assertThat(listSql)
        .contains("dbo.atribuicao_questionario_colaborador", "dbo.vinculo_gestor_colaborador")
        .contains("dbo.vinculo_usuario_colaborador", "atribuicao.revogado_em_utc IS NULL")
        .contains("ciclo.situacao IN ('ABERTO', 'ENCERRADO')", "ciclo.ciclo_avaliacao_id > ?");
    assertThat(questionnaireSql)
        .contains("atribuicao.ciclo_questionario_id = ciclo_questionario.ciclo_questionario_id")
        .contains("versao_questionario.aprovado_em_utc IS NOT NULL")
        .doesNotContain("opcao.pontos", "nota_final", "classificacao");
  }

  @Test
  void administrativeQueryDoesNotNeedAUserRelationshipPredicate() {
    String sql =
        SqlServerEvaluationCycleReadRepository.listSql(
            new EvaluationCycleReadScope(true, false, false, false), false);

    assertThat(sql)
        .contains("SELECT TOP (?)", "ORDER BY ciclo.ciclo_avaliacao_id ASC")
        .doesNotContain("atribuicao_questionario_colaborador", "vinculo_gestor_colaborador");
  }

  @Test
  void directorScopeUsesTheSeparateDirectorManagerRelationship() {
    String sql =
        SqlServerEvaluationCycleReadRepository.listSql(
            new EvaluationCycleReadScope(false, false, true, false), false);

    assertThat(sql)
        .contains(
            "dbo.vinculo_diretoria_gerencia",
            "vinculo_diretoria.diretoria_usuario_id = ?",
            "vinculo_diretoria.gerencia_colaborador_id = atribuicao.colaborador_id")
        .doesNotContain("dbo.vinculo_gestor_colaborador", "dbo.vinculo_usuario_colaborador");
  }

  @Test
  void exposesAnExpiredWindowUsingTheDatabaseClockWithoutChangingTheStoredOpenStatus()
      throws Exception {
    ResultSet row = mock(ResultSet.class);
    when(row.getObject("ciclo_avaliacao_id", UUID.class)).thenReturn(UUID.randomUUID());
    when(row.getString("nome")).thenReturn("Ciclo 2026");
    when(row.getString("situacao")).thenReturn("ABERTO");
    when(row.getObject("janela_abertura_em_utc", LocalDateTime.class))
        .thenReturn(LocalDateTime.of(2026, 9, 16, 17, 0));
    when(row.getObject("janela_encerramento_em_utc", LocalDateTime.class))
        .thenReturn(LocalDateTime.of(2026, 10, 17, 2, 59));
    when(row.getObject("observado_em_utc", LocalDateTime.class))
        .thenReturn(LocalDateTime.of(2026, 10, 17, 2, 59));

    var cycle = SqlServerEvaluationCycleReadRepository.mapCycle(row);
    assertThat(cycle.status()).isEqualTo(EvaluationCycleStatus.ABERTO);
    assertThat(cycle.openingAt()).isEqualTo(Instant.parse("2026-09-16T17:00:00Z"));
    assertThat(cycle.closingAt()).isEqualTo(Instant.parse("2026-10-17T02:59:00Z"));
    assertThat(cycle.windowStatus()).isEqualTo(EvaluationCycleWindowStatus.PRAZO_ENCERRADO);
  }
}

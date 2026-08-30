package br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadScope;
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
}

package br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadScope;
import org.junit.jupiter.api.Test;

class SqlServerEvaluationCycleReadRepositoryTests {

  @Test
  void relationshipScopedQueriesRequireAnActiveAssignmentAndNeverSelectAnswerPoints() {
    EvaluationCycleReadScope scope = new EvaluationCycleReadScope(false, true, true);

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
            new EvaluationCycleReadScope(true, false, false), false);

    assertThat(sql)
        .contains("SELECT TOP (?)", "ORDER BY ciclo.ciclo_avaliacao_id ASC")
        .doesNotContain("atribuicao_questionario_colaborador", "vinculo_gestor_colaborador");
  }
}

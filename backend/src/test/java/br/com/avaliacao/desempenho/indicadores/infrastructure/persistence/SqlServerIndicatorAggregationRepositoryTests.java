package br.com.avaliacao.desempenho.indicadores.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorAggregateCriteria;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorMetric;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorPopulationDimension;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SqlServerIndicatorAggregationRepositoryTests {

  @Test
  void buildsABranchAverageFromPublishedManagerAssessmentsWithBoundParameters() {
    UUID cycleId = UUID.randomUUID();
    UUID branchId = UUID.randomUUID();
    IndicatorAggregateCriteria criteria =
        new IndicatorAggregateCriteria(
            cycleId,
            IndicatorMetric.FINAL_SCORE_AVERAGE,
            IndicatorPopulationDimension.BRANCH,
            branchId,
            null);

    String sql = SqlServerIndicatorAggregationRepository.sqlFor(criteria);

    assertThat(sql)
        .contains(
            "a.ciclo_avaliacao_id = ?",
            "a.tipo_avaliacao = 'GESTOR'",
            "a.situacao = 'PUBLICADA'",
            "va.situacao = 'PUBLICADA'",
            "lotacao.filial_id = ?",
            "COUNT(DISTINCT colaborador_id)")
        .doesNotContain(cycleId.toString(), branchId.toString());
    assertThat(SqlServerIndicatorAggregationRepository.argumentsFor(criteria, false))
        .containsExactly(cycleId, branchId);
  }

  @Test
  void computesCompetencyMeanPerCollaboratorAndBindsTheCompetencyIdentifier() {
    UUID cycleId = UUID.randomUUID();
    UUID competencyId = UUID.randomUUID();
    IndicatorAggregateCriteria criteria =
        new IndicatorAggregateCriteria(
            cycleId,
            IndicatorMetric.COMPETENCY_SCORE_AVERAGE,
            IndicatorPopulationDimension.OVERALL,
            null,
            competencyId);

    String sql = SqlServerIndicatorAggregationRepository.sqlFor(criteria);

    assertThat(sql)
        .contains(
            "GROUP BY population.colaborador_id",
            "resposta.versao_avaliacao_id = population.versao_avaliacao_id",
            "opcao.versao_questionario_id = population.versao_questionario_id",
            "versao_competencia.competencia_id = ?")
        .doesNotContain(cycleId.toString(), competencyId.toString());
    assertThat(SqlServerIndicatorAggregationRepository.argumentsFor(criteria, true))
        .containsExactly(cycleId, competencyId);
  }

  @Test
  void usesASeparateDistinctPopulationForClassificationDistributionWithoutReturningItFromTheApi() {
    IndicatorAggregateCriteria criteria =
        new IndicatorAggregateCriteria(
            UUID.randomUUID(),
            IndicatorMetric.CLASSIFICATION_DISTRIBUTION,
            IndicatorPopulationDimension.MANAGER,
            UUID.randomUUID(),
            null);

    String sql = SqlServerIndicatorAggregationRepository.sqlFor(criteria);

    assertThat(sql)
        .contains(
            "classification_counts AS",
            "COUNT_BIG(*) AS classification_count",
            "COUNT(DISTINCT colaborador_id) AS distinct_collaborators")
        .doesNotContain("SELECT colaborador_id,");
  }
}

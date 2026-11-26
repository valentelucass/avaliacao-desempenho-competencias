package br.com.avaliacao.desempenho.indicadores.infrastructure.persistence;

import static br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence.EvaluationCyclePopulationSql.CYCLE_AND_EXPECTED_COLLABORATORS;
import static br.com.avaliacao.desempenho.indicadores.infrastructure.persistence.SqlServerIndicatorAggregationRepository.PUBLISHED_MANAGER_POPULATION_SQL;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Kind;
import br.com.avaliacao.desempenho.indicadores.domain.port.IndicatorDashboardPort;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.indicators", name = "enabled", havingValue = "true")
public class SqlServerIndicatorDashboardRepository implements IndicatorDashboardPort {

  private static final String DASHBOARD_SQL =
      CYCLE_AND_EXPECTED_COLLABORATORS
          + """
          , assessments AS (
              SELECT a.colaborador_id, a.avaliador_usuario_id, a.tipo_avaliacao, a.situacao,
                     CASE WHEN a.tipo_avaliacao <> 'AUTOAVALIACAO' AND a.situacao = 'PUBLICADA'
                          THEN 1 ELSE 0 END AS feedback_applies,
                     feedback.situacao AS feedback_status,
                     CASE WHEN a.tipo_avaliacao = 'AUTOAVALIACAO' AND EXISTS (
                         SELECT 1
                         FROM dbo.atribuicao_papel AS assignment
                         JOIN dbo.papel AS role ON role.papel_id = assignment.papel_id
                         WHERE assignment.usuario_id = a.avaliador_usuario_id
                           AND role.codigo = 'GESTOR'
                           AND assignment.concedido_em_utc <= a.criada_em_utc
                           AND (assignment.revogado_em_utc IS NULL
                                OR assignment.revogado_em_utc > a.criada_em_utc)
                     ) THEN 1 ELSE 0 END AS manager_self
              FROM cycle_scope AS cycle
              JOIN dbo.avaliacao AS a ON a.ciclo_avaliacao_id = cycle.ciclo_avaliacao_id
              JOIN dbo.versao_avaliacao AS version ON version.avaliacao_id = a.avaliacao_id
                AND version.numero = a.versao_atual_numero
              LEFT JOIN dbo.feedback_avaliacao AS feedback
                ON feedback.versao_avaliacao_id = version.versao_avaliacao_id
          ), counts AS (
              SELECT COUNT(DISTINCT colaborador_id) AS assessed_collaborators,
                     COUNT_BIG(*) AS assessments,
                     COUNT(DISTINCT CASE WHEN tipo_avaliacao = 'GESTOR' THEN colaborador_id END)
                         AS manager_assessed_collaborators,
                     COUNT_BIG(DISTINCT CASE WHEN tipo_avaliacao = 'GESTOR'
                                             THEN avaliador_usuario_id END) AS managers,
                     COUNT(DISTINCT CASE WHEN manager_self = 1 THEN colaborador_id END)
                         AS self_assessed_managers,
                     COUNT_BIG(CASE WHEN manager_self = 1 THEN 1 END) AS manager_self,
                     COUNT_BIG(CASE WHEN situacao = 'PUBLICADA' THEN 1 END) AS finalized,
                     COUNT(DISTINCT CASE WHEN feedback_applies = 1 THEN colaborador_id END)
                         AS feedback_collaborators,
                     COUNT_BIG(CASE WHEN feedback_applies = 1 THEN 1 END) AS feedback_eligible,
                     COUNT_BIG(CASE WHEN feedback_applies = 1 AND feedback_status = 'CONCLUIDO'
                                    THEN 1 END) AS feedback_completed
              FROM assessments
          ), population AS (
          """
          + PUBLISHED_MANAGER_POPULATION_SQL
          + """
              AND EXISTS (SELECT 1 FROM cycle_scope)
          ), historical_allocations AS (
              SELECT p.colaborador_id, p.nota_final, branch.nome AS branch, area.nome AS area
              FROM population AS p
              OUTER APPLY (
                  SELECT CASE WHEN COUNT(DISTINCT allocation.filial_id) = 1
                              THEN MIN(CONVERT(varchar(36), allocation.filial_id)) END AS branch_id,
                         CASE WHEN COUNT(DISTINCT allocation.area_id) = 1
                              THEN MIN(CONVERT(varchar(36), allocation.area_id)) END AS area_id
                  FROM dbo.lotacao_colaborador AS allocation
                  WHERE allocation.colaborador_id = p.colaborador_id
                    AND allocation.inicio_vigencia <= CONVERT(date, p.versao_publicada_em_utc)
                    AND (allocation.fim_vigencia IS NULL
                         OR allocation.fim_vigencia >= CONVERT(date, p.versao_publicada_em_utc))
              ) AS allocation
              LEFT JOIN dbo.filial AS branch ON branch.filial_id = TRY_CONVERT(uniqueidentifier, allocation.branch_id)
              LEFT JOIN dbo.area AS area ON area.area_id = TRY_CONVERT(uniqueidentifier, allocation.area_id)
          ), item_scores AS (
              SELECT p.colaborador_id, competency.competencia_id,
                     AVG(CAST(option_choice.pontos AS decimal(19, 4))) AS score
              FROM population AS p
              JOIN dbo.resposta_avaliacao AS answer ON answer.versao_avaliacao_id = p.versao_avaliacao_id
              JOIN dbo.pergunta_questionario AS question ON question.pergunta_questionario_id = answer.pergunta_questionario_id
              JOIN dbo.questionario_competencia AS applied_item
                ON applied_item.questionario_competencia_id = question.questionario_competencia_id
                AND applied_item.versao_questionario_id = p.versao_questionario_id
              JOIN dbo.versao_competencia AS competency ON competency.versao_competencia_id = applied_item.versao_competencia_id
              JOIN dbo.opcao_resposta AS option_choice ON option_choice.opcao_resposta_id = answer.opcao_resposta_id
                AND option_choice.versao_questionario_id = p.versao_questionario_id
              GROUP BY p.colaborador_id, competency.competencia_id
          )
          SELECT 'COLLABORATORS' AS kind, CAST(NULL AS nvarchar(200)) AS label,
                 COUNT(*) AS collaborators, COUNT_BIG(*) AS total, CAST(0 AS bigint) AS eligible,
                 CAST(NULL AS decimal(38, 6)) AS average_score
          FROM expected
          UNION ALL
          SELECT metric.kind, NULL, metric.collaborators, metric.total, metric.eligible, NULL
          FROM counts CROSS APPLY (VALUES
              ('ASSESSMENTS', assessed_collaborators, assessments, 0),
              ('MANAGERS', manager_assessed_collaborators, managers, 0),
              ('MANAGER_SELF_ASSESSMENTS', self_assessed_managers, manager_self, 0),
              ('FINALIZED', assessed_collaborators, finalized, assessments),
              ('FEEDBACK', feedback_collaborators, feedback_completed, feedback_eligible)
          ) AS metric(kind, collaborators, total, eligible)
          UNION ALL
          SELECT 'AVERAGE', NULL, COUNT(DISTINCT colaborador_id), 0, 0,
                 AVG(CAST(nota_final AS decimal(19, 4)))
          FROM population
          UNION ALL
          SELECT 'BRANCH', COALESCE(branch, N'Sem filial definida'), COUNT(DISTINCT colaborador_id),
                 0, 0, AVG(CAST(nota_final AS decimal(19, 4)))
          FROM historical_allocations GROUP BY branch
          UNION ALL
          SELECT 'AREA', COALESCE(area, N'Sem área definida'), COUNT(DISTINCT colaborador_id),
                 0, 0, AVG(CAST(nota_final AS decimal(19, 4)))
          FROM historical_allocations GROUP BY area
          UNION ALL
          SELECT 'ITEM', MAX(item.nome), COUNT(*), 0, 0, AVG(score)
          FROM item_scores
          JOIN dbo.competencia AS item ON item.competencia_id = item_scores.competencia_id
          GROUP BY item_scores.competencia_id
          """;

  private final JdbcTemplate jdbcTemplate;

  public SqlServerIndicatorDashboardRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public List<IndicatorDashboardAggregate> aggregate(UUID cycleId) {
    return jdbcTemplate.query(
        DASHBOARD_SQL,
        (row, index) ->
            new IndicatorDashboardAggregate(
                Kind.valueOf(row.getString("kind")),
                row.getString("label"),
                row.getInt("collaborators"),
                row.getLong("total"),
                row.getLong("eligible"),
                row.getBigDecimal("average_score")),
        cycleId,
        cycleId);
  }
}

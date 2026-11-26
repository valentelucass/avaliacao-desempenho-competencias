package br.com.avaliacao.desempenho.indicadores.infrastructure.persistence;

import static br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence.EvaluationCyclePopulationSql.CYCLE_AND_EXPECTED_COLLABORATORS;
import static br.com.avaliacao.desempenho.indicadores.infrastructure.persistence.SqlServerIndicatorAggregationRepository.PUBLISHED_MANAGER_POPULATION_SQL;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Kind;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardAggregate.Scope;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardPeriods;
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
          , periods AS (
              SELECT period.slice, period.starts_at, period.cutoff_at
              FROM (VALUES
                  ('CURRENT_MONTH', CAST(? AS datetime2(3)), CAST(? AS datetime2(3))),
                  ('PREVIOUS_MONTH', CAST(? AS datetime2(3)), CAST(? AS datetime2(3)))
              ) AS period(slice, starts_at, cutoff_at)
          ), assessments AS (
              SELECT a.avaliacao_id, a.colaborador_id, a.avaliador_usuario_id, a.tipo_avaliacao,
                     a.versao_atual_numero, a.criada_em_utc,
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
          ), population AS (
          """
          + PUBLISHED_MANAGER_POPULATION_SQL
          + """
              AND EXISTS (SELECT 1 FROM cycle_scope)
          ), cycle_facts AS (
              SELECT e.colaborador_id, CAST(NULL AS uniqueidentifier) AS avaliador_usuario_id,
                     CAST(NULL AS varchar(20)) AS tipo_avaliacao, CAST(NULL AS varchar(16)) AS situacao,
                     1 AS is_expected, 0 AS manager_self, 0 AS feedback_completed,
                     CAST(NULL AS decimal(19, 4)) AS nota_final,
                     CONVERT(date, cycle.reference_at) AS allocation_date
              FROM expected AS e CROSS JOIN cycle_scope AS cycle
              UNION ALL
              SELECT a.colaborador_id, a.avaliador_usuario_id, a.tipo_avaliacao, v.situacao,
                     0, a.manager_self, CASE WHEN f.situacao = 'CONCLUIDO' THEN 1 ELSE 0 END,
                     p.nota_final,
                     CONVERT(date, CASE WHEN v.situacao = 'PUBLICADA' THEN v.criada_em_utc
                                        ELSE a.criada_em_utc END)
              FROM assessments AS a
              JOIN dbo.versao_avaliacao AS v ON v.avaliacao_id = a.avaliacao_id
                AND v.numero = a.versao_atual_numero
              LEFT JOIN dbo.feedback_avaliacao AS f ON f.versao_avaliacao_id = v.versao_avaliacao_id
              LEFT JOIN population AS p ON p.avaliacao_id = a.avaliacao_id
          ), scoped_facts AS (
              SELECT 'CYCLE' AS slice, CAST(NULL AS nvarchar(200)) AS label,
                     colaborador_id, avaliador_usuario_id, tipo_avaliacao, situacao, is_expected,
                     manager_self, feedback_completed, nota_final
              FROM cycle_facts
              UNION ALL
              SELECT 'AREA', COALESCE(area.nome, N'Sem área definida'), fact.colaborador_id,
                     fact.avaliador_usuario_id, fact.tipo_avaliacao, fact.situacao, fact.is_expected,
                     fact.manager_self, fact.feedback_completed, fact.nota_final
              FROM cycle_facts AS fact
              OUTER APPLY (
                  SELECT CASE WHEN COUNT(DISTINCT l.area_id) = 1
                              THEN MIN(CONVERT(varchar(36), l.area_id)) END AS area_id
                  FROM dbo.lotacao_colaborador AS l
                  WHERE l.colaborador_id = fact.colaborador_id
                    AND l.inicio_vigencia <= fact.allocation_date
                    AND (l.fim_vigencia IS NULL OR l.fim_vigencia >= fact.allocation_date)
              ) AS allocation
              LEFT JOIN dbo.area AS area ON area.area_id = TRY_CONVERT(uniqueidentifier, allocation.area_id)
              UNION ALL
              SELECT period.slice, NULL, ass.colaborador_id, NULL, NULL, NULL, 1, 0, 0, NULL
              FROM periods AS period
              CROSS JOIN cycle_scope AS cycle
              JOIN dbo.atribuicao_questionario_colaborador AS ass
                ON ass.ciclo_avaliacao_id = cycle.ciclo_avaliacao_id
              CROSS APPLY (VALUES (CASE WHEN cycle.reference_at < period.cutoff_at
                                        THEN cycle.reference_at ELSE period.cutoff_at END)
              ) AS snapshot(reference_at)
              WHERE ass.atribuido_em_utc <= snapshot.reference_at
                AND (ass.revogado_em_utc IS NULL OR ass.revogado_em_utc > snapshot.reference_at)
              UNION ALL
              SELECT period.slice, NULL, a.colaborador_id, a.avaliador_usuario_id, a.tipo_avaliacao,
                     v.situacao, 0, a.manager_self,
                     CASE WHEN f.concluido_em_utc < period.cutoff_at THEN 1 ELSE 0 END,
                     score.nota_final
              FROM periods AS period
              JOIN assessments AS a ON a.criada_em_utc >= period.starts_at AND a.criada_em_utc < period.cutoff_at
              CROSS APPLY (
                  SELECT TOP (1) historical.versao_avaliacao_id, historical.situacao
                  FROM dbo.versao_avaliacao AS historical
                  WHERE historical.avaliacao_id = a.avaliacao_id
                    AND historical.criada_em_utc < period.cutoff_at
                  ORDER BY historical.numero DESC
              ) AS v
              LEFT JOIN dbo.feedback_avaliacao AS f ON f.versao_avaliacao_id = v.versao_avaliacao_id
              LEFT JOIN dbo.resultado_avaliacao AS score ON score.versao_avaliacao_id = v.versao_avaliacao_id
                AND score.avaliacao_id = a.avaliacao_id AND v.situacao = 'PUBLICADA' AND a.tipo_avaliacao = 'GESTOR'
          ), counts AS (
              SELECT slice, label,
                     COUNT(DISTINCT CASE WHEN is_expected = 1 THEN colaborador_id END) AS expected_collaborators,
                     COUNT(DISTINCT CASE WHEN tipo_avaliacao IS NOT NULL THEN colaborador_id END)
                         AS assessed_collaborators,
                     COUNT_BIG(tipo_avaliacao) AS assessments,
                     COUNT(DISTINCT CASE WHEN tipo_avaliacao = 'GESTOR' THEN colaborador_id END)
                         AS manager_assessed_collaborators,
                     COUNT_BIG(DISTINCT CASE WHEN tipo_avaliacao = 'GESTOR' THEN avaliador_usuario_id END) AS managers,
                     COUNT(DISTINCT CASE WHEN manager_self = 1 THEN colaborador_id END) AS self_assessed_managers,
                     COUNT_BIG(CASE WHEN manager_self = 1 THEN 1 END) AS manager_self,
                     COUNT_BIG(CASE WHEN situacao = 'PUBLICADA' THEN 1 END) AS finalized,
                     COUNT(DISTINCT CASE WHEN applies.feedback = 1 THEN colaborador_id END)
                         AS feedback_collaborators,
                     COUNT_BIG(CASE WHEN applies.feedback = 1 THEN 1 END) AS feedback_eligible,
                     COUNT_BIG(CASE WHEN applies.feedback = 1 AND feedback_completed = 1
                                    THEN 1 END) AS feedback_completed,
                     COUNT(DISTINCT CASE WHEN nota_final IS NOT NULL THEN colaborador_id END) AS scored_collaborators,
                     AVG(CAST(nota_final AS decimal(19, 4))) AS average_score
              FROM scoped_facts
              CROSS APPLY (VALUES (CASE WHEN tipo_avaliacao <> 'AUTOAVALIACAO' AND situacao = 'PUBLICADA'
                                        THEN 1 ELSE 0 END)) AS applies(feedback)
              GROUP BY slice, label
          ), historical_allocations AS (
              SELECT p.colaborador_id, p.nota_final, branch.nome AS branch
              FROM population AS p
              OUTER APPLY (
                  SELECT CASE WHEN COUNT(DISTINCT allocation.filial_id) = 1
                              THEN MIN(CONVERT(varchar(36), allocation.filial_id)) END AS branch_id
                  FROM dbo.lotacao_colaborador AS allocation
                  WHERE allocation.colaborador_id = p.colaborador_id
                    AND allocation.inicio_vigencia <= CONVERT(date, p.versao_publicada_em_utc)
                    AND (allocation.fim_vigencia IS NULL
                         OR allocation.fim_vigencia >= CONVERT(date, p.versao_publicada_em_utc))
              ) AS allocation
              LEFT JOIN dbo.filial AS branch ON branch.filial_id = TRY_CONVERT(uniqueidentifier, allocation.branch_id)
          ), weekly_scores AS (
              SELECT p.colaborador_id, p.nota_final,
                     DATEADD(day, -(DATEDIFF(day, CONVERT(date, '19000101', 112), local.published_on) % 7),
                             local.published_on) AS week_start
              FROM population AS p
              CROSS APPLY (VALUES (CONVERT(date, p.versao_publicada_em_utc
                  AT TIME ZONE 'UTC' AT TIME ZONE 'E. South America Standard Time'))
              ) AS local(published_on)
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
          SELECT slice, metric.kind, label, metric.collaborators, metric.total, metric.eligible,
                 CAST(NULL AS decimal(38, 6)) AS average_score
          FROM counts CROSS APPLY (VALUES
              ('COLLABORATORS', expected_collaborators, expected_collaborators, 0),
              ('ASSESSMENTS', assessed_collaborators, assessments, 0),
              ('MANAGERS', manager_assessed_collaborators, managers, 0),
              ('MANAGER_SELF_ASSESSMENTS', self_assessed_managers, manager_self, 0),
              ('FINALIZED', assessed_collaborators, finalized, assessments),
              ('FEEDBACK', feedback_collaborators, feedback_completed, feedback_eligible)
          ) AS metric(kind, collaborators, total, eligible)
          UNION ALL
          SELECT slice, 'AVERAGE', label, scored_collaborators, 0, 0, average_score
          FROM counts
          UNION ALL
          SELECT 'CYCLE', 'BRANCH', COALESCE(branch, N'Sem filial definida'), COUNT(DISTINCT colaborador_id),
                 0, 0, AVG(CAST(nota_final AS decimal(19, 4)))
          FROM historical_allocations GROUP BY branch
          UNION ALL
          SELECT 'WEEK', 'AVERAGE', CONVERT(varchar(10), week_start, 23), COUNT(DISTINCT colaborador_id),
                 0, 0, AVG(CAST(nota_final AS decimal(19, 4)))
          FROM weekly_scores GROUP BY week_start
          UNION ALL
          SELECT 'CYCLE', 'ITEM', MAX(item.nome), COUNT(*), 0, 0, AVG(score)
          FROM item_scores
          JOIN dbo.competencia AS item ON item.competencia_id = item_scores.competencia_id
          GROUP BY item_scores.competencia_id
          """;

  private final JdbcTemplate jdbcTemplate;

  public SqlServerIndicatorDashboardRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public List<IndicatorDashboardAggregate> aggregate(
      UUID cycleId, IndicatorDashboardPeriods periods) {
    return jdbcTemplate.query(
        DASHBOARD_SQL,
        (row, index) ->
            new IndicatorDashboardAggregate(
                Kind.valueOf(row.getString("kind")),
                row.getString("label"),
                row.getInt("collaborators"),
                row.getLong("total"),
                row.getLong("eligible"),
                row.getBigDecimal("average_score"),
                Scope.valueOf(row.getString("slice"))),
        cycleId,
        periods.current().startUtc(),
        periods.current().cutoffUtc(),
        periods.previous().startUtc(),
        periods.previous().cutoffUtc(),
        cycleId);
  }
}

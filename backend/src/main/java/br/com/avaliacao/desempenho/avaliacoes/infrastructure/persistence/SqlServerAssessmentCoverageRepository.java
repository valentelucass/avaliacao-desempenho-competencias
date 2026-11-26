package br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence;

import static br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence.EvaluationCyclePopulationSql.CYCLE_AND_EXPECTED_COLLABORATORS;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.assessments", name = "enabled", havingValue = "true")
public class SqlServerAssessmentCoverageRepository implements AssessmentCoverageRepository {

  private static final String SELECT_COVERAGE =
      CYCLE_AND_EXPECTED_COLLABORATORS
          + """
          SELECT collaborator.colaborador_id, collaborator.nome_exibicao, started.avaliacao_id
          FROM expected
          CROSS JOIN cycle_scope AS cycle
          JOIN dbo.colaborador AS collaborator ON collaborator.colaborador_id = expected.colaborador_id
          OUTER APPLY (
              SELECT TOP (1) assessment.avaliacao_id
              FROM dbo.avaliacao AS assessment
              WHERE assessment.ciclo_avaliacao_id = cycle.ciclo_avaliacao_id
                AND assessment.colaborador_id = expected.colaborador_id
                AND assessment.tipo_avaliacao IN ('GESTOR', 'DIRETORIA_GERENCIA')
              ORDER BY assessment.atualizada_em_utc DESC, assessment.avaliacao_id DESC
          ) AS started
          WHERE (? IS NULL OR CHARINDEX(?, collaborator.nome_exibicao COLLATE Latin1_General_100_CI_AI) > 0)
            AND CASE WHEN started.avaliacao_id IS NULL THEN 'PENDENTE' ELSE 'INICIADA' END = ?
          ORDER BY collaborator.nome_exibicao, collaborator.colaborador_id
          OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
          """;

  private final JdbcTemplate jdbcTemplate;

  public SqlServerAssessmentCoverageRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public Page list(UUID cycleId, StartStatus status, String name, int page, int limit) {
    List<Entry> rows =
        jdbcTemplate.query(
            SELECT_COVERAGE,
            (row, index) ->
                new Entry(
                    row.getObject("colaborador_id", UUID.class),
                    row.getString("nome_exibicao"),
                    row.getObject("avaliacao_id", UUID.class)),
            cycleId,
            name,
            name,
            status.name(),
            (page - 1L) * limit,
            limit + 1);
    return new Page(
        List.copyOf(rows.subList(0, Math.min(rows.size(), limit))), rows.size() > limit);
  }
}

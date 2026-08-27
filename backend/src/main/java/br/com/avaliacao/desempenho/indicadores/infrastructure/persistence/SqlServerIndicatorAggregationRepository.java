package br.com.avaliacao.desempenho.indicadores.infrastructure.persistence;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorAggregate;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorAggregateCriteria;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorClassification;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorPopulationDimension;
import br.com.avaliacao.desempenho.indicadores.domain.port.IndicatorAggregationPort;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Consulta agregada e parametrizada para o schema da migration V0005.
 *
 * <p>A versão atual deve estar publicada, ser de gestor e ter um resultado imutável. Como V0005 não
 * conserva uma cópia da lotação dentro da avaliação, filtros de filial e área usam apenas uma
 * lotação com vigência conhecida que abranja a criação da versão publicada atual. Essa escolha
 * conservadora exclui lotações sem início de vigência em vez de atribuí-las a uma população
 * ambígua. O filtro de gestor usa o avaliador que efetivamente criou a avaliação.
 */
public final class SqlServerIndicatorAggregationRepository implements IndicatorAggregationPort {

  private static final BigDecimal ZERO = BigDecimal.ZERO;

  private final JdbcTemplate jdbcTemplate;

  public SqlServerIndicatorAggregationRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "JdbcTemplate não pode ser nulo");
  }

  @Override
  public IndicatorAggregate aggregate(IndicatorAggregateCriteria criteria) {
    IndicatorAggregateCriteria requested =
        Objects.requireNonNull(criteria, "critérios não podem ser nulos");
    return switch (requested.metric()) {
      case FINAL_SCORE_AVERAGE -> aggregateAverage(requested, false);
      case COMPETENCY_SCORE_AVERAGE -> aggregateAverage(requested, true);
      case CLASSIFICATION_DISTRIBUTION -> aggregateDistribution(requested);
    };
  }

  private IndicatorAggregate aggregateAverage(
      IndicatorAggregateCriteria criteria, boolean competencyAverage) {
    return jdbcTemplate.query(
        sqlFor(criteria),
        resultSet -> {
          if (!resultSet.next()) {
            return new IndicatorAggregate.AverageScore(0, ZERO);
          }
          int distinctCollaborators = resultSet.getInt("distinct_collaborators");
          BigDecimal averageScore = resultSet.getBigDecimal("average_score");
          return new IndicatorAggregate.AverageScore(
              distinctCollaborators, averageScore == null ? ZERO : averageScore);
        },
        argumentsFor(criteria, competencyAverage));
  }

  private IndicatorAggregate aggregateDistribution(IndicatorAggregateCriteria criteria) {
    return jdbcTemplate.query(
        sqlFor(criteria),
        resultSet -> {
          if (!resultSet.next()) {
            return new IndicatorAggregate.ClassificationDistribution(0, Map.of());
          }
          int distinctCollaborators = resultSet.getInt("distinct_collaborators");
          Map<IndicatorClassification, Integer> counts =
              new EnumMap<>(IndicatorClassification.class);
          do {
            String classification = resultSet.getString("classification");
            if (classification != null) {
              counts.put(
                  toDomainClassification(classification),
                  Math.toIntExact(resultSet.getLong("classification_count")));
            }
          } while (resultSet.next());
          return new IndicatorAggregate.ClassificationDistribution(distinctCollaborators, counts);
        },
        argumentsFor(criteria, false));
  }

  static String sqlFor(IndicatorAggregateCriteria criteria) {
    IndicatorAggregateCriteria requested =
        Objects.requireNonNull(criteria, "critérios não podem ser nulos");
    return switch (requested.metric()) {
      case FINAL_SCORE_AVERAGE -> populationCte(requested) + finalAverageSql();
      case COMPETENCY_SCORE_AVERAGE -> populationCte(requested) + competencyAverageSql();
      case CLASSIFICATION_DISTRIBUTION ->
          populationCte(requested) + classificationDistributionSql();
    };
  }

  static Object[] argumentsFor(IndicatorAggregateCriteria criteria, boolean competencyAverage) {
    IndicatorAggregateCriteria requested =
        Objects.requireNonNull(criteria, "critérios não podem ser nulos");
    List<Object> arguments = new ArrayList<>();
    arguments.add(requested.cycleId());
    if (requested.populationDimension() != IndicatorPopulationDimension.OVERALL) {
      arguments.add(requested.populationId());
    }
    if (competencyAverage) {
      arguments.add(requested.competencyId());
    }
    return arguments.toArray();
  }

  private static String populationCte(IndicatorAggregateCriteria criteria) {
    return """
        WITH population AS (
            SELECT a.avaliacao_id,
                   a.colaborador_id,
                   a.avaliador_usuario_id,
                   va.versao_avaliacao_id,
                   cq.versao_questionario_id,
                   va.criada_em_utc AS versao_publicada_em_utc,
                   resultado.nota_final,
                   resultado.classificacao
            FROM dbo.avaliacao AS a
            INNER JOIN dbo.ciclo_questionario AS cq
                ON cq.ciclo_questionario_id = a.ciclo_questionario_id
               AND cq.ciclo_avaliacao_id = a.ciclo_avaliacao_id
            INNER JOIN dbo.versao_avaliacao AS va
                ON va.avaliacao_id = a.avaliacao_id
               AND va.numero = a.versao_atual_numero
               AND va.situacao = 'PUBLICADA'
            INNER JOIN dbo.resultado_avaliacao AS resultado
                ON resultado.avaliacao_id = a.avaliacao_id
               AND resultado.versao_avaliacao_id = va.versao_avaliacao_id
            WHERE a.ciclo_avaliacao_id = ?
              AND a.tipo_avaliacao = 'GESTOR'
              AND a.situacao = 'PUBLICADA'
        """
        + populationPredicate(criteria)
        + """
            )
        """;
  }

  private static String populationPredicate(IndicatorAggregateCriteria criteria) {
    return switch (criteria.populationDimension()) {
      case OVERALL -> "";
      case MANAGER -> "\n  AND a.avaliador_usuario_id = ?";
      case BRANCH -> historicalAllocationPredicate("filial_id");
      case AREA -> historicalAllocationPredicate("area_id");
    };
  }

  private static String historicalAllocationPredicate(String populationColumn) {
    return """

              AND EXISTS (
                  SELECT 1
                  FROM dbo.lotacao_colaborador AS lotacao
                  WHERE lotacao.colaborador_id = a.colaborador_id
                    AND lotacao.%s = ?
                    AND lotacao.inicio_vigencia IS NOT NULL
                    AND lotacao.inicio_vigencia <= CONVERT(date, va.criada_em_utc)
                    AND (
                        lotacao.fim_vigencia IS NULL
                        OR lotacao.fim_vigencia >= CONVERT(date, va.criada_em_utc)
                    )
              )
        """
        .formatted(populationColumn);
  }

  private static String finalAverageSql() {
    return """
        SELECT COUNT(DISTINCT colaborador_id) AS distinct_collaborators,
               COALESCE(AVG(CAST(nota_final AS decimal(19, 4))), CONVERT(decimal(19, 4), 0))
                   AS average_score
        FROM population
        """;
  }

  private static String competencyAverageSql() {
    return """
        , competency_population AS (
            SELECT population.colaborador_id,
                   AVG(CAST(opcao.pontos AS decimal(19, 4))) AS average_score
            FROM population
            INNER JOIN dbo.resposta_avaliacao AS resposta
                ON resposta.versao_avaliacao_id = population.versao_avaliacao_id
            INNER JOIN dbo.pergunta_questionario AS pergunta
                ON pergunta.pergunta_questionario_id = resposta.pergunta_questionario_id
            INNER JOIN dbo.questionario_competencia AS questionario_competencia
                ON questionario_competencia.questionario_competencia_id = pergunta.questionario_competencia_id
               AND questionario_competencia.versao_questionario_id = population.versao_questionario_id
            INNER JOIN dbo.versao_competencia AS versao_competencia
                ON versao_competencia.versao_competencia_id = questionario_competencia.versao_competencia_id
            INNER JOIN dbo.opcao_resposta AS opcao
                ON opcao.opcao_resposta_id = resposta.opcao_resposta_id
               AND opcao.versao_questionario_id = population.versao_questionario_id
            WHERE versao_competencia.competencia_id = ?
            GROUP BY population.colaborador_id
        )
        SELECT COUNT(*) AS distinct_collaborators,
               COALESCE(AVG(CAST(average_score AS decimal(19, 4))), CONVERT(decimal(19, 4), 0))
                   AS average_score
        FROM competency_population
        """;
  }

  private static String classificationDistributionSql() {
    return """
        , classification_counts AS (
            SELECT classificacao, COUNT_BIG(*) AS classification_count
            FROM population
            GROUP BY classificacao
        ), distinct_population AS (
            SELECT COUNT(DISTINCT colaborador_id) AS distinct_collaborators
            FROM population
        )
        SELECT distinct_population.distinct_collaborators,
               classification_counts.classificacao AS classification,
               classification_counts.classification_count
        FROM distinct_population
        LEFT JOIN classification_counts ON 1 = 1
        """;
  }

  private static IndicatorClassification toDomainClassification(String persistedValue) {
    return switch (persistedValue) {
      case "ABAIXO_ESPERADO" -> IndicatorClassification.BELOW_EXPECTATIONS;
      case "EM_DESENVOLVIMENTO" -> IndicatorClassification.IN_DEVELOPMENT;
      case "DENTRO_EXPECTATIVAS" -> IndicatorClassification.WITHIN_EXPECTATIONS;
      case "SUPERA_EXPECTATIVAS" -> IndicatorClassification.EXCEEDS_EXPECTATIONS;
      case "REFERENCIA" -> IndicatorClassification.REFERENCE;
      default ->
          throw new IllegalStateException("Classificação persistida inválida para indicadores.");
    };
  }
}

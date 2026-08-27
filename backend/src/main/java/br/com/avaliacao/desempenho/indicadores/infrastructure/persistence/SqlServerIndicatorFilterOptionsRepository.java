package br.com.avaliacao.desempenho.indicadores.infrastructure.persistence;

import br.com.avaliacao.desempenho.indicadores.domain.model.GroupedIndicatorPrivacyPolicy;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOption;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOptions;
import br.com.avaliacao.desempenho.indicadores.domain.port.IndicatorFilterOptionsPort;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Opções de filtro derivadas apenas de avaliações de gestor publicadas no ciclo solicitado.
 *
 * <p>Cada lista é suprimida por opção abaixo do mínimo de cinco colaboradores distintos. Assim, a
 * própria lista não pode servir para sondar grupos pequenos antes da consulta agregada.
 */
public final class SqlServerIndicatorFilterOptionsRepository implements IndicatorFilterOptionsPort {

  private static final String PUBLISHED_MANAGER_POPULATION =
      """
      WITH population AS (
          SELECT a.colaborador_id,
                 a.avaliador_usuario_id,
                 cq.versao_questionario_id,
                 va.versao_avaliacao_id,
                 va.criada_em_utc AS versao_publicada_em_utc
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
      )
      """;

  private static final String PRIVACY_THRESHOLD =
      "HAVING COUNT(DISTINCT population.colaborador_id) >= "
          + GroupedIndicatorPrivacyPolicy.MINIMUM_DISTINCT_COLLABORATORS;

  private static final String BRANCHES_SQL =
      PUBLISHED_MANAGER_POPULATION
          + """
            SELECT filial.filial_id AS option_id,
                   filial.nome AS option_label
            FROM population
            INNER JOIN dbo.lotacao_colaborador AS lotacao
                ON lotacao.colaborador_id = population.colaborador_id
               AND lotacao.inicio_vigencia IS NOT NULL
               AND lotacao.inicio_vigencia <= CONVERT(date, population.versao_publicada_em_utc)
               AND (
                    lotacao.fim_vigencia IS NULL
                    OR lotacao.fim_vigencia >= CONVERT(date, population.versao_publicada_em_utc)
               )
            INNER JOIN dbo.filial AS filial ON filial.filial_id = lotacao.filial_id
            GROUP BY filial.filial_id, filial.nome
            """
          + PRIVACY_THRESHOLD
          + "\nORDER BY option_label, option_id";

  private static final String AREAS_SQL =
      PUBLISHED_MANAGER_POPULATION
          + """
            SELECT area.area_id AS option_id,
                   area.nome AS option_label
            FROM population
            INNER JOIN dbo.lotacao_colaborador AS lotacao
                ON lotacao.colaborador_id = population.colaborador_id
               AND lotacao.inicio_vigencia IS NOT NULL
               AND lotacao.inicio_vigencia <= CONVERT(date, population.versao_publicada_em_utc)
               AND (
                    lotacao.fim_vigencia IS NULL
                    OR lotacao.fim_vigencia >= CONVERT(date, population.versao_publicada_em_utc)
               )
            INNER JOIN dbo.area AS area ON area.area_id = lotacao.area_id
            GROUP BY area.area_id, area.nome
            """
          + PRIVACY_THRESHOLD
          + "\nORDER BY option_label, option_id";

  private static final String MANAGERS_SQL =
      PUBLISHED_MANAGER_POPULATION
          + """
            SELECT gestor.usuario_id AS option_id,
                   gestor.nome_exibicao AS option_label
            FROM population
            INNER JOIN dbo.usuario AS gestor ON gestor.usuario_id = population.avaliador_usuario_id
            GROUP BY gestor.usuario_id, gestor.nome_exibicao
            """
          + PRIVACY_THRESHOLD
          + "\nORDER BY option_label, option_id";

  private static final String COMPETENCIES_SQL =
      PUBLISHED_MANAGER_POPULATION
          + """
            SELECT competencia.competencia_id AS option_id,
                   competencia.nome AS option_label
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
            INNER JOIN dbo.competencia AS competencia
                ON competencia.competencia_id = versao_competencia.competencia_id
            GROUP BY competencia.competencia_id, competencia.nome
            """
          + PRIVACY_THRESHOLD
          + "\nORDER BY option_label, option_id";

  private final JdbcTemplate jdbcTemplate;

  public SqlServerIndicatorFilterOptionsRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "JdbcTemplate não pode ser nulo");
  }

  @Override
  public IndicatorFilterOptions findApplicableFor(UUID cycleId) {
    UUID requestedCycleId = Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");
    return new IndicatorFilterOptions(
        query(BRANCHES_SQL, requestedCycleId),
        query(AREAS_SQL, requestedCycleId),
        query(MANAGERS_SQL, requestedCycleId),
        query(COMPETENCIES_SQL, requestedCycleId));
  }

  static String branchesSql() {
    return BRANCHES_SQL;
  }

  static String areasSql() {
    return AREAS_SQL;
  }

  static String managersSql() {
    return MANAGERS_SQL;
  }

  static String competenciesSql() {
    return COMPETENCIES_SQL;
  }

  private List<IndicatorFilterOption> query(String sql, UUID cycleId) {
    return jdbcTemplate.query(
        sql,
        (resultSet, ignoredRowNumber) ->
            new IndicatorFilterOption(
                resultSet.getObject("option_id", UUID.class), resultSet.getString("option_label")),
        cycleId);
  }
}

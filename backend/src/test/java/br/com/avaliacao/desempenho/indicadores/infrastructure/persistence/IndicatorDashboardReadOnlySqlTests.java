package br.com.avaliacao.desempenho.indicadores.infrastructure.persistence;

import static br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.StartStatus.INICIADA;
import static br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.StartStatus.PENDENTE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.Entry;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.Filter;
import br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence.SqlServerAssessmentCoverageRepository;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorAggregate;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorAggregateCriteria;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboard;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardPeriods;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardPolicy;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorMetric;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorPopulationDimension;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Executa as consultas oficiais no SQL Server DEV sobre dados inteiramente sintéticos. */
@EnabledIfSystemProperty(named = "adc.dev.dashboard.sql", matches = "true")
class IndicatorDashboardReadOnlySqlTests {

  private static final UUID OPEN = id(201);
  private static final UUID CLOSED = id(202);
  private static final UUID UNKNOWN = id(999);
  private static final IndicatorDashboardPeriods PERIODS =
      IndicatorDashboardPeriods.at(Instant.parse("2025-07-26T18:00:00Z"));
  private static final String FIXTURE =
      """
      WITH people AS (
          SELECT n, CONVERT(uniqueidentifier, FORMAT(n + 300, '00000000-0000-0000-0000-000000000000')) AS collaborator
          FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19),(20)) AS ids(n)
      ), fixture_ciclo_avaliacao AS (
          SELECT CONVERT(uniqueidentifier, '00000000-0000-0000-0000-000000000201') AS ciclo_avaliacao_id,
                 'ABERTO' AS situacao, CAST(NULL AS datetime2) AS encerrado_em_utc
          UNION ALL SELECT CONVERT(uniqueidentifier, '00000000-0000-0000-0000-000000000202'),
                 'ENCERRADO', CONVERT(datetime2, '2026-01-01')
      ), fixture_colaborador AS (
          SELECT collaborator AS colaborador_id,
                 CASE n WHEN 16 THEN N'Ana de Teste %' WHEN 18 THEN N'Ítalo Unidade B'
                        ELSE N'Pessoa fictícia ' + FORMAT(n,'00') END AS nome_exibicao
          FROM people
      ), fixture_usuario AS (
          SELECT CONVERT(uniqueidentifier, FORMAT(person,'00000000-0000-0000-0000-000000000000'))
                   AS usuario_id, name AS nome_exibicao
          FROM (VALUES (701, N'Marina Gestão'), (702, N'João de Plantão')) AS managers(person, name)
      ), fixture_vinculo_gestor_colaborador AS (
          SELECT link AS vinculo_gestor_colaborador_id, p.collaborator AS colaborador_id,
                 CONVERT(uniqueidentifier, FORMAT(manager,'00000000-0000-0000-0000-000000000000'))
                   AS gestor_usuario_id,
                 CONVERT(date, starts_on) AS inicio_vigencia, CONVERT(date, ends_on) AS fim_vigencia,
                 CONVERT(datetime2, created_at) AS criado_em_utc,
                 CONVERT(datetime2, ended_at) AS revogado_em_utc
          FROM (VALUES
              (1,16,702,'2025-01-01','2025-12-31','2025-01-01','2026-01-01T00:30:00'),
              (2,16,701,NULL,NULL,'2026-01-01T03:10:00',NULL),
              (3,18,701,'2099-01-01',NULL,'2025-06-01',NULL),
              (4,1,701,NULL,NULL,'2025-01-01',NULL),
              (5,14,701,NULL,NULL,'2025-01-01',NULL),
              (6,17,701,NULL,NULL,'2025-01-01',NULL)
          ) AS links(link, person, manager, starts_on, ends_on, created_at, ended_at)
          JOIN people AS p ON p.n = links.person
      ), fixture_atribuicao_questionario_colaborador AS (
          SELECT cycle.ciclo_avaliacao_id, p.collaborator AS colaborador_id,
                 CONVERT(datetime2, CASE WHEN n=20 THEN '2099-01-01'
                        WHEN n=18 AND cycle.situacao='ABERTO' THEN '2025-07-02'
                        ELSE '2025-03-01' END) AS atribuido_em_utc,
                 CASE WHEN n=19 THEN CONVERT(datetime2,'2025-04-01')
                      WHEN cycle.situacao='ENCERRADO' AND n=16 THEN CONVERT(datetime2,'2026-02-01') END AS revogado_em_utc
          FROM fixture_ciclo_avaliacao AS cycle CROSS JOIN people AS p
          WHERE cycle.situacao='ABERTO' OR n IN (16,18)
          UNION ALL SELECT cycle.ciclo_avaliacao_id, p.collaborator,
                 CONVERT(datetime2,'2025-01-01'), CONVERT(datetime2,'2025-02-01')
          FROM fixture_ciclo_avaliacao AS cycle CROSS JOIN people AS p
          WHERE cycle.situacao='ABERTO' AND p.n=16
      ), review_seed AS (
          SELECT n, n AS assessment, 'GESTOR' AS kind,
                 CASE WHEN n=14 THEN 'RASCUNHO' WHEN n=15 THEN 'ENVIADA' ELSE 'PUBLICADA' END AS status,
                 CASE WHEN n<=7 THEN 101 ELSE 102 END AS author,
                 'ABERTO' AS cycle_status
          FROM people WHERE n<=15
          UNION ALL SELECT n, n+100, 'AUTOAVALIACAO',
                 CASE WHEN n<=2 THEN 'PUBLICADA' ELSE 'RASCUNHO' END,
                 n+110, 'ABERTO'
          FROM people WHERE n<=5 OR n=16
          UNION ALL SELECT 17, 117, 'DIRETORIA_GERENCIA', 'PUBLICADA', 150, 'ABERTO'
          UNION ALL SELECT 18, 118, 'GESTOR', 'PUBLICADA', 101, 'ENCERRADO'
      ), fixture_avaliacao AS (
          SELECT s.*, CONVERT(uniqueidentifier, FORMAT(s.assessment+500,'00000000-0000-0000-0000-000000000000')) AS avaliacao_id,
                 cycle.ciclo_avaliacao_id, p.collaborator AS colaborador_id, s.kind AS tipo_avaliacao,
                 s.status AS situacao, CONVERT(uniqueidentifier,
                   FORMAT(s.author,'00000000-0000-0000-0000-000000000000')) AS avaliador_usuario_id,
                 1 AS ciclo_questionario_id,
                 CASE WHEN s.n=15 THEN 2 ELSE 1 END AS versao_atual_numero,
                 CONVERT(datetime2, CASE WHEN s.n BETWEEN 7 AND 13 AND s.kind='GESTOR'
                                        THEN '2025-07-02' ELSE '2025-06-01T03:10:00' END) AS criada_em_utc,
                 CONVERT(datetime2,'2025-07-01') AS atualizada_em_utc
          FROM review_seed AS s
          JOIN people AS p ON p.n=s.n
          JOIN fixture_ciclo_avaliacao AS cycle ON cycle.situacao=s.cycle_status
      ), fixture_ciclo_questionario AS (
          SELECT 1 AS ciclo_questionario_id, 1 AS versao_questionario_id, ciclo_avaliacao_id
          FROM fixture_ciclo_avaliacao
      ), fixture_versao_avaliacao AS (
          SELECT assessment AS versao_avaliacao_id, avaliacao_id, versao_atual_numero AS numero,
                 situacao,
                 CONVERT(datetime2, CASE WHEN cycle_status='ENCERRADO' OR n=15 THEN '2025-07-01'
                        WHEN n=13 THEN '2025-07-14T03:10:00'
                        WHEN n BETWEEN 7 AND 12 AND kind='GESTOR' THEN '2025-07-07T03:10:00'
                        ELSE '2025-06-10' END) AS criada_em_utc
          FROM fixture_avaliacao
          UNION ALL SELECT 315, avaliacao_id, 1, 'PUBLICADA', CONVERT(datetime2,'2025-06-01T03:11:00')
          FROM fixture_avaliacao WHERE assessment=15
      ), fixture_resultado_avaliacao AS (
          SELECT avaliacao_id, assessment AS versao_avaliacao_id, 'DENTRO_EXPECTATIVAS' AS classificacao,
                 CASE WHEN n<=6 THEN 120 WHEN n<=12 THEN 90 WHEN n=13 THEN 100 ELSE 80 END AS nota_final
          FROM fixture_avaliacao WHERE situacao='PUBLICADA'
          UNION ALL SELECT avaliacao_id, 315, 'REFERENCIA', 120
          FROM fixture_avaliacao WHERE assessment=15
      ), fixture_feedback_avaliacao AS (
          SELECT assessment AS versao_avaliacao_id, 'CONCLUIDO' AS situacao,
                 CONVERT(datetime2, CASE WHEN assessment=6 THEN '2025-06-27'
                        WHEN assessment=7 THEN '2025-07-20' ELSE '2025-06-18' END) AS concluido_em_utc
          FROM fixture_avaliacao
          WHERE assessment<=7 OR assessment IN (101,117)
          UNION ALL SELECT 315, 'CONCLUIDO', CONVERT(datetime2,'2025-06-18')
      ), fixture_papel AS (
          SELECT 1 AS papel_id, 'GESTOR' AS codigo
      ), fixture_atribuicao_papel AS (
          SELECT CONVERT(uniqueidentifier, FORMAT(110+n,'00000000-0000-0000-0000-000000000000'))
                 AS usuario_id, 1 AS papel_id,
                 CONVERT(datetime2, CASE WHEN n=16 THEN '2025-06-02' ELSE '2025-01-01' END) AS concedido_em_utc,
                 CASE WHEN n=5 THEN CONVERT(datetime2,'2025-06-02') END AS revogado_em_utc
          FROM people WHERE n<=5 OR n=16
      ), fixture_filial AS (
          SELECT CONVERT(uniqueidentifier, '00000000-0000-0000-0000-000000000601') AS filial_id, N'Matriz de teste' AS nome
          UNION ALL SELECT CONVERT(uniqueidentifier, '00000000-0000-0000-0000-000000000602'), N'Filial Sul'
      ), fixture_area AS (
          SELECT CONVERT(uniqueidentifier, '00000000-0000-0000-0000-000000000603') AS area_id, N'Operações' AS nome
          UNION ALL SELECT CONVERT(uniqueidentifier, '00000000-0000-0000-0000-000000000604'), N'Apoio'
      ), fixture_lotacao_colaborador AS (
          SELECT p.collaborator AS colaborador_id, branch.filial_id, area.area_id,
                 CONVERT(date,'2025-05-01') AS inicio_vigencia, CAST(NULL AS date) AS fim_vigencia
          FROM people AS p
          JOIN fixture_filial AS branch ON branch.nome = CASE WHEN p.n<=6 THEN N'Matriz de teste' ELSE N'Filial Sul' END
          JOIN fixture_area AS area ON area.nome = CASE WHEN p.n<=7 THEN N'Operações' ELSE N'Apoio' END
          UNION ALL SELECT p.collaborator, branch.filial_id, area.area_id, CONVERT(date,'2025-02-01'),
                 CASE WHEN p.n=8 THEN CONVERT(date,'2025-04-30') END
          FROM people AS p CROSS JOIN fixture_filial AS branch CROSS JOIN fixture_area AS area
          WHERE p.n IN (8,13) AND branch.nome=N'Matriz de teste'
            AND area.nome=CASE WHEN p.n=8 THEN N'Operações' ELSE N'Apoio' END
      ), fixture_resposta_avaliacao AS (
          SELECT n AS versao_avaliacao_id, 1 AS pergunta_questionario_id,
                 CASE WHEN n<=6 THEN 120 ELSE 90 END AS opcao_resposta_id
          FROM people WHERE n<=12
          UNION ALL SELECT n, 2, 100 FROM people WHERE n<=6
          UNION ALL SELECT n, 3, 120 FROM people WHERE n<=5
          UNION ALL SELECT n, 4, 120 FROM people WHERE n BETWEEN 10 AND 12
      ), fixture_pergunta_questionario AS (
          SELECT n AS pergunta_questionario_id,
                 CASE WHEN n<=2 THEN 1 WHEN n=3 THEN 2 ELSE 3 END AS questionario_competencia_id
          FROM people WHERE n<=4
      ), fixture_questionario_competencia AS (
          SELECT n AS questionario_competencia_id, n AS versao_competencia_id, 1 AS versao_questionario_id
          FROM people WHERE n<=3
      ), fixture_versao_competencia AS (
          SELECT n AS versao_competencia_id, n AS competencia_id FROM people WHERE n<=3
      ), fixture_competencia AS (
          SELECT n AS competencia_id,
                 CASE n WHEN 1 THEN N'Comunicação' WHEN 2 THEN N'Qualidade' ELSE N'Grupo pequeno' END AS nome
          FROM people WHERE n<=3
      ), fixture_opcao_resposta AS (
          SELECT points AS opcao_resposta_id, points AS pontos, 1 AS versao_questionario_id
          FROM (VALUES (90),(100),(120)) AS scale(points)
      ),
      """;

  @Test
  void crossChecksAllSevenMetricsAndThreeChartsWithIndependentTotals() {
    JdbcTemplate jdbc = fixtureJdbc();
    var repository = new SqlServerIndicatorDashboardRepository(jdbc);
    var dashboard =
        new IndicatorDashboardPolicy().publish(repository.aggregate(OPEN, PERIODS), PERIODS);
    // 15 gestor + 6 auto + 1 Diretoria. Das 22, 13 gestor, 2 auto e 1 Diretoria são publicadas.
    // Feedback: 7 gestor + 1 Diretoria concluídos em 14 avaliações elegíveis.
    assertThat(dashboard.metrics())
        .isEqualTo(
            new IndicatorDashboard.Metrics(
                18L, 22L, 2L, 5L, decimal("87.2"), decimal("72.7"), decimal("57.1")));
    assertThat(dashboard.byBranch())
        .containsExactly(new IndicatorDashboard.Point("Matriz de teste", decimal("100.0")));
    assertThat(dashboard.byArea())
        .containsExactly(
            new IndicatorDashboard.Point("Operações", decimal("96.4")),
            new IndicatorDashboard.Point("Apoio", decimal("76.4")));
    assertThat(dashboard.byItem())
        .containsExactly(
            new IndicatorDashboard.Point("Qualidade", decimal("100.0")),
            new IndicatorDashboard.Point("Comunicação", decimal("83.3")));
    // Junho tem 15 avaliações e 10 publicadas até o dia 26. Julho tem 7, todas publicadas.
    // Em junho o feedback de 6 foi registrado depois do corte; em julho, só o de 7 foi feito.
    assertThat(dashboard.comparison().changes())
        .isEqualTo(
            new IndicatorDashboard.Changes(
                decimal("5.9"),
                decimal("-53.3"),
                decimal("0.0"),
                null,
                decimal("-23.8"),
                decimal("33.3"),
                decimal("-73.2")));
    assertThat(dashboard.areaSummary())
        .containsExactly(
            new IndicatorDashboard.AreaSummary(
                "Apoio", 11L, 10L, decimal("76.4"), decimal("70.0"), decimal("14.3")),
            new IndicatorDashboard.AreaSummary(
                "Operações", 7L, 12L, decimal("96.4"), decimal("75.0"), decimal("100.0")));
    // A semana com uma pessoa e a primeira das duas semanas de 6 ficam protegidas.
    assertThat(dashboard.evolution())
        .containsExactly(
            new IndicatorDashboard.WeekAverage(LocalDate.parse("2025-07-07"), decimal("75.0")));

    var previous =
        (IndicatorAggregate.AverageScore)
            new SqlServerIndicatorAggregationRepository(jdbc)
                .aggregate(
                    new IndicatorAggregateCriteria(
                        OPEN,
                        IndicatorMetric.FINAL_SCORE_AVERAGE,
                        IndicatorPopulationDimension.OVERALL,
                        null,
                        null));
    assertThat(previous.distinctCollaborators()).isEqualTo(13);
    assertThat(previous.averageScore()).isEqualByComparingTo("104.615384");
    assertThat(
            new IndicatorDashboardPolicy()
                .publish(repository.aggregate(CLOSED, PERIODS), PERIODS)
                .hasData())
        .isFalse();
  }

  @Test
  void findsUnstartedAcrossPagesAndIgnoresSelfAssessmentsAndOtherCycles() {
    var coverage = new SqlServerAssessmentCoverageRepository(fixtureJdbc());
    var pending = new Filter(OPEN, PENDENTE, null, null);
    var first = coverage.list(pending, 1, 1);
    var second = coverage.list(pending, 2, 1);
    assertThat(first.items())
        .containsExactly(new Entry(id(316), "Ana de Teste %", "Marina Gestão", null));
    assertThat(first.hasNextPage()).isTrue();
    assertThat(second.items()).containsExactly(new Entry(id(318), "Ítalo Unidade B", null, null));
    assertThat(second.hasNextPage()).isFalse();
    assertThat(coverage.list(new Filter(OPEN, PENDENTE, "italo", null), 1, 12).items())
        .containsExactlyElementsOf(second.items());
    assertThat(coverage.list(new Filter(OPEN, PENDENTE, "%", null), 1, 12).items())
        .containsExactlyElementsOf(first.items());

    var started = coverage.list(new Filter(OPEN, INICIADA, null, null), 1, 25);
    assertThat(started.items()).hasSize(16);
    assertThat(started.items()).extracting(Entry::collaboratorId).contains(id(314), id(317));
    assertThat(started.items()).extracting(Entry::assessmentId).doesNotContainNull();
    assertThat(coverage.list(new Filter(CLOSED, PENDENTE, null, null), 1, 12).items())
        .containsExactly(new Entry(id(316), "Ana de Teste %", "João de Plantão", null));
    assertThat(coverage.list(new Filter(CLOSED, INICIADA, null, null), 1, 12).items())
        .extracting(Entry::collaboratorId)
        .containsExactly(id(318));
  }

  @Test
  void usesTheSameFiltersForListAndExcelBeyondTheVisiblePage() {
    var coverage = new SqlServerAssessmentCoverageRepository(fixtureJdbc());
    var filter = new Filter(OPEN, INICIADA, null, "marina gestao");
    assertThat(coverage.list(filter, 1, 1).hasNextPage()).isTrue();
    assertThat(coverage.listForExport(filter, 50_001))
        .extracting(Entry::collaboratorId)
        .containsExactly(id(301), id(314), id(317));
    assertThat(coverage.listForExport(new Filter(OPEN, PENDENTE, "%", "GESTAO"), 50_001))
        .containsExactly(new Entry(id(316), "Ana de Teste %", "Marina Gestão", null));
    assertThat(coverage.listForExport(new Filter(OPEN, INICIADA, null, "marina%"), 50_001))
        .isEmpty();
    assertThat(coverage.listForExport(new Filter(CLOSED, PENDENTE, null, "plantao"), 50_001))
        .containsExactly(new Entry(id(316), "Ana de Teste %", "João de Plantão", null));
  }

  @Test
  void validatesQueriesAgainstTheActualDevSchemaWithoutLoadingAnAssessment() {
    JdbcTemplate jdbc = devJdbc();
    var dashboard =
        new IndicatorDashboardPolicy()
            .publish(
                new SqlServerIndicatorDashboardRepository(jdbc).aggregate(UNKNOWN, PERIODS),
                PERIODS);
    assertThat(dashboard.hasData()).isFalse();
    assertThat(
            new SqlServerAssessmentCoverageRepository(jdbc)
                .list(new Filter(UNKNOWN, PENDENTE, null, null), 1, 12)
                .items())
        .isEmpty();
  }

  private static BigDecimal decimal(String value) {
    return new BigDecimal(value);
  }

  private static UUID id(int number) {
    return UUID.fromString("00000000-0000-0000-0000-%012d".formatted(number));
  }

  private static JdbcTemplate devJdbc() {
    String url = System.getenv("ADC_DASHBOARD_TEST_JDBC_URL");
    assertThat(url)
        .startsWith("jdbc:sqlserver://127.0.0.1:1433;")
        .contains(";databaseName=AVALIACAO_DEV;")
        .contains(";integratedSecurity=true;");
    var jdbc = new JdbcTemplate(new DriverManagerDataSource(url));
    jdbc.setQueryTimeout(15);
    assertThat(jdbc.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    return jdbc;
  }

  private static JdbcTemplate fixtureJdbc() {
    JdbcTemplate dev = devJdbc();
    return mock(
        JdbcTemplate.class,
        invocation -> {
          Object[] args = invocation.getRawArguments();
          if (!invocation.getMethod().getName().equals("query") || args.length != 3) {
            throw new AssertionError("Consulta inesperada no cenário SQL");
          }
          String query = (String) args[0];
          assertThat(query).startsWith("WITH ");
          String synthetic =
              FIXTURE + query.substring("WITH ".length()).replace("dbo.", "fixture_");
          if (args[1] instanceof RowMapper<?> mapper) {
            return dev.query(synthetic, mapper, (Object[]) args[2]);
          }
          return dev.query(synthetic, (ResultSetExtractor<?>) args[1], (Object[]) args[2]);
        });
  }
}

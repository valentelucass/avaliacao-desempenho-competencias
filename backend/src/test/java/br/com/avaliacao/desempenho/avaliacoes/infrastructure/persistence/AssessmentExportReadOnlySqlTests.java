package br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.avaliacoes.application.*;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.*;
import br.com.avaliacao.desempenho.avaliacoes.infrastructure.files.AssessmentXlsxWriter;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.*;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** SQL Server real sobre CTEs sintéticas somente leitura; não lê avaliações persistidas. */
@EnabledIfSystemProperty(named = "adc.dev.export.sql", matches = "true")
class AssessmentExportReadOnlySqlTests {
  private static UUID id(int number) {
    return UUID.fromString("00000000-0000-0000-0000-%012d".formatted(number));
  }

  private static final String FIXTURE =
      """

      WITH ids AS (
        SELECT n, CONVERT(uniqueidentifier, '00000000-0000-0000-0000-' + RIGHT('000000000000' + CONVERT(varchar(12), n), 12)) AS id
        FROM (VALUES (1),(2),(3),(4),(5),(6),(7)) AS numbers(n)
      ), fixture_usuario AS (
        SELECT CONVERT(uniqueidentifier, id) AS usuario_id, nome_exibicao, situacao
        FROM (VALUES ('00000000-0000-0000-0000-000000000101', N'João Gestor', 'ATIVO'),
                     ('00000000-0000-0000-0000-000000000102', N'Outro Gestor', 'ATIVO')) AS users(id,nome_exibicao,situacao)
      ), fixture_ciclo_avaliacao AS (
        SELECT CONVERT(uniqueidentifier, '00000000-0000-0000-0000-000000000201') AS ciclo_avaliacao_id, N'Ciclo fictício' AS nome
      ), fixture_colaborador AS (
        SELECT CONVERT(uniqueidentifier, id) AS colaborador_id, nome_exibicao FROM (VALUES
          ('00000000-0000-0000-0000-000000000301', N'Ana São'),
          ('00000000-0000-0000-0000-000000000302', N'Bia %_[]')) AS people(id,nome_exibicao)
      ), fixture_avaliacao AS (
        SELECT ids.id AS avaliacao_id, cycle.ciclo_avaliacao_id,
          CONVERT(uniqueidentifier, CASE WHEN n=2 THEN '00000000-0000-0000-0000-000000000302' ELSE '00000000-0000-0000-0000-000000000301' END) AS colaborador_id,
          CONVERT(uniqueidentifier, CASE WHEN n=4 THEN '00000000-0000-0000-0000-000000000102' ELSE '00000000-0000-0000-0000-000000000101' END) AS avaliador_usuario_id,
          CASE WHEN n=3 THEN 'ENVIADA' WHEN n=4 THEN 'RASCUNHO' ELSE 'PUBLICADA' END AS situacao,
          CASE WHEN n=5 THEN 'AUTOAVALIACAO' WHEN n=6 THEN 'DIRETORIA_GERENCIA' ELSE 'GESTOR' END AS tipo_avaliacao,
          n AS vinculo_gestor_colaborador_id, n AS vinculo_usuario_colaborador_id, n AS vinculo_diretoria_gerencia_id,
          1 AS versao_atual_numero, CONVERT(datetime2, '2026-01-01T12:00:00') AS atualizada_em_utc
        FROM ids CROSS JOIN fixture_ciclo_avaliacao AS cycle
      ), fixture_versao_avaliacao AS (
        SELECT id AS versao_avaliacao_id, id AS avaliacao_id, 1 AS numero, CAST(1 AS binary(8)) AS row_version FROM ids
      ), fixture_feedback_avaliacao AS (
        SELECT id AS versao_avaliacao_id, 'CONCLUIDO' AS situacao FROM ids WHERE n=2
      ), fixture_vinculo_gestor_colaborador AS (
        SELECT vinculo_gestor_colaborador_id, avaliador_usuario_id AS gestor_usuario_id, colaborador_id,
          CASE WHEN vinculo_gestor_colaborador_id=7 THEN CONVERT(datetime2,'2026-01-01') END AS revogado_em_utc,
          CAST(NULL AS date) AS inicio_vigencia, CAST(NULL AS date) AS fim_vigencia FROM fixture_avaliacao
      ), fixture_vinculo_diretoria_gerencia AS (
        SELECT vinculo_diretoria_gerencia_id, avaliador_usuario_id AS diretoria_usuario_id, colaborador_id AS gerencia_colaborador_id,
          CAST(NULL AS datetime2) AS revogado_em_utc, CAST(NULL AS date) AS inicio_vigencia, CAST(NULL AS date) AS fim_vigencia FROM fixture_avaliacao
      ), fixture_vinculo_usuario_colaborador AS (
        SELECT vinculo_usuario_colaborador_id, avaliador_usuario_id AS usuario_id, colaborador_id,
          CAST(NULL AS datetime2) AS encerrado_em_utc, CONVERT(date,'2020-01-01') AS inicio_vigencia, CAST(NULL AS date) AS fim_vigencia FROM fixture_avaliacao
      )

      """;

  private static SqlServerAssessmentRepository repository() {
    String url = Objects.requireNonNull(System.getenv("ADC_TEST_JDBC_URL"));
    assertThat(url)
        .contains("databaseName=AVALIACAO_DEV")
        .doesNotContain("trustServerCertificate=true");
    var source =
        new DriverManagerDataSource(
            url, System.getenv("ADC_TEST_SQL_USER"), System.getenv("ADC_TEST_SQL_PASSWORD"));
    var reader = new JdbcTemplate(source);
    reader.setQueryTimeout(15);
    assertThat(reader.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    var fixtureJdbc =
        mock(
            JdbcTemplate.class,
            call -> {
              Object[] args = call.getRawArguments();
              assertThat(call.getMethod().getName()).isIn("query", "queryForObject");
              String sql = (String) args[0];
              assertThat(sql.stripLeading()).startsWith("SELECT");
              sql = FIXTURE + sql.replace("dbo.", "fixture_");
              if (call.getMethod().getName().equals("queryForObject"))
                return reader.queryForObject(sql, (RowMapper<?>) args[1], (Object[]) args[2]);
              if (args[1] instanceof RowMapper<?> mapper)
                return reader.query(sql, mapper, (Object[]) args[2]);
              return reader.query(sql, (ResultSetExtractor<?>) args[1], (Object[]) args[2]);
            });
    return new SqlServerAssessmentRepository(fixtureJdbc, mock(TransactionTemplate.class));
  }

  private static AssessmentAccessContext rh() {
    return new AssessmentAccessContext(
        id(101), Set.of("AVALIACOES.VISUALIZAR_TODAS", "DADOS.EXPORTAR"), Set.of("GERENCIA_RH"));
  }

  @Test
  void exportsBeyondTheVisualPageWithMatchingCurrentStatusesAndRealManagerNames() throws Exception {
    var repository = repository();
    var page =
        repository.listAccessible(rh(), AssessmentRepository.AssessmentListFilter.none(), 1, null);
    var rows =
        repository.listForExport(rh(), AssessmentRepository.AssessmentListFilter.none(), 50_001);
    assertThat(page.items()).hasSize(1);
    assertThat(rows).hasSize(7);
    assertThat(rows)
        .anyMatch(
            row ->
                row.managerName() == null && row.feedbackStatus() == FeedbackStatus.NAO_APLICAVEL);
    assertThat(rows)
        .anyMatch(
            row ->
                row.assessmentStatus() == AssessmentStatus.RASCUNHO
                    && row.feedbackStatus() == FeedbackStatus.NAO_APLICAVEL);
    assertThat(rows).anyMatch(row -> row.feedbackStatus() == FeedbackStatus.CONCLUIDO);
    assertThat(rows).anyMatch(row -> "João Gestor".equals(row.managerName()));
    var file =
        Paths.get(
            System.getProperty("adc.build.directory", "target"),
            "assessment-export-sql-example.xlsx");
    Files.createDirectories(file.getParent());
    Files.write(file, new AssessmentXlsxWriter().write(rows));
  }

  @Test
  void allSixFiltersAreAppliedBeforeExportAndNamesAreLiteralAndAccentInsensitive() {
    var repository = repository();
    var filter =
        new AssessmentRepository.AssessmentListFilter(
            id(201),
            id(301),
            "ana sao",
            "JOAO",
            AssessmentStatus.PUBLICADA,
            FeedbackStatus.PENDENTE);
    var filteredRows = repository.listForExport(rh(), filter, 50_001);
    assertThat(filteredRows).hasSize(3);
    try {
      var file =
          Paths.get(
              System.getProperty("adc.build.directory", "target"),
              "assessment-export-sql-filtered.xlsx");
      Files.createDirectories(file.getParent());
      Files.write(file, new AssessmentXlsxWriter().write(filteredRows));
    } catch (java.io.IOException exception) {
      throw new java.io.UncheckedIOException(exception);
    }
    assertThat(
            repository.listForExport(
                rh(),
                new AssessmentRepository.AssessmentListFilter(
                    null, null, "%_[]", null, null, FeedbackStatus.CONCLUIDO),
                50_001))
        .hasSize(1);
    assertThat(
            repository.listForExport(
                rh(),
                new AssessmentRepository.AssessmentListFilter(
                    null, null, "does not exist", null, null, null),
                50_001))
        .isEmpty();
    assertThat(
            repository.listForExport(
                rh(),
                new AssessmentRepository.AssessmentListFilter(
                    id(999), null, null, null, null, null),
                50_001))
        .isEmpty();
  }

  @Test
  void deniesInactiveActorsAndTechnicalRolesAndMissingExportPermission() {
    var repository = repository();
    var grants = Set.of("AVALIACOES.VISUALIZAR_TODAS", "DADOS.EXPORTAR");
    for (var actor :
        List.of(
            new AssessmentAccessContext(id(999), grants, Set.of("GERENCIA_RH")),
            new AssessmentAccessContext(id(101), grants, Set.of("ADMINISTRADOR_PLATAFORMA")),
            new AssessmentAccessContext(
                id(101), Set.of("AVALIACOES.VISUALIZAR_TODAS"), Set.of("GERENCIA_RH")))) {
      assertThatThrownBy(
              () ->
                  repository.listForExport(
                      actor, AssessmentRepository.AssessmentListFilter.none(), 50_001))
          .isInstanceOf(AssessmentForbiddenException.class);
    }
  }
}

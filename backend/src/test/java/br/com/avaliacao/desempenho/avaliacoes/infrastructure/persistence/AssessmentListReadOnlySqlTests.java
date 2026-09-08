package br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository.AssessmentListFilter;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository.AssessmentSummaryView;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Executa o SQL e bindings reais apenas sobre CTEs fictícias; sem DDL/DML ou leitura de pessoas.
 */
@EnabledIfSystemProperty(named = "adc.dev.sql.readonly", matches = "true")
class AssessmentListReadOnlySqlTests {
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
    var source = new DriverManagerDataSource();
    source.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    source.setUrl(
        "jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;trustServerCertificate=true;integratedSecurity=true;authenticationScheme=NativeAuthentication");
    var reader = new JdbcTemplate(source);
    reader.setQueryTimeout(15);
    var fixtureJdbc =
        mock(
            JdbcTemplate.class,
            call -> {
              Object[] args = call.getRawArguments();
              assertThat(call.getMethod().getName()).isEqualTo("query");
              String sql = (String) args[0];
              assertThat(sql.stripLeading()).startsWith("SELECT");
              // Substituição restrita a identificadores internos fixos. Nenhuma tabela real é
              // consultada.
              sql = FIXTURE + sql.replace("dbo.", "fixture_");
              if (args[1] instanceof RowMapper<?> mapper)
                return reader.query(sql, mapper, (Object[]) args[2]);
              return reader.query(sql, (ResultSetExtractor<?>) args[1], (Object[]) args[2]);
            });
    return new SqlServerAssessmentRepository(fixtureJdbc, mock(TransactionTemplate.class));
  }

  @Test
  void executesAllFiltersBeforePaginationWithAccentInsensitiveLiteralNames() {
    var repository = repository();
    var rh = new AssessmentAccessContext(id(101), Set.of("AVALIACOES.VISUALIZAR_TODAS"));
    var filter =
        new AssessmentListFilter(
            id(201),
            id(301),
            "ana sao",
            "JOAO",
            AssessmentStatus.PUBLICADA,
            FeedbackStatus.PENDENTE);
    var first = repository.listAccessible(rh, filter, 1, null);
    assertThat(first.items()).extracting(AssessmentSummaryView::id).containsExactly(id(7));
    assertThat(first.nextCursor()).isNotNull();
    var second = repository.listAccessible(rh, filter, 1, first.nextCursor());
    assertThat(second.items()).extracting(AssessmentSummaryView::id).containsExactly(id(6));
    var third = repository.listAccessible(rh, filter, 1, second.nextCursor());
    assertThat(third.items()).extracting(AssessmentSummaryView::id).containsExactly(id(1));
    assertThat(third.nextCursor()).isNull();
    assertThat(
            repository
                .listAccessible(
                    rh,
                    new AssessmentListFilter(
                        null, null, "%_[]", null, null, FeedbackStatus.CONCLUIDO),
                    12,
                    null)
                .items())
        .extracting(AssessmentSummaryView::id)
        .containsExactly(id(2));
    assertThat(
            repository
                .listAccessible(
                    rh,
                    new AssessmentListFilter(null, null, "' OR 1=1 --", null, null, null),
                    12,
                    null)
                .items())
        .isEmpty();
  }

  @Test
  void keepsOwnScopeRevokedLinksSelfAssessmentAndFeedbackSemantics() {
    var repository = repository();
    var own =
        new AssessmentAccessContext(
            id(101),
            Set.of(
                "AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS", "AUTOAVALIACOES.VISUALIZAR_PROPRIA"));
    assertThat(repository.listAccessible(own, AssessmentListFilter.none(), 12, null).items())
        .extracting(AssessmentSummaryView::id)
        .containsExactly(id(5), id(3), id(2), id(1));
    assertThat(
            repository
                .listAccessible(
                    own, new AssessmentListFilter(null, null, null, "Outro", null, null), 12, null)
                .items())
        .isEmpty();
    assertThat(
            repository
                .listAccessible(
                    own,
                    new AssessmentListFilter(
                        null, null, null, null, null, FeedbackStatus.NAO_APLICAVEL),
                    12,
                    null)
                .items())
        .extracting(AssessmentSummaryView::id)
        .containsExactly(id(5), id(3));
    assertThat(
            repository
                .listAccessible(
                    own,
                    new AssessmentListFilter(
                        null, null, null, "João", null, FeedbackStatus.NAO_APLICAVEL),
                    12,
                    null)
                .items())
        .extracting(AssessmentSummaryView::id)
        .containsExactly(id(3));
    assertThat(
            repository
                .listAccessible(
                    new AssessmentAccessContext(id(101), Set.of()),
                    AssessmentListFilter.none(),
                    12,
                    null)
                .items())
        .isEmpty();
    assertThat(
            repository
                .listAccessible(
                    new AssessmentAccessContext(id(999), Set.of("AVALIACOES.VISUALIZAR_TODAS")),
                    AssessmentListFilter.none(),
                    12,
                    null)
                .items())
        .isEmpty();
    var rh = new AssessmentAccessContext(id(101), Set.of("AVALIACOES.VISUALIZAR_TODAS"));
    for (AssessmentStatus status : AssessmentStatus.values()) {
      var rows =
          repository
              .listAccessible(
                  rh, new AssessmentListFilter(null, null, null, null, status, null), 12, null)
              .items();
      assertThat(rows).isNotEmpty().allMatch(row -> row.status().equals(status.name()));
    }
  }
}

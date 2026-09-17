package br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository.CreationCycleOptionView;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository.ManagerCreationOptionView;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Consultas reais sobre CTEs fictícias, sem DDL/DML nem leitura de avaliações ou pessoas. */
@EnabledIfSystemProperty(named = "adc.dev.sql.readonly", matches = "true")
class AssessmentCreationOptionsReadOnlySqlTests {
  private static UUID id(int number) {
    return UUID.fromString("00000000-0000-0000-0000-%012d".formatted(number));
  }

  private static final String FIXTURE =
      """
      WITH ids AS (
        SELECT n, CONVERT(uniqueidentifier, '00000000-0000-0000-0000-' + RIGHT('000000000000' + CONVERT(varchar(12), n), 12)) AS id
        FROM (VALUES (101),(201),(202),(301),(302)) AS numbers(n)
      ), fixture_usuario AS (
        SELECT id AS usuario_id, 'ATIVO' AS situacao FROM ids WHERE n = 101
      ), fixture_ciclo_avaliacao AS (
        SELECT id AS ciclo_avaliacao_id, CONVERT(nvarchar(30), n) AS nome, 'ABERTO' AS situacao,
          DATEADD(day,-1,SYSUTCDATETIME()) AS janela_abertura_em_utc,
          DATEADD(day,1,SYSUTCDATETIME()) AS janela_encerramento_em_utc,
          1 AS autoavaliacao_habilitada
        FROM ids WHERE n IN (201,202)
      ), fixture_colaborador AS (
        SELECT id AS colaborador_id, CONVERT(nvarchar(30), n) AS nome_exibicao
        FROM ids WHERE n IN (301,302)
      ), fixture_atribuicao_questionario_colaborador AS (
        SELECT ciclo_avaliacao_id, colaborador_id, CAST(NULL AS datetime2) AS revogado_em_utc
        FROM fixture_ciclo_avaliacao CROSS JOIN fixture_colaborador
      ), fixture_vinculo_gestor_colaborador AS (
        SELECT usuario_id AS gestor_usuario_id, colaborador_id,
          CAST(NULL AS datetime2) AS revogado_em_utc,
          CAST(NULL AS date) AS inicio_vigencia, CAST(NULL AS date) AS fim_vigencia
        FROM fixture_usuario CROSS JOIN fixture_colaborador
      ), fixture_vinculo_diretoria_gerencia AS (
        SELECT gestor_usuario_id AS diretoria_usuario_id, colaborador_id AS gerencia_colaborador_id,
          revogado_em_utc, inicio_vigencia, fim_vigencia
        FROM fixture_vinculo_gestor_colaborador
      ), fixture_vinculo_usuario_colaborador AS (
        SELECT usuario_id, id AS colaborador_id, CAST(NULL AS datetime2) AS encerrado_em_utc,
          CONVERT(date,'2020-01-01') AS inicio_vigencia, CAST(NULL AS date) AS fim_vigencia
        FROM fixture_usuario CROSS JOIN ids WHERE n = 301
      ), fixture_avaliacao AS (
        SELECT cycle.id AS ciclo_avaliacao_id, person.id AS colaborador_id,
          CAST(? AS varchar(30)) AS tipo_avaliacao, CAST(? AS varchar(10)) AS situacao,
          CONVERT(uniqueidentifier,'00000000-0000-0000-0000-000000000999') AS avaliador_usuario_id
        FROM ids AS cycle CROSS JOIN ids AS person
        WHERE cycle.n = 201 AND (person.n = 301 OR (person.n = 302 AND ? = 1))
      )
      """;

  private SqlServerAssessmentRepository repository(
      AssessmentType existingType, AssessmentStatus status, boolean exhausted) {
    var source = new DriverManagerDataSource();
    source.setDriverClassName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
    source.setUrl(
        "jdbc:sqlserver://localhost:1433;databaseName=AVALIACAO_DEV;encrypt=true;trustServerCertificate=true;integratedSecurity=true;authenticationScheme=NativeAuthentication");
    var reader = new JdbcTemplate(source);
    reader.setQueryTimeout(15);
    assertThat(reader.queryForObject("SELECT DB_NAME()", String.class)).isEqualTo("AVALIACAO_DEV");
    var fixtureJdbc =
        mock(
            JdbcTemplate.class,
            call -> {
              Object[] args = call.getRawArguments();
              assertThat(call.getMethod().getName()).isEqualTo("query");
              String sql = (String) args[0];
              assertThat(sql.stripLeading()).startsWith("SELECT");
              // Somente identificadores internos; todas as fontes são CTEs desta fixture.
              sql = FIXTURE + sql.replace("dbo.", "fixture_");
              List<Object> parameters =
                  new ArrayList<>(List.of(existingType.name(), status.name(), exhausted ? 1 : 0));
              parameters.addAll(Arrays.asList((Object[]) args[2]));
              return reader.query(sql, (RowMapper<?>) args[1], parameters.toArray());
            });
    return new SqlServerAssessmentRepository(fixtureJdbc, mock(TransactionTemplate.class));
  }

  private AssessmentAccessContext actor(String role) {
    return new AssessmentAccessContext(
        id(101),
        Set.of(
            "AVALIACOES.AVALIAR_VINCULADOS",
            "AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS",
            "AUTOAVALIACOES.PREENCHER_PROPRIA"),
        Set.of(role));
  }

  @ParameterizedTest
  @EnumSource(AssessmentStatus.class)
  void excludesEveryExistingStatusRegardlessOfAuthorAndKeepsOtherCyclesAndTypes(
      AssessmentStatus status) {
    for (AssessmentType existingType : AssessmentType.values()) {
      var repository = repository(existingType, status, false);
      for (String role : List.of("GESTOR", "GERENCIA_RH")) {
        assertThat(repository.listManagerCreationOptions(id(201), actor(role)))
            .extracting(ManagerCreationOptionView::id)
            .containsExactlyElementsOf(
                existingType == AssessmentType.GESTOR
                    ? List.of(id(302))
                    : List.of(id(301), id(302)));
        assertThat(repository.listManagerCreationOptions(id(202), actor(role)))
            .extracting(ManagerCreationOptionView::id)
            .containsExactly(id(301), id(302));
      }
      assertThat(repository.listDirectorCreationOptions(id(201), actor("DIRETORIA")))
          .extracting(ManagerCreationOptionView::id)
          .containsExactlyElementsOf(
              existingType == AssessmentType.DIRETORIA_GERENCIA
                  ? List.of(id(302))
                  : List.of(id(301), id(302)));
      assertThat(repository.listDirectorCreationOptions(id(202), actor("DIRETORIA")))
          .extracting(ManagerCreationOptionView::id)
          .containsExactly(id(301), id(302));
      for (String role : List.of("GESTOR", "GERENCIA_RH", "DIRETORIA")) {
        assertThat(repository.listCreationCycleOptions(AssessmentType.AUTOAVALIACAO, actor(role)))
            .extracting(CreationCycleOptionView::id)
            .containsExactlyElementsOf(
                existingType == AssessmentType.AUTOAVALIACAO
                    ? List.of(id(202))
                    : List.of(id(201), id(202)));
      }
    }
  }

  @ParameterizedTest
  @EnumSource(AssessmentType.class)
  void removesExhaustedCyclesOnlyForTheirAssessmentType(AssessmentType existingType) {
    var repository = repository(existingType, AssessmentStatus.RASCUNHO, true);
    for (AssessmentType requestedType : AssessmentType.values()) {
      assertThat(repository.listCreationCycleOptions(requestedType, actor("DIRETORIA")))
          .extracting(CreationCycleOptionView::id)
          .containsExactlyElementsOf(
              existingType == requestedType ? List.of(id(202)) : List.of(id(201), id(202)));
    }
  }
}

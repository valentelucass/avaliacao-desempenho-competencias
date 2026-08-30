package br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SqlServerAssessmentRepositoryTests {

  @Test
  void accessibleListKeepsScopeChecksAndUsesParameterizedIndividualFilters() {
    assertThat(SqlServerAssessmentRepository.accessibleListSql())
        .contains("assessment.avaliador_usuario_id = ?")
        .contains("assessment.tipo_avaliacao = 'DIRETORIA_GERENCIA'")
        .contains("dbo.vinculo_diretoria_gerencia")
        .contains("assessment.ciclo_avaliacao_id = ?")
        .contains("assessment.colaborador_id = ?");
  }

  @Test
  void creationOptionsRestrictTheSqlPopulationWithoutSelectingAssessmentData() {
    String sql = SqlServerAssessmentRepository.managerCreationOptionsSql();

    assertThat(sql)
        .contains(
            "assignment.revogado_em_utc IS NULL",
            "manager_link.gestor_usuario_id = ?",
            "manager_link.revogado_em_utc IS NULL",
            "actor_user.situacao = 'ATIVO'",
            "cycle.ciclo_avaliacao_id = ?",
            "cycle.situacao = 'ABERTO'",
            "cycle.janela_abertura_em_utc <= SYSUTCDATETIME()",
            "cycle.janela_encerramento_em_utc > SYSUTCDATETIME()",
            "assessment.tipo_avaliacao = 'GESTOR'",
            "NOT EXISTS")
        .doesNotContain("resultado_avaliacao", "nota_final", "COUNT(", "resposta_avaliacao");
  }

  @Test
  void summaryReadsSqlServerDatetime2AsUtc() throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getObject("avaliacao_id", UUID.class)).thenReturn(UUID.randomUUID());
    when(resultSet.getObject("ciclo_avaliacao_id", UUID.class)).thenReturn(UUID.randomUUID());
    when(resultSet.getString("cycle_name")).thenReturn("Ciclo 2026");
    when(resultSet.getString("collaborator_display_name")).thenReturn("Colaborador");
    when(resultSet.getString("tipo_avaliacao")).thenReturn("GESTOR");
    when(resultSet.getString("assessment_situation")).thenReturn("RASCUNHO");
    when(resultSet.getString("feedback_situation")).thenReturn("NAO_APLICAVEL");
    when(resultSet.getBytes("version_row_version")).thenReturn(new byte[8]);
    when(resultSet.getObject("atualizada_em_utc", LocalDateTime.class))
        .thenReturn(LocalDateTime.of(2026, 8, 26, 14, 30));

    assertThat(SqlServerAssessmentRepository.mapSummary(resultSet).updatedAt())
        .isEqualTo(Instant.parse("2026-08-26T14:30:00Z"));

    verify(resultSet).getObject("atualizada_em_utc", LocalDateTime.class);
    verify(resultSet, never()).getTimestamp("atualizada_em_utc");
  }

  @Test
  void directorCreationOptionsRestrictToAnActiveDirectorManagerLink() {
    String sql = SqlServerAssessmentRepository.directorCreationOptionsSql();

    assertThat(sql)
        .contains(
            "director_link.diretoria_usuario_id = ?",
            "director_link.gerencia_colaborador_id = assignment.colaborador_id",
            "director_link.revogado_em_utc IS NULL",
            "assessment.tipo_avaliacao = 'DIRETORIA_GERENCIA'",
            "actor_user.situacao = 'ATIVO'")
        .doesNotContain("resultado_avaliacao", "nota_final", "COUNT(", "resposta_avaliacao");
  }

  @Test
  void nullableIntegerAcceptsTheSmallintTypeReturnedBySqlServer() throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getObject("status_resposta")).thenReturn(Short.valueOf((short) 201));

    assertThat(SqlServerAssessmentRepository.nullableInteger(resultSet, "status_resposta"))
        .isEqualTo(201);

    when(resultSet.getObject("status_resposta")).thenReturn(null);
    assertThat(SqlServerAssessmentRepository.nullableInteger(resultSet, "status_resposta"))
        .isNull();
  }
}

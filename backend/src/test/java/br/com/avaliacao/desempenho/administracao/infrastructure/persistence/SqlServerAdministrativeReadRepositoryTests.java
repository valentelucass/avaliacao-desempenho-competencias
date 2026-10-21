package br.com.avaliacao.desempenho.administracao.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleWindowStatus;
import java.sql.ResultSet;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class SqlServerAdministrativeReadRepositoryTests {

  @Test
  void activeAdministrativeQueriesExcludeClosedAndRevokedHistoryWithoutSelectingSensitiveContent() {
    assertThat(SqlServerAdministrativeReadRepository.LIST_ACTIVE_ALLOCATIONS_SQL)
        .contains("encerrado_em_utc IS NULL")
        .doesNotContain("DELETE", "senha", "token", "comentario", "plano_acao");
    assertThat(SqlServerAdministrativeReadRepository.LIST_ACTIVE_MANAGER_ASSIGNMENTS_SQL)
        .contains("revogado_em_utc IS NULL")
        .doesNotContain("DELETE", "senha", "token", "comentario");
    assertThat(SqlServerAdministrativeReadRepository.LIST_ACTIVE_USER_COLLABORATOR_LINKS_SQL)
        .contains("encerrado_em_utc IS NULL")
        .doesNotContain("DELETE", "senha", "token", "comentario");
    assertThat(SqlServerAdministrativeReadRepository.LIST_ACTIVE_QUESTIONNAIRE_ASSIGNMENTS_SQL)
        .contains(
            "atribuicao.revogado_em_utc IS NULL",
            "ciclo.codigo AS ciclo_codigo",
            "ciclo.nome AS ciclo_nome",
            "versao_questionario.titulo AS questionario_titulo")
        .doesNotContain("ciclo.situacao", "DELETE", "senha", "token", "comentario");
  }

  @Test
  void draftConfigurationUsesAUuidPlaceholderAndCanOnlyReadDraftCycles() {
    assertThat(SqlServerAdministrativeReadRepository.FIND_DRAFT_CYCLE_CONFIGURATION_SQL)
        .contains("WHERE ciclo.ciclo_avaliacao_id = ?", "ciclo.situacao = 'RASCUNHO'")
        .doesNotContain("DELETE", "senha", "token", "comentario");
    assertThat(SqlServerAdministrativeReadRepository.LIST_DRAFT_CYCLE_QUESTIONNAIRES_SQL)
        .contains("WHERE ciclo_avaliacao_id = ?")
        .doesNotContain("DELETE", "senha", "token", "comentario");
  }

  @Test
  void approvedQuestionnaireOptionsRequireApprovedQuestionnaireCalculationAndMatrixArtifacts() {
    assertThat(SqlServerAdministrativeReadRepository.LIST_APPROVED_QUESTIONNAIRE_VERSIONS_SQL)
        .contains("versao.aprovado_em_utc IS NOT NULL")
        .doesNotContain("DELETE", "senha", "token", "comentario");
    assertThat(SqlServerAdministrativeReadRepository.LIST_APPROVED_CALCULATION_MATRIX_OPTIONS_SQL)
        .contains(
            "configuracao.aprovado_em_utc IS NOT NULL",
            "matriz.aprovado_em_utc IS NOT NULL",
            "matriz.configuracao_calculo_versao_id")
        .doesNotContain("DELETE", "senha", "token", "comentario");
  }

  @Test
  void questionnaireAssignmentOptionsExposeOnlyDraftCyclesAndAppliedQuestionnaireTitles() {
    assertThat(SqlServerAdministrativeReadRepository.LIST_QUESTIONNAIRE_ASSIGNMENT_OPTIONS_SQL)
        .contains(
            "ciclo.situacao = 'RASCUNHO'",
            "ciclo_questionario.ciclo_questionario_id",
            "versao_questionario.titulo AS questionario_titulo")
        .doesNotContain("DELETE", "senha", "token", "comentario", "nota_final");
  }

  @Test
  void bindingOptionsContainOnlyCurrentEligibleAccountsAndActiveCollaborators() {
    assertThat(SqlServerAdministrativeReadRepository.LIST_ELIGIBLE_MANAGER_OPTIONS_SQL)
        .contains(
            "usuario.situacao = 'ATIVO'",
            "atribuicao.revogado_em_utc IS NULL",
            "papel.codigo IN ('GESTOR', 'GERENCIA_RH')",
            "papel.ativo = 1")
        .doesNotContain("DELETE", "login_normalizado", "senha", "token", "comentario");
    assertThat(SqlServerAdministrativeReadRepository.LIST_ACTIVE_USER_OPTIONS_SQL)
        .contains("situacao = 'ATIVO'")
        .doesNotContain("DELETE", "login_normalizado", "senha", "token", "comentario");
    assertThat(SqlServerAdministrativeReadRepository.LIST_ACTIVE_COLLABORATOR_OPTIONS_SQL)
        .contains("ativo = 1")
        .doesNotContain("DELETE", "senha", "token", "comentario");
  }

  @Test
  @SuppressWarnings("unchecked")
  void readsStoredConfigurationAndSqlClockForEveryCycleStateWithoutTheDraftFilter()
      throws Exception {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    var repository = new SqlServerAdministrativeReadRepository(jdbc);
    UUID cycleId = UUID.randomUUID();
    ResultSet row = mock(ResultSet.class);
    when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(3);
    when(row.getObject("ciclo_avaliacao_id", UUID.class)).thenReturn(cycleId);
    when(row.getString("codigo")).thenReturn("2026.1");
    when(row.getString("nome")).thenReturn("Ciclo 2026");
    when(row.getString("fuso_horario_iana")).thenReturn("America/Sao_Paulo");
    when(row.getBoolean("autoavaliacao_habilitada")).thenReturn(true);
    when(row.getObject("janela_abertura_em_utc", LocalDateTime.class))
        .thenReturn(LocalDateTime.of(2026, 9, 16, 17, 0));
    when(row.getObject("janela_encerramento_em_utc", LocalDateTime.class))
        .thenReturn(LocalDateTime.of(2026, 10, 17, 2, 59));
    when(row.getObject("observado_em_utc", LocalDateTime.class))
        .thenReturn(LocalDateTime.of(2026, 10, 17, 2, 59));
    when(jdbc.query(
            eq(SqlServerAdministrativeReadRepository.FIND_CYCLE_CONFIGURATION_SQL),
            any(RowMapper.class),
            eq(cycleId)))
        .thenAnswer(call -> List.of(((RowMapper<?>) call.getArgument(1)).mapRow(row, 0)));

    for (EvaluationCycleStatus status : EvaluationCycleStatus.values()) {
      when(row.getString("situacao")).thenReturn(status.name());
      var result = repository.findCycleConfiguration(cycleId).orElseThrow();
      assertThat(result.status()).isEqualTo(status);
      assertThat(result.windowStatus()).isEqualTo(EvaluationCycleWindowStatus.PRAZO_ENCERRADO);
      assertThat(result.configuration().code()).isEqualTo("2026.1");
      assertThat(result.configuration().name()).isEqualTo("Ciclo 2026");
      assertThat(result.configuration().selfAssessmentEnabled()).isTrue();
      assertThat(result.configuration().closingAtUtc())
          .isEqualTo(Instant.parse("2026-10-17T02:59:00Z"));
    }
    assertThat(SqlServerAdministrativeReadRepository.FIND_CYCLE_CONFIGURATION_SQL)
        .contains("WHERE ciclo.ciclo_avaliacao_id = ?", "SYSUTCDATETIME() AS observado_em_utc")
        .doesNotContain("ciclo.situacao =", "UPDATE", "DELETE", "INSERT");
    verify(jdbc, never())
        .query(
            eq(SqlServerAdministrativeReadRepository.FIND_DRAFT_CYCLE_CONFIGURATION_SQL),
            any(RowMapper.class),
            any(UUID.class));
  }
}

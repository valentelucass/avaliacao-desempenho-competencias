package br.com.avaliacao.desempenho.avaliacoes.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentForbiddenException;
import java.sql.ResultSet;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SqlServerAssessmentRepositoryTests {

  @Test
  void publicationRevalidatesManagerOwnershipActiveAccountLinkAndCycle() throws Exception {
    var jdbc = mock(org.springframework.jdbc.core.JdbcTemplate.class);
    var repository =
        new SqlServerAssessmentRepository(
            jdbc, mock(org.springframework.transaction.support.TransactionTemplate.class));
    UUID author = UUID.randomUUID();
    UUID collaborator = UUID.randomUUID();
    UUID link = UUID.randomUUID();
    var actor =
        new br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext(
            author, java.util.Set.of("AVALIACOES.AVALIAR_VINCULADOS"), java.util.Set.of("GESTOR"));
    var type = Class.forName(SqlServerAssessmentRepository.class.getName() + "$LockedAssessment");
    var owner = new java.util.concurrent.atomic.AtomicReference<>(author);
    var cycle =
        new java.util.concurrent.atomic.AtomicReference<>(
            br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentCycleAccessPolicy
                .CycleState.OPEN);
    Object assessment =
        mock(
            type,
            invocation ->
                switch (invocation.getMethod().getName()) {
                  case "authorUserId" -> owner.get();
                  case "collaboratorId" -> collaborator;
                  case "managerLinkId" -> link;
                  case "type" ->
                      br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType.GESTOR;
                  case "cycleState" -> cycle.get();
                  default -> org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
                });
    var active = new java.util.concurrent.atomic.AtomicBoolean(true);
    var linked = new java.util.concurrent.atomic.AtomicBoolean(true);
    org.mockito.Mockito.doAnswer(
            invocation -> {
              String sql = invocation.getArgument(0);
              if (sql.contains("dbo.vinculo_gestor_colaborador")) {
                assertThat(invocation.<UUID>getArgument(2)).isEqualTo(link);
                assertThat(invocation.<UUID>getArgument(3)).isEqualTo(author);
                assertThat(invocation.<UUID>getArgument(4)).isEqualTo(collaborator);
                return linked.get();
              }
              return active.get();
            })
        .when(jdbc)
        .query(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers
                .<org.springframework.jdbc.core.ResultSetExtractor<Boolean>>any(),
            org.mockito.ArgumentMatchers.any(Object[].class));
    Runnable publish =
        () ->
            org.springframework.test.util.ReflectionTestUtils.invokeMethod(
                repository, "requirePublish", assessment, actor);
    publish.run();
    cycle.set(
        br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentCycleAccessPolicy.CycleState
            .CLOSED);
    publish.run();
    linked.set(false);
    assertThatThrownBy(publish::run).isInstanceOf(AssessmentForbiddenException.class);
    linked.set(true);
    active.set(false);
    assertThatThrownBy(publish::run).isInstanceOf(AssessmentForbiddenException.class);
    active.set(true);
    owner.set(UUID.randomUUID());
    assertThatThrownBy(publish::run).isInstanceOf(AssessmentForbiddenException.class);
    owner.set(author);
    cycle.set(
        br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentCycleAccessPolicy.CycleState
            .DRAFT);
    assertThatThrownBy(publish::run)
        .isInstanceOf(
            br.com.avaliacao.desempenho.avaliacoes.application.AssessmentConflictException.class);
  }

  @Test
  void actionAvailabilityDeniesAuthorizationFailuresButNeverHidesInfrastructureErrors() {
    assertThat(SqlServerAssessmentRepository.permitsAction(() -> {})).isTrue();
    assertThat(
            SqlServerAssessmentRepository.permitsAction(
                () -> {
                  throw new AssessmentForbiddenException();
                }))
        .isFalse();
    assertThatThrownBy(
            () ->
                SqlServerAssessmentRepository.permitsAction(
                    () -> {
                      throw new IllegalStateException("infrastructure unavailable");
                    }))
        .isInstanceOf(IllegalStateException.class);
  }

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
  void creationCycleOptionsOnlyReturnCyclesWithAnImmediatelyEligibleJourney() {
    assertThat(SqlServerAssessmentRepository.managerCreationCyclesSql())
        .contains(
            "manager_link.gestor_usuario_id = ?",
            "assignment.revogado_em_utc IS NULL",
            "assessment.tipo_avaliacao = 'GESTOR'",
            "cycle.situacao = 'ABERTO'",
            "NOT EXISTS")
        .doesNotContain("resultado_avaliacao", "nota_final", "resposta_avaliacao");
    assertThat(SqlServerAssessmentRepository.directorCreationCyclesSql())
        .contains(
            "director_link.diretoria_usuario_id = ?",
            "assignment.revogado_em_utc IS NULL",
            "assessment.tipo_avaliacao = 'DIRETORIA_GERENCIA'",
            "cycle.situacao = 'ABERTO'",
            "NOT EXISTS")
        .doesNotContain("resultado_avaliacao", "nota_final", "resposta_avaliacao");
    assertThat(SqlServerAssessmentRepository.selfCreationCyclesSql())
        .contains(
            "cycle.autoavaliacao_habilitada = 1",
            "user_link.usuario_id = ?",
            "assignment.revogado_em_utc IS NULL",
            "assessment.tipo_avaliacao = 'AUTOAVALIACAO'",
            "cycle.situacao = 'ABERTO'",
            "NOT EXISTS")
        .doesNotContain("resultado_avaliacao", "nota_final", "resposta_avaliacao");
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

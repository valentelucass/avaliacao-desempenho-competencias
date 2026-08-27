package br.com.avaliacao.desempenho.administracao.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

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
            "papel.codigo = 'GESTOR'",
            "papel.ativo = 1")
        .doesNotContain("DELETE", "login_normalizado", "senha", "token", "comentario");
    assertThat(SqlServerAdministrativeReadRepository.LIST_ACTIVE_USER_OPTIONS_SQL)
        .contains("situacao = 'ATIVO'")
        .doesNotContain("DELETE", "login_normalizado", "senha", "token", "comentario");
    assertThat(SqlServerAdministrativeReadRepository.LIST_ACTIVE_COLLABORATOR_OPTIONS_SQL)
        .contains("ativo = 1")
        .doesNotContain("DELETE", "senha", "token", "comentario");
  }
}

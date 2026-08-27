package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class InitialRolePermissionCatalogTests {

  @Test
  void keepsTechnicalAdministrationButReservesDecisionAndIndicatorPermissions() {
    assertThat(InitialRolePermissionCatalog.permissionsFor(PlatformRole.ADMINISTRADOR_PLATAFORMA))
        .contains(
            PlatformPermission.USERS_READ,
            PlatformPermission.USERS_CREATE,
            PlatformPermission.ACCESS_MANAGE,
            PlatformPermission.BUSINESS_ACCESS_MANAGE,
            PlatformPermission.MASTER_DATA_MANAGE)
        .doesNotContain(
            PlatformPermission.ASSESSMENTS_PUBLISH,
            PlatformPermission.ASSESSMENTS_REOPEN,
            PlatformPermission.INDICATORS_VIEW,
            PlatformPermission.DATA_EXPORT);
  }

  @Test
  void grantsOnlyConfirmedPermissionsToManagers() {
    assertThat(InitialRolePermissionCatalog.permissionsFor(PlatformRole.GESTOR))
        .containsExactlyInAnyOrder(
            PlatformPermission.ASSESSMENTS_EVALUATE_LINKED,
            PlatformPermission.ASSESSMENTS_VIEW_OWN_RESPONSES)
        .doesNotContain(PlatformPermission.DATA_EXPORT, PlatformPermission.ASSESSMENTS_VIEW_ALL);
  }

  @Test
  void givesRhTheBusinessAndCycleConfigurationPermissions() {
    assertThat(InitialRolePermissionCatalog.permissionsFor(PlatformRole.GERENCIA_RH))
        .containsExactlyInAnyOrder(
            PlatformPermission.BUSINESS_ACCESS_MANAGE,
            PlatformPermission.ASSESSMENTS_VIEW_ALL,
            PlatformPermission.ASSESSMENTS_PUBLISH,
            PlatformPermission.ASSESSMENTS_REOPEN,
            PlatformPermission.INDICATORS_VIEW,
            PlatformPermission.DATA_EXPORT,
            PlatformPermission.CYCLES_MANAGE,
            PlatformPermission.QUESTIONNAIRES_MANAGE);
  }

  @Test
  void givesBoardCycleConfigurationButNotQuestionnaireAdministration() {
    assertThat(InitialRolePermissionCatalog.permissionsFor(PlatformRole.DIRETORIA))
        .containsExactlyInAnyOrder(
            PlatformPermission.BUSINESS_ACCESS_MANAGE,
            PlatformPermission.ASSESSMENTS_VIEW_ALL,
            PlatformPermission.ASSESSMENTS_PUBLISH,
            PlatformPermission.ASSESSMENTS_REOPEN,
            PlatformPermission.INDICATORS_VIEW,
            PlatformPermission.DATA_EXPORT,
            PlatformPermission.CYCLES_MANAGE)
        .doesNotContain(PlatformPermission.QUESTIONNAIRES_MANAGE);
  }

  @Test
  void givesCollaboratorsOnlyTheirOwnSelfAssessmentPermissions() {
    assertThat(InitialRolePermissionCatalog.permissionsFor(PlatformRole.COLABORADOR))
        .containsExactlyInAnyOrder(
            PlatformPermission.SELF_ASSESSMENTS_FILL_OWN,
            PlatformPermission.SELF_ASSESSMENTS_SUBMIT_OWN,
            PlatformPermission.SELF_ASSESSMENTS_VIEW_OWN)
        .doesNotContain(PlatformPermission.ASSESSMENTS_VIEW_ALL, PlatformPermission.DATA_EXPORT);
  }
}

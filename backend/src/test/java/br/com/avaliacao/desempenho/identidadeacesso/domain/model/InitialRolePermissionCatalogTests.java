package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class InitialRolePermissionCatalogTests {

  @Test
  void grantsAdministratorsTheWholePermissionCatalog() {
    assertThat(InitialRolePermissionCatalog.permissionsFor(PlatformRole.ADMINISTRADOR_PLATAFORMA))
        .containsExactlyInAnyOrder(PlatformPermission.values());
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

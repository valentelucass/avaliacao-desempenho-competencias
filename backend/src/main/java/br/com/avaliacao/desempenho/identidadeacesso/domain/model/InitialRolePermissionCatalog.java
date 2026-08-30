package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Catálogo mínimo de acesso derivado das regras já aprovadas. A atribuição a uma conta e o escopo
 * por recurso continuam sendo verificados separadamente.
 */
public final class InitialRolePermissionCatalog {

  private static final Map<PlatformRole, Set<PlatformPermission>> PERMISSIONS_BY_ROLE =
      Map.of(
          PlatformRole.ADMINISTRADOR_PLATAFORMA,
          Set.of(
              PlatformPermission.USERS_READ,
              PlatformPermission.USERS_CREATE,
              PlatformPermission.USERS_UPDATE,
              PlatformPermission.ACCESS_MANAGE,
              PlatformPermission.BUSINESS_ACCESS_MANAGE,
              PlatformPermission.MASTER_DATA_MANAGE,
              PlatformPermission.CYCLES_MANAGE,
              PlatformPermission.QUESTIONNAIRES_MANAGE,
              PlatformPermission.MANAGER_ASSIGNMENTS_MANAGE,
              PlatformPermission.USER_COLLABORATOR_ASSIGNMENTS_MANAGE,
              PlatformPermission.DIRECTOR_MANAGER_ASSIGNMENTS_MANAGE),
          PlatformRole.GESTOR,
          Set.of(
              PlatformPermission.ASSESSMENTS_EVALUATE_LINKED,
              PlatformPermission.ASSESSMENTS_VIEW_OWN_RESPONSES,
              PlatformPermission.ASSESSMENTS_RECORD_OWN_FEEDBACK,
              PlatformPermission.SELF_ASSESSMENTS_FILL_OWN,
              PlatformPermission.SELF_ASSESSMENTS_SUBMIT_OWN,
              PlatformPermission.SELF_ASSESSMENTS_VIEW_OWN),
          PlatformRole.GERENCIA_RH,
          Set.of(
              PlatformPermission.BUSINESS_ACCESS_MANAGE,
              PlatformPermission.ASSESSMENTS_VIEW_ALL,
              PlatformPermission.ASSESSMENTS_PUBLISH,
              PlatformPermission.ASSESSMENTS_REOPEN,
              PlatformPermission.INDICATORS_VIEW,
              PlatformPermission.DATA_EXPORT,
              PlatformPermission.CYCLES_MANAGE,
              PlatformPermission.QUESTIONNAIRES_MANAGE,
              PlatformPermission.DIRECTOR_MANAGER_ASSIGNMENTS_MANAGE),
          PlatformRole.DIRETORIA,
          Set.of(
              PlatformPermission.BUSINESS_ACCESS_MANAGE,
              PlatformPermission.ASSESSMENTS_VIEW_ALL,
              PlatformPermission.ASSESSMENTS_PUBLISH,
              PlatformPermission.ASSESSMENTS_REOPEN,
              PlatformPermission.ASSESSMENTS_EVALUATE_LINKED_MANAGERS,
              PlatformPermission.ASSESSMENTS_RECORD_OWN_FEEDBACK,
              PlatformPermission.SELF_ASSESSMENTS_FILL_OWN,
              PlatformPermission.SELF_ASSESSMENTS_SUBMIT_OWN,
              PlatformPermission.SELF_ASSESSMENTS_VIEW_OWN,
              PlatformPermission.INDICATORS_VIEW,
              PlatformPermission.DATA_EXPORT,
              PlatformPermission.CYCLES_MANAGE),
          PlatformRole.COLABORADOR,
          Set.of());

  private InitialRolePermissionCatalog() {}

  public static Set<PlatformPermission> permissionsFor(PlatformRole role) {
    return PERMISSIONS_BY_ROLE.get(Objects.requireNonNull(role, "role não pode ser nulo"));
  }
}

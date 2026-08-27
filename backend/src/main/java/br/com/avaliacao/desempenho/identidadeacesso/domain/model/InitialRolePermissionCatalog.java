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
          Set.copyOf(java.util.EnumSet.allOf(PlatformPermission.class)),
          PlatformRole.GESTOR,
          Set.of(
              PlatformPermission.ASSESSMENTS_EVALUATE_LINKED,
              PlatformPermission.ASSESSMENTS_VIEW_OWN_RESPONSES),
          PlatformRole.GERENCIA_RH,
          Set.of(
              PlatformPermission.ASSESSMENTS_VIEW_ALL,
              PlatformPermission.ASSESSMENTS_PUBLISH,
              PlatformPermission.ASSESSMENTS_REOPEN,
              PlatformPermission.INDICATORS_VIEW,
              PlatformPermission.DATA_EXPORT,
              PlatformPermission.CYCLES_MANAGE,
              PlatformPermission.QUESTIONNAIRES_MANAGE),
          PlatformRole.DIRETORIA,
          Set.of(
              PlatformPermission.ASSESSMENTS_VIEW_ALL,
              PlatformPermission.ASSESSMENTS_PUBLISH,
              PlatformPermission.ASSESSMENTS_REOPEN,
              PlatformPermission.INDICATORS_VIEW,
              PlatformPermission.DATA_EXPORT,
              PlatformPermission.CYCLES_MANAGE),
          PlatformRole.COLABORADOR,
          Set.of(
              PlatformPermission.SELF_ASSESSMENTS_FILL_OWN,
              PlatformPermission.SELF_ASSESSMENTS_SUBMIT_OWN,
              PlatformPermission.SELF_ASSESSMENTS_VIEW_OWN));

  private InitialRolePermissionCatalog() {}

  public static Set<PlatformPermission> permissionsFor(PlatformRole role) {
    return PERMISSIONS_BY_ROLE.get(Objects.requireNonNull(role, "role não pode ser nulo"));
  }
}

package br.com.avaliacao.desempenho.administracao.domain.model;

import java.util.Objects;

/** Autoriza cada coleção administrativa pela permissão específica que a mantém. */
public final class AdministrativeReadAuthorizationPolicy {

  public static final String MASTER_DATA_MANAGE = "CADASTROS.GERIR";
  public static final String MANAGER_ASSIGNMENTS_MANAGE = "VINCULOS_GESTOR_COLABORADOR.GERIR";
  public static final String USER_COLLABORATOR_ASSIGNMENTS_MANAGE =
      "VINCULOS_USUARIO_COLABORADOR.GERIR";
  public static final String QUESTIONNAIRES_MANAGE = "QUESTIONARIOS.GERIR";
  public static final String CYCLES_MANAGE = "CICLOS.GERIR";

  public boolean mayReadMasterData(AdministrativeReadAccessContext actor) {
    return has(actor, MASTER_DATA_MANAGE);
  }

  public boolean mayReadManagerAssignments(AdministrativeReadAccessContext actor) {
    return has(actor, MANAGER_ASSIGNMENTS_MANAGE);
  }

  public boolean mayReadUserCollaboratorAssignments(AdministrativeReadAccessContext actor) {
    return has(actor, USER_COLLABORATOR_ASSIGNMENTS_MANAGE);
  }

  public boolean mayReadApprovedQuestionnaireVersions(AdministrativeReadAccessContext actor) {
    AdministrativeReadAccessContext access =
        Objects.requireNonNull(actor, "ator não pode ser nulo");
    return access.has(QUESTIONNAIRES_MANAGE) || access.has(CYCLES_MANAGE);
  }

  public boolean mayReadDraftCycleConfiguration(AdministrativeReadAccessContext actor) {
    return has(actor, CYCLES_MANAGE);
  }

  private static boolean has(AdministrativeReadAccessContext actor, String permission) {
    return Objects.requireNonNull(actor, "ator não pode ser nulo").has(permission);
  }
}

package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AdministrativeAccessSegregationPolicyTests {

  private final AdministrativeAccessSegregationPolicy policy =
      new AdministrativeAccessSegregationPolicy();

  @Test
  void deniesSelfAccessReplacementEvenWhenTheActorAlreadyHasBusinessScope() {
    UUID actor = UUID.randomUUID();

    assertThat(
            policy.mayReplaceAccess(
                actor,
                actor,
                Set.of("GERENCIA_RH"),
                Set.of("ACESSOS.NEGOCIO.GERIR"),
                Set.of("GERENCIA_RH"),
                List.of()))
        .isFalse();
  }

  @Test
  void permitsAnAdministratorWithBusinessAccessToGrantBusinessRolesOrPermissions() {
    UUID actor = UUID.randomUUID();

    assertThat(
            policy.mayReplaceAccess(
                actor,
                UUID.randomUUID(),
                Set.of("ADMINISTRADOR_PLATAFORMA"),
                Set.of("ACESSOS.GERIR", "ACESSOS.NEGOCIO.GERIR"),
                Set.of("GERENCIA_RH"),
                List.of()))
        .isTrue();
    assertThat(
            policy.mayReplaceAccess(
                actor,
                UUID.randomUUID(),
                Set.of("ADMINISTRADOR_PLATAFORMA"),
                Set.of("ACESSOS.GERIR", "ACESSOS.NEGOCIO.GERIR"),
                Set.of(),
                List.of(
                    new AdministrativeAccessSegregationPolicy.DesiredPermission(
                        "AVALIACOES.VISUALIZAR_TODAS", PermissionEffect.ALLOW))))
        .isTrue();
  }

  @Test
  void permitsAdministratorAndBusinessAccessForAuthorizedActors() {
    UUID actor = UUID.randomUUID();

    assertThat(
            policy.mayReplaceAccess(
                actor,
                UUID.randomUUID(),
                Set.of("ADMINISTRADOR_PLATAFORMA"),
                Set.of("ACESSOS.GERIR", "ACESSOS.NEGOCIO.GERIR"),
                Set.of("ADMINISTRADOR_PLATAFORMA"),
                List.of()))
        .isTrue();
    assertThat(
            policy.mayReplaceAccess(
                actor,
                UUID.randomUUID(),
                Set.of("GERENCIA_RH"),
                Set.of("ACESSOS.NEGOCIO.GERIR"),
                Set.of("GESTOR"),
                List.of()))
        .isTrue();
  }

  @Test
  void deniesBusinessAccessWhenTheBusinessRoleHasNoEffectiveBusinessGrant() {
    assertThat(
            policy.mayReplaceAccess(
                UUID.randomUUID(),
                UUID.randomUUID(),
                Set.of("GERENCIA_RH"),
                Set.of("ACESSOS.GERIR"),
                Set.of("GESTOR"),
                List.of()))
        .isFalse();
  }
}

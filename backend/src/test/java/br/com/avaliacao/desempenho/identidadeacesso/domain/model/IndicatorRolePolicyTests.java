package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.junit.jupiter.api.Test;

class IndicatorRolePolicyTests {

  private final IndicatorRolePolicy policy = new IndicatorRolePolicy();

  @Test
  void permitsIndividualIndicatorGrantsOnlyForRhOrBoardRoles() {
    assertThat(
            policy.mayReceiveIndividualPermission(
                Set.of(PlatformRole.GESTOR.name()),
                PlatformPermission.INDICATORS_VIEW.code(),
                PermissionEffect.ALLOW))
        .isFalse();
    assertThat(
            policy.mayReceiveIndividualPermission(
                Set.of(
                    PlatformRole.ADMINISTRADOR_PLATAFORMA.name(), PlatformRole.GERENCIA_RH.name()),
                PlatformPermission.DATA_EXPORT.code(),
                PermissionEffect.ALLOW))
        .isFalse();
    assertThat(
            policy.mayReceiveIndividualPermission(
                Set.of(PlatformRole.GERENCIA_RH.name()),
                PlatformPermission.INDICATORS_VIEW.code(),
                PermissionEffect.ALLOW))
        .isTrue();
    assertThat(
            policy.mayReceiveIndividualPermission(
                Set.of(PlatformRole.DIRETORIA.name()),
                PlatformPermission.DATA_EXPORT.code(),
                PermissionEffect.ALLOW))
        .isTrue();
  }

  @Test
  void allowsAnIndividualDenialWithoutTurningItIntoAnAccessGrant() {
    assertThat(
            policy.mayReceiveIndividualPermission(
                Set.of(PlatformRole.GESTOR.name()),
                PlatformPermission.INDICATORS_VIEW.code(),
                PermissionEffect.DENY))
        .isTrue();
  }
}

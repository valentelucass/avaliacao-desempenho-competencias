package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EvaluationCycleReadAuthorizationPolicyTests {

  private final EvaluationCycleReadAuthorizationPolicy policy =
      new EvaluationCycleReadAuthorizationPolicy();

  @Test
  void grantsAllCyclesOnlyToTheExplicitAdministrativeOrIndicatorScopes() {
    EvaluationCycleReadScope administrative =
        policy.scopeFor(actor(EvaluationCycleReadAuthorizationPolicy.CYCLES_MANAGE)).orElseThrow();
    EvaluationCycleReadScope indicator =
        policy
            .scopeFor(actor(EvaluationCycleReadAuthorizationPolicy.INDICATORS_VIEW))
            .orElseThrow();

    assertThat(administrative.allCycles()).isTrue();
    assertThat(indicator.allCycles()).isTrue();
  }

  @Test
  void keepsManagerAndSelfAssessmentScopesBoundToTheirOwnRelationships() {
    EvaluationCycleReadScope scope =
        policy
            .scopeFor(
                actor(
                    EvaluationCycleReadAuthorizationPolicy.EVALUATE_LINKED,
                    EvaluationCycleReadAuthorizationPolicy.FILL_OWN_SELF_ASSESSMENT))
            .orElseThrow();

    assertThat(scope.allCycles()).isFalse();
    assertThat(scope.managedCollaborators()).isTrue();
    assertThat(scope.ownCollaborator()).isTrue();
  }

  @Test
  void deniesAUserWithoutAnExplicitReadPath() {
    assertThat(policy.scopeFor(actor())).isEmpty();
  }

  private static EvaluationCycleReadAccessContext actor(String... permissions) {
    return new EvaluationCycleReadAccessContext(UUID.randomUUID(), Set.of(permissions));
  }
}

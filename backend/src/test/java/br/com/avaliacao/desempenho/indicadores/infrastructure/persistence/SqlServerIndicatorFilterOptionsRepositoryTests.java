package br.com.avaliacao.desempenho.indicadores.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.indicadores.domain.model.GroupedIndicatorPrivacyPolicy;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SqlServerIndicatorFilterOptionsRepositoryTests {

  @Test
  void bindsTheCycleAndSuppressesEveryOptionBelowThePrivacyThreshold() {
    UUID cycleId = UUID.randomUUID();

    assertSafeCycleScopedSql(SqlServerIndicatorFilterOptionsRepository.branchesSql(), cycleId);
    assertSafeCycleScopedSql(SqlServerIndicatorFilterOptionsRepository.areasSql(), cycleId);
    assertSafeCycleScopedSql(SqlServerIndicatorFilterOptionsRepository.managersSql(), cycleId);
    assertSafeCycleScopedSql(SqlServerIndicatorFilterOptionsRepository.competenciesSql(), cycleId);
  }

  @Test
  void derivesOptionsOnlyFromPublishedManagerResultsAndNeverSelectsEvaluatedPeople() {
    assertThat(SqlServerIndicatorFilterOptionsRepository.branchesSql())
        .contains(
            "a.tipo_avaliacao = 'GESTOR'",
            "a.situacao = 'PUBLICADA'",
            "va.situacao = 'PUBLICADA'",
            "dbo.resultado_avaliacao")
        .doesNotContain(
            "nome_exibicao AS evaluated", "nota_final AS option", "classification_count");
    assertThat(SqlServerIndicatorFilterOptionsRepository.competenciesSql())
        .contains(
            "resposta.versao_avaliacao_id = population.versao_avaliacao_id",
            "competencia.competencia_id AS option_id")
        .doesNotContain("nota_final AS option", "classificacao AS option");
  }

  private static void assertSafeCycleScopedSql(String sql, UUID cycleId) {
    assertThat(sql)
        .contains(
            "a.ciclo_avaliacao_id = ?",
            "COUNT(DISTINCT population.colaborador_id) >= "
                + GroupedIndicatorPrivacyPolicy.MINIMUM_DISTINCT_COLLABORATORS)
        .doesNotContain(cycleId.toString());
  }
}

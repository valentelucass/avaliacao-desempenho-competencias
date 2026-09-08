package br.com.avaliacao.desempenho.cadastros.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SqlServerMasterDataRepositoryTests {

  @Test
  void managerAssignmentsAcceptOnlyAnActiveManagerOrRhAccountAndAnActiveCollaborator() {
    assertThat(SqlServerMasterDataRepository.CREATE_MANAGER_ASSIGNMENT_SQL)
        .contains(
            "situacao = 'ATIVO'",
            "atribuicao.revogado_em_utc IS NULL",
            "papel.codigo IN ('GESTOR', 'GERENCIA_RH')",
            "papel.ativo = 1",
            "colaborador_id = ? AND ativo = 1")
        .doesNotContain("DELETE", "login_normalizado", "senha", "token", "comentario");
  }
}

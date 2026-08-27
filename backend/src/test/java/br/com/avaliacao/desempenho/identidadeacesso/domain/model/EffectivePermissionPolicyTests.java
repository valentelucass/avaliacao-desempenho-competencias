package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EffectivePermissionPolicyTests {

  @Test
  void individualDenyWinsOverRolePermission() {
    assertThat(
            EffectivePermissionPolicy.resolve(
                List.of("AVALIACOES.VISUALIZAR_TODAS", "DADOS.EXPORTAR"),
                Map.of("DADOS.EXPORTAR", PermissionEffect.DENY)))
        .containsExactly("AVALIACOES.VISUALIZAR_TODAS");
  }

  @Test
  void individualAllowCanAddAnExplicitPermission() {
    assertThat(
            EffectivePermissionPolicy.resolve(
                List.of("USUARIOS.LER"), Map.of("ACESSOS.GERIR", PermissionEffect.ALLOW)))
        .containsExactlyInAnyOrder("USUARIOS.LER", "ACESSOS.GERIR");
  }
}

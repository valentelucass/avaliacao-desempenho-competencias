package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

/** Predicado compartilhado: aliases usuario/credencial, sem valores fornecidos pelo cliente. */
final class PasswordResetSqlEligibility {
  private PasswordResetSqlEligibility() {}

  static final String TARGET =
      """
      usuario.situacao = 'ATIVO' AND usuario.excluido_logicamente = 0
      AND usuario.protegido_fluxo_normal = 0 AND usuario.administrador_supremo = 0
      AND (credencial.bloqueada_ate_utc IS NULL OR credencial.bloqueada_ate_utc <= SYSUTCDATETIME())
      AND NOT EXISTS (
          SELECT 1 FROM dbo.atribuicao_papel atribuicao
          JOIN dbo.papel papel ON papel.papel_id = atribuicao.papel_id
          WHERE atribuicao.usuario_id = usuario.usuario_id AND atribuicao.revogado_em_utc IS NULL
            AND papel.codigo = 'ADMINISTRADOR_PLATAFORMA')
      """;

  static final String OPERATOR_SCOPE =
      """
      AND usuario.usuario_id <> ?
      AND (? = 1 OR NOT EXISTS (
          SELECT 1 FROM dbo.concessao_permissao_usuario concessao
          JOIN dbo.permissao permissao ON permissao.permissao_id = concessao.permissao_id
          WHERE concessao.usuario_id = usuario.usuario_id AND concessao.revogado_em_utc IS NULL
            AND concessao.efeito = 'PERMITIR' AND permissao.codigo = 'SENHAS.DELEGAR_REDEFINICAO'))
      """;
}

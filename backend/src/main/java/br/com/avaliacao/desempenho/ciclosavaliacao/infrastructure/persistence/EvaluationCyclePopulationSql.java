package br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence;

/** População prevista na abertura ou no encerramento do ciclo, sem inferir pelo cadastro geral. */
public final class EvaluationCyclePopulationSql {

  private EvaluationCyclePopulationSql() {}

  public static final String CYCLE_AND_EXPECTED_COLLABORATORS =
      """
      WITH cycle_scope AS (
          SELECT ciclo_avaliacao_id,
                 CASE WHEN situacao = 'ENCERRADO' THEN encerrado_em_utc
                      ELSE SYSUTCDATETIME() END AS reference_at
          FROM dbo.ciclo_avaliacao
          WHERE ciclo_avaliacao_id = ? AND situacao IN ('ABERTO', 'ENCERRADO')
      ), expected AS (
          SELECT DISTINCT assignment.colaborador_id
          FROM dbo.atribuicao_questionario_colaborador AS assignment
          JOIN cycle_scope AS cycle ON cycle.ciclo_avaliacao_id = assignment.ciclo_avaliacao_id
          WHERE assignment.atribuido_em_utc <= cycle.reference_at
            AND (assignment.revogado_em_utc IS NULL OR assignment.revogado_em_utc > cycle.reference_at)
      )
      """;
}

package br.com.avaliacao.desempenho.ciclosavaliacao.application;

/** Não há uma permissão de alto nível confirmada para a leitura solicitada. */
public final class EvaluationCycleReadForbiddenException extends RuntimeException {

  public EvaluationCycleReadForbiddenException() {
    super("A leitura de ciclos não é permitida.");
  }
}

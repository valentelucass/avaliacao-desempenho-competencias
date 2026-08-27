package br.com.avaliacao.desempenho.ciclosavaliacao.application;

/** Recurso ausente ou fora do escopo; a resposta HTTP não diferencia as condições. */
public final class EvaluationCycleNotFoundException extends RuntimeException {

  public EvaluationCycleNotFoundException() {
    super("Ciclo ou questionário aplicado não encontrado.");
  }
}

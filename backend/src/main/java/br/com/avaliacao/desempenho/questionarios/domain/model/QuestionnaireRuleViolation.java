package br.com.avaliacao.desempenho.questionarios.domain.model;

/** Violação da estrutura imutável de uma versão de questionário 2024.1. */
public final class QuestionnaireRuleViolation extends RuntimeException {

  public QuestionnaireRuleViolation(String message) {
    super(message);
  }
}

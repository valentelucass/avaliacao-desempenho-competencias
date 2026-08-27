package br.com.avaliacao.desempenho.indicadores.application;

/** Falha fechada de autorização de indicadores sem revelar papéis ou permissões ao cliente. */
public final class IndicatorAccessDeniedException extends RuntimeException {

  public IndicatorAccessDeniedException() {
    super("O acesso a indicadores não está autorizado.");
  }
}

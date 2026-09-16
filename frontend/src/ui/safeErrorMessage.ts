import { ApiError } from '../api/client'

export function safeErrorMessage(error: unknown): string {
  return withReference(errorMessage(error), error)
}

export function safeLoadErrorMessage(error: unknown, resource: string): string {
  const reason =
    error instanceof ApiError && (error.status === 401 || error.status === 403)
      ? errorMessage(error)
      : 'Tente atualizar os dados ou recarregue a página.'
  return withReference(`Não foi possível carregar ${resource}. ${reason}`, error)
}

function withReference(message: string, error: unknown): string {
  const requestId = error instanceof ApiError ? error.requestId : undefined
  return requestId && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(requestId)
    ? `${message} Referência: ${requestId}.`
    : message
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const importErrors: Record<string, string> = {
      IMPORT_INVALID_FILE:
        'Use o modelo .xlsx com uma aba e os cabeçalhos esperados. A planilha deve conter somente valores, sem fórmulas, links ou objetos.',
      IMPORT_LIMIT_EXCEEDED:
        'Use uma planilha de até 1 MB e 1.000 registros, sem conteúdo adicional.',
      IMPORT_EXPIRED:
        'A conferência expirou ou não está disponível. Clique em Conferir planilha novamente.',
      IMPORT_STALE:
        'Os cadastros mudaram ou há pendências. Confira novamente a planilha antes de confirmar.',
      IMPORT_RATE_LIMITED:
        'Aguarde um minuto ou descarte uma conferência anterior antes de tentar novamente.',
    }
    if (error.code && Object.hasOwn(importErrors, error.code)) return importErrors[error.code]
    if (error.status === 401) {
      return 'Sua sessão não está disponível. Entre novamente para continuar.'
    }
    if (error.status === 403) {
      if (error.code === 'CSRF_INVALID') return 'Atualize a página e tente novamente.'
      return 'Você não possui acesso a esta operação.'
    }
    if (error.status === 409) {
      if (error.reasonCode === 'CYCLE_CODE_ALREADY_EXISTS')
        return 'Já existe um ciclo com esse código. Para configurar ou abrir esse ciclo, selecione-o em Ciclos disponíveis. Para criar outro, informe um código diferente.'
      if (error.reasonCode === 'CYCLE_OPENING_NOT_REACHED')
        return 'O ciclo ainda não chegou à data e ao horário de abertura salvos (America/Sao_Paulo). Aguarde esse horário ou revise e salve a abertura do rascunho.'
      if (error.reasonCode === 'CYCLE_WINDOW_ENDED')
        return 'O período configurado já terminou. Revise e salve as datas do rascunho antes de abrir o ciclo.'
      if (error.reasonCode === 'CYCLE_CLOSING_NOT_REACHED')
        return 'O ciclo só pode ser encerrado a partir da data e do horário de encerramento salvos (America/Sao_Paulo).'
      if (error.reasonCode === 'QUESTIONNAIRE_INTEGRITY_CONFLICT')
        return 'O código ou a versão do questionário conflita com um registro existente. Confira as versões aprovadas.'
      if (error.reasonCode === 'QUESTIONNAIRE_CATALOG_CONFLICT')
        return 'Esse código de questionário já pertence a outro catálogo. Confira o código e o nome.'
      if (
        error.reasonCode === 'COMPETENCY_CATALOG_CONFLICT' ||
        error.reasonCode === 'COMPETENCY_VERSION_CONFLICT'
      )
        return 'Uma competência conflita com o catálogo ou a versão existente. Confira seu código e conteúdo.'
      if (
        error.reasonCode === 'CALCULATION_CONFIGURATION_CONFLICT' ||
        error.reasonCode === 'CLASSIFICATION_MATRIX_CONFLICT'
      )
        return 'A configuração de cálculo ou a matriz não é compatível com a versão selecionada.'
      return 'O recurso foi alterado em outra sessão ou não está mais no estado necessário. Atualize os dados antes de continuar.'
    }
    if (error.status === 422) {
      const cycleReasons: Record<string, string> = {
        CYCLE_WINDOW_ORDER_INVALID: 'O encerramento deve ocorrer depois da abertura.',
        // Compatibilidade com a API anterior à revisão do calendário por ciclo.
        CYCLE_WINDOW_INVALID:
          'O ciclo deve abrir em 01/09 às 00:00 e encerrar em 16/09 às 00:00 do mesmo ano.',
        CYCLE_TIME_ZONE_INVALID: 'O fuso horário do ciclo deve ser America/Sao_Paulo.',
        CYCLE_CODE_INVALID:
          'Use somente letras sem acentos, números, ponto, hífen ou sublinhado no código.',
        CYCLE_QUESTIONNAIRE_REPEATED:
          'Selecione somente uma configuração por versão de questionário.',
        CYCLE_QUESTIONNAIRE_COUNT_INVALID: 'Selecione entre um e 20 questionários aprovados.',
      }
      if (error.reasonCode && Object.hasOwn(cycleReasons, error.reasonCode))
        return cycleReasons[error.reasonCode]
      return 'Revise os campos informados e tente novamente.'
    }
  }

  return 'Não foi possível concluir a solicitação. Tente novamente.'
}

import { ApiError } from '../api/client'

export function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Sua sessão não está disponível. Entre novamente para continuar.'
    }
    if (error.status === 403) {
      return 'Você não possui acesso a esta operação.'
    }
    if (error.status === 409) {
      return 'O recurso foi alterado em outra sessão ou não está mais no estado necessário. Atualize os dados antes de continuar.'
    }
    if (error.status === 422) {
      return 'Revise os campos informados e tente novamente.'
    }
    if (error.requestId) {
      return `Não foi possível concluir a solicitação. Referência: ${error.requestId}.`
    }
  }

  return 'Não foi possível concluir a solicitação. Tente novamente.'
}

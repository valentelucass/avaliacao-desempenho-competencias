import { expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { safeErrorMessage, safeLoadErrorMessage } from './safeErrorMessage'

it.each([403, 409, 422])('preserva a referência segura no erro %s', (status) => {
  expect(safeErrorMessage(new ApiError({ status, requestId: 'safe.ref-1' }))).toContain(
    'Referência: safe.ref-1.',
  )
})

it('não exibe conteúdo arbitrário como referência ou motivo', () => {
  const error = new ApiError({
    status: 422,
    requestId: 'private value\n',
    reasonCode: 'internal arbitrary detail',
  })
  expect(safeErrorMessage(error)).toBe('Revise os campos informados e tente novamente.')
  expect(safeLoadErrorMessage(error, 'os ciclos')).not.toMatch(/private|internal|Revise os campos/)
})

it('explica a ordem das datas rejeitada pela API sem depender da mensagem interna', () => {
  expect(
    safeErrorMessage(new ApiError({ status: 422, reasonCode: 'CYCLE_WINDOW_ORDER_INVALID' })),
  ).toBe('O encerramento deve ocorrer depois da abertura.')
})

it('preserva o significado da rejeição de calendário de uma API antiga', () => {
  expect(
    safeErrorMessage(new ApiError({ status: 422, reasonCode: 'CYCLE_WINDOW_INVALID' })),
  ).toContain('01/09 às 00:00')
})

it.each([
  ['CYCLE_CODE_ALREADY_EXISTS', 'Já existe um ciclo com esse código'],
  ['CYCLE_OPENING_NOT_REACHED', 'ainda não chegou à data e ao horário de abertura salvos'],
  ['CYCLE_WINDOW_ENDED', 'O período configurado já terminou'],
  ['CYCLE_CLOSING_NOT_REACHED', 'só pode ser encerrado a partir da data e do horário'],
])('explica %s e mantém a referência sem sugerir concorrência', (reasonCode, message) => {
  const text = safeErrorMessage(
    new ApiError({ status: 409, reasonCode, requestId: 'cycle-window-1' }),
  )
  expect(text).toContain(message)
  expect(text).toContain('Referência: cycle-window-1.')
  expect(text).not.toContain('outra sessão')
})

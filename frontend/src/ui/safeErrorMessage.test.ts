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

it('explica a regra de ciclo rejeitada sem depender da mensagem interna', () => {
  expect(
    safeErrorMessage(new ApiError({ status: 422, reasonCode: 'CYCLE_WINDOW_INVALID' })),
  ).toContain('01/09 às 00:00')
})

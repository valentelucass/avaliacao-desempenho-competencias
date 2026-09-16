import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { administrativeRead, useAdministrativeLoad } from './useAdministrativeLoad'

it('ignora resultado e erro de uma carga substituída', async () => {
  const accept = vi.fn()
  let finishOld!: (value: string) => void
  let rejectOld!: (error: unknown) => void
  const oldResult = new Promise<string>((resolve) => {
    finishOld = resolve
  })
  const oldFailure = new Promise<string>((_, reject) => {
    rejectOld = reject
  })
  const { result } = renderHook(() => useAdministrativeLoad(vi.fn()))
  let oldLoad!: Promise<void>
  act(() => {
    oldLoad = result.current.load([
      administrativeRead('data', 'os registros', () => oldResult, accept),
      administrativeRead('other', 'outros registros', () => oldFailure, accept),
    ])
  })
  await act(async () => {
    await result.current.load([
      administrativeRead('data', 'os registros', async () => 'current', accept),
    ])
  })
  await act(async () => {
    finishOld('obsolete')
    rejectOld(new ApiError({ status: 403 }))
    await oldLoad
  })
  expect(accept).toHaveBeenCalledExactlyOnceWith('current')
  expect(result.current.errors).toEqual([])
  expect(result.current.isAvailable('data')).toBe(true)
})

it('remove a falha somente após nova consulta e recupera a disponibilidade', async () => {
  const { result } = renderHook(() => useAdministrativeLoad(vi.fn()))
  const accept = vi.fn()
  await act(async () => {
    await result.current.load([
      administrativeRead(
        'data',
        'os registros',
        async () => {
          throw new ApiError({ status: 422, requestId: 'read-failed' })
        },
        accept,
      ),
    ])
  })
  expect(result.current.errors[0]).toContain('Não foi possível carregar os registros')
  expect(result.current.isAvailable('data')).toBe(false)
  await act(async () => {
    await result.current.load([administrativeRead('data', 'os registros', async () => [], accept)])
  })
  expect(result.current.errors).toEqual([])
  expect(result.current.isAvailable('data')).toBe(true)
})

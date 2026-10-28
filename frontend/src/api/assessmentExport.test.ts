import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpApiClient } from './client'

afterEach(() => vi.unstubAllGlobals())
describe('Transporte do Excel de avaliações', () => {
  it('envia somente os filtros com CSRF e recebe arquivo binário', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'csrf-export-test' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([80, 75, 3, 4]), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const filter = { managerName: 'João', status: 'PUBLICADA' as const }
    const file = await new HttpApiClient().exportAssessments(filter)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/assessments/exports')
    expect(fetchMock.mock.calls[1][1].method).toBe('POST')
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('X-CSRF-TOKEN')).toBe(
      'csrf-export-test',
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(filter)
    expect(file.filename).toBe('avaliacoes-desempenho.xlsx')
    expect(file.content.size).toBe(4)
  })
  it('não salva uma resposta JSON de erro como Excel', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ token: 'csrf-export-test' }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
        ),
    )
    await expect(new HttpApiClient().exportAssessments({})).rejects.toMatchObject({
      status: 502,
      code: 'EXPORT_FAILED',
    })
  })
})

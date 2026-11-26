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

  it('envia o gestor no acompanhamento e baixa a planilha do mesmo recorte', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], hasNextPage: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'csrf-coverage' })))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([80, 75, 3, 4]), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const api = new HttpApiClient()
    const filter = { cycleId: 'cycle-test', status: 'PENDENTE' as const, managerName: 'João %' }
    await api.listAssessmentCoverage({ ...filter, page: 2, limit: 12 })
    const list = new URL(fetchMock.mock.calls[0][0], 'http://127.0.0.1')
    expect(list.pathname).toBe('/api/v1/assessments/coverage')
    expect(list.searchParams.get('managerName')).toBe('João %')
    const file = await api.exportAssessmentCoverage(filter)
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/assessments/exports/coverage')
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get('X-CSRF-TOKEN')).toBe(
      'csrf-coverage',
    )
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(filter)
    expect(file.filename).toBe('acompanhamento-do-inicio.xlsx')
  })
})

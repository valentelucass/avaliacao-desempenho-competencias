import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ApiError, HttpApiClient, type ApiClient } from '../../api/client'
import { CycleAdministrationPanel } from './CycleAdministrationPanel'
import { MasterDataAdministrationPanel } from './MasterDataAdministrationPanel'
import { RelationshipAdministrationPanel } from './RelationshipAdministrationPanel'
import { QuestionnaireAdministrationPanel } from './QuestionnaireAdministrationPanel'

// Regressões dos erros de leitura e recuperação do cliente.
// Dados fictícios; fetch substituído integralmente; nenhum acesso à API ou banco.
afterEach(() => vi.unstubAllGlobals())

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

it('Novo ciclo somente revela o formulário após as duas leituras iniciais', async () => {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      json(
        url.includes('evaluation-cycles')
          ? { items: [], page: { limit: 100, nextCursor: null } }
          : [],
      ),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => {
    render(
      <CycleAdministrationPanel
        api={new HttpApiClient()}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }))
  expect(screen.getByLabelText('Código do ciclo')).toHaveValue('')
  expect(screen.getByRole('form', { name: 'Novo ciclo' })).toHaveFocus()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(
    fetchMock.mock.calls.every((call) => ((call as unknown[])[1] as RequestInit).method === 'GET'),
  ).toBe(true)
})

it('identifica a leitura tardia com 422 e preserva seu erro ao clicar em Novo ciclo', async () => {
  let failRead!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => {
    failRead = resolve
  })
  const fetchMock = vi.fn((url: string) =>
    url.includes('evaluation-cycles') ? pending : Promise.resolve(json([])),
  )
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => {
    render(
      <CycleAdministrationPanel
        api={new HttpApiClient()}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
  })
  fireEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }))
  await act(async () => {
    failRead(json({ code: 'VALIDATION_FAILED', requestId: 'diagnosis-read' }, 422))
  })
  expect(
    screen.queryByText('Revise os campos informados e tente novamente.'),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os ciclos.')
  expect(screen.getByRole('alert')).toHaveTextContent('diagnosis-read')
  fireEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os ciclos.')
  expect(screen.queryByRole('heading', { name: 'Nenhum ciclo disponível' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Nenhuma versão aprovada' })).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('Cadastros preserva filial retornada quando a consulta de áreas falha', async () => {
  const api = {
    listBranches: vi
      .fn()
      .mockResolvedValue([{ id: 'branch-fictional', name: 'Filial fictícia', active: true }]),
    listAreas: vi.fn().mockRejectedValue(new ApiError({ status: 503 })),
    listCollaborators: vi.fn().mockResolvedValue([]),
    listActiveAllocations: vi.fn().mockResolvedValue([]),
    listActiveQuestionnaireAssignments: vi.fn().mockResolvedValue([]),
    listQuestionnaireAssignmentOptions: vi.fn().mockResolvedValue([]),
  } as unknown as ApiClient
  await act(async () => {
    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
  })
  expect(
    screen.queryByRole('heading', { name: 'Nenhuma filial cadastrada' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Nenhuma área cadastrada' })).not.toBeInTheDocument()
  expect(screen.getAllByText('Filial fictícia').length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: 'Atualizar cadastros' })).toBeEnabled()
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

it('Vínculos não afirma ausência de vínculos quando as opções estão indisponíveis', async () => {
  const api = {
    getManagerAssignmentOptions: vi.fn().mockRejectedValue(new ApiError({ status: 403 })),
    listActiveManagerAssignments: vi
      .fn()
      .mockResolvedValue([{ id: 'link-fictional', startsOn: '2026-09-01' }]),
  } as unknown as ApiClient
  await act(async () => {
    render(
      <RelationshipAdministrationPanel
        api={api}
        permissions={['VINCULOS_GESTOR_COLABORADOR.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
  })
  expect(screen.queryByRole('heading', { name: 'Nenhum vínculo ativo' })).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

it('Questionários distingue a falha de leitura da lista vazia', async () => {
  const api = {
    listApprovedQuestionnaireVersions: vi.fn().mockRejectedValue(new ApiError({ status: 503 })),
  } as unknown as ApiClient
  await act(async () => {
    render(
      <QuestionnaireAdministrationPanel
        api={api}
        permissions={['QUESTIONARIOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
  })
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /nenhuma versão/i })).not.toBeInTheDocument()
})

it('cursor omitido interrompe a paginação antes de enviar uma segunda consulta', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json({ items: [], page: { limit: 100 } }))
    .mockResolvedValueOnce(json({ code: 'VALIDATION_FAILED' }, 422))
  vi.stubGlobal('fetch', fetchMock)
  await expect(new HttpApiClient().listAllCycles()).rejects.toMatchObject({
    code: 'INVALID_CYCLE_PAGINATION',
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('interrompe a paginação quando o servidor repete um cursor', async () => {
  const cursor = '00000000-0000-0000-0000-000000000001'
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json({ items: [], page: { limit: 100, nextCursor: cursor } }))
    .mockResolvedValueOnce(json({ items: [], page: { limit: 100, nextCursor: cursor } }))
    .mockResolvedValueOnce(json({ items: [], page: { limit: 100, nextCursor: cursor } }))
    .mockResolvedValueOnce(json({ code: 'DIAGNOSIS_STOP' }, 503))
  vi.stubGlobal('fetch', fetchMock)
  await expect(new HttpApiClient().listAllCycles()).rejects.toMatchObject({
    code: 'INVALID_CYCLE_PAGINATION',
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('não repete uma escrita negada por permissão', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json({ token: 'fictional-csrf-a' }))
    .mockResolvedValueOnce(json({ code: 'ACCESS_DENIED' }, 403))
    .mockResolvedValueOnce(json({ token: 'fictional-csrf-b' }))
    .mockResolvedValueOnce(json({ code: 'ACCESS_DENIED' }, 403))
  vi.stubGlobal('fetch', fetchMock)
  await expect(new HttpApiClient().openEvaluationCycle('fictional-cycle')).rejects.toMatchObject({
    status: 403,
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

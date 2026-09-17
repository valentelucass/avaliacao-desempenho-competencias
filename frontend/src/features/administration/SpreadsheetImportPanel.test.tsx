import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../api/client'
import type { SpreadsheetImportPreview } from '../../api/contracts'
import { SpreadsheetImportPanel } from './SpreadsheetImportPanel'

const sample: SpreadsheetImportPreview = {
  id: 'preview-1',
  expiresAt: '2026-09-16T15:00:00Z',
  total: 2,
  creates: 1,
  existing: 1,
  errors: 0,
  page: 1,
  totalPages: 1,
  rows: [
    {
      line: 2,
      name: 'Pessoa fictícia A',
      questionnaire: '',
      status: 'CREATE',
      message: 'Criar colaborador.',
    },
    {
      line: 3,
      name: 'Pessoa fictícia B',
      questionnaire: '',
      status: 'EXISTS',
      message: 'Colaborador já cadastrado; será mantido.',
    },
  ],
}

function setup(
  options: {
    preview?: SpreadsheetImportPreview
    assignments?: boolean
    allocations?: boolean
    managers?: boolean
    failure?: ApiError
  } = {},
) {
  const api = {
    previewSpreadsheet: vi.fn().mockResolvedValue(options.preview ?? sample),
    getSpreadsheetPreview: vi.fn().mockResolvedValue({ ...sample, page: 2 }),
    confirmSpreadsheet: options.failure
      ? vi.fn().mockRejectedValue(options.failure)
      : vi.fn().mockResolvedValue({ created: 1, existing: 1 }),
    discardSpreadsheet: vi.fn().mockResolvedValue(undefined),
  } as unknown as ApiClient
  const imported = vi.fn().mockResolvedValue(undefined)
  const expired = vi.fn()
  const busy = vi.fn()
  const view = render(
    <SpreadsheetImportPanel
      kind={
        options.managers
          ? 'manager-assignments'
          : options.allocations
            ? 'allocations'
            : options.assignments
              ? 'assignments'
              : 'collaborators'
      }
      api={api}
      disabled={false}
      onBusyChange={busy}
      onImported={imported}
      onSessionExpired={expired}
      cycles={[
        {
          cycleId: 'cycle-1',
          cycleCode: '2026',
          cycleName: 'Ciclo fictício',
          questionnaires: [
            { cycleQuestionnaireId: 'q-1', title: 'Questionário fictício de liderança' },
          ],
        },
      ]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Importar Excel de/ }))
  const file = new File(['synthetic fixture'], 'exemplo.xlsx')
  fireEvent.change(screen.getByLabelText(/Planilha de/), { target: { files: [file] } })
  return { api, imported, expired, busy, file, ...view }
}

describe('SpreadsheetImportPanel', () => {
  it('confere a conta avaliadora e usa o escopo de vínculos na confirmação e descarte', async () => {
    const { api, file, imported, unmount, container } = setup({
      managers: true,
      preview: {
        ...sample,
        rows: [
          {
            ...sample.rows[0],
            managerAssignment: { manager: 'Gestora fictícia', startsOn: '16/09/2026' },
          },
        ],
      },
    })
    expect(screen.getByText('Como funciona a importação')).toBeInTheDocument()
    expect(screen.getByText(/Cada linha concede/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    await waitFor(() => expect(screen.getByText('Gestora fictícia')).toBeVisible())
    expect(api.previewSpreadsheet).toHaveBeenCalledWith('manager-assignments', file, undefined)
    expect(api.confirmSpreadsheet).not.toHaveBeenCalled()
    expect(screen.getByText('16/09/2026')).toBeVisible()
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /Confirmar importação/ }))
    await waitFor(() =>
      expect(api.confirmSpreadsheet).toHaveBeenCalledWith('preview-1', 'manager-assignments'),
    )
    await waitFor(() => expect(imported).toHaveBeenCalledTimes(1))
    unmount()
    expect(api.discardSpreadsheet).toHaveBeenCalledWith('preview-1', 'manager-assignments')
  })

  it.each(['assignments', 'allocations'])(
    'explica o bloqueio global de %s mesmo em página com linhas válidas',
    async (kind) => {
      const assignments = kind === 'assignments'
      const errors = assignments ? 334 : 332
      const { api } = setup({
        assignments,
        allocations: !assignments,
        preview: {
          ...sample,
          creates: assignments ? 44 : 47,
          errors,
          total: assignments ? 378 : 379,
          totalPages: 16,
        },
      })
      if (assignments) {
        fireEvent.change(screen.getByLabelText('Ciclo para importar atribuições'), {
          target: { value: 'cycle-1' },
        })
        expect(screen.getByText('Questionário fictício de liderança')).toBeVisible()
      }
      fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
      const confirm = await screen.findByRole('button', {
        name: `Confirmar importação — ${errors} pendência(s)`,
      })
      expect(confirm).toBeDisabled()
      expect(confirm).toHaveAccessibleDescription(expect.stringContaining('lote inteiro válido'))
      expect(
        screen.getByText(assignments ? /Se faltar um questionário/ : /Se uma filial ou área/),
      ).toBeVisible()
      fireEvent.click(confirm)
      expect(api.confirmSpreadsheet).not.toHaveBeenCalled()
    },
  )

  it('libera a conferência ao sair da tela para não esgotar o limite por usuário', async () => {
    const { api, unmount } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    await screen.findByRole('button', { name: /Confirmar importação/ })
    unmount()
    expect(api.discardSpreadsheet).toHaveBeenCalledExactlyOnceWith('preview-1')
    expect(api.confirmSpreadsheet).not.toHaveBeenCalled()
  })

  it('descarta a resposta de conferência que chega depois de sair da tela', async () => {
    const { api, unmount } = setup()
    let resolve!: (preview: SpreadsheetImportPreview) => void
    vi.mocked(api.previewSpreadsheet).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    unmount()
    await act(async () => resolve(sample))
    expect(api.discardSpreadsheet).toHaveBeenCalledExactlyOnceWith('preview-1')
    expect(api.confirmSpreadsheet).not.toHaveBeenCalled()
  })

  it('aguarda confirmação em andamento antes de liberar a conferência ao sair', async () => {
    const { api, unmount } = setup()
    let resolve!: (result: { created: number; existing: number }) => void
    vi.mocked(api.confirmSpreadsheet).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar importação/ }))
    unmount()
    expect(api.discardSpreadsheet).not.toHaveBeenCalled()
    await act(async () => resolve({ created: 1, existing: 1 }))
    expect(api.discardSpreadsheet).toHaveBeenCalledExactlyOnceWith('preview-1')
    expect(api.confirmSpreadsheet).toHaveBeenCalledExactlyOnceWith('preview-1')
  })

  it('confere as cinco colunas de lotações sem exigir ciclo e grava somente após confirmar', async () => {
    const preview: SpreadsheetImportPreview = {
      ...sample,
      rows: [
        {
          ...sample.rows[0],
          allocation: {
            branch: 'Filial Exemplo',
            area: 'Área Exemplo',
            manager: 'Gestor Exemplo',
            startsOn: '15/09/2026',
          },
        },
      ],
    }
    const { api, file, imported, container } = setup({ allocations: true, preview })
    expect(screen.queryByLabelText('Ciclo para importar atribuições')).not.toBeInTheDocument()
    expect(screen.getByText(/colunas extras de dados serão ignoradas/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    const confirm = await screen.findByRole('button', { name: /Confirmar importação/ })
    expect(api.previewSpreadsheet).toHaveBeenCalledWith('allocations', file, undefined)
    for (const value of ['Filial Exemplo', 'Área Exemplo', 'Gestor Exemplo', '15/09/2026'])
      expect(screen.getByRole('cell', { name: value })).toBeVisible()
    expect(api.confirmSpreadsheet).not.toHaveBeenCalled()
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toHaveLength(0)
    fireEvent.click(confirm)
    await waitFor(() => expect(imported).toHaveBeenCalledOnce())
    expect(api.confirmSpreadsheet).toHaveBeenCalledExactlyOnceWith('preview-1')
  })

  it('mantém data inválida e conflito de lotação visíveis para correção, sem gravar', async () => {
    const preview: SpreadsheetImportPreview = {
      ...sample,
      creates: 0,
      existing: 0,
      errors: 2,
      rows: [
        {
          ...sample.rows[0],
          status: 'ERROR',
          message: 'Informe Início da Lotação como data válida.',
          allocation: { branch: '', area: '', manager: '', startsOn: '31/02/2026' },
        },
        {
          ...sample.rows[1],
          status: 'ERROR',
          message: 'Existe uma lotação que coincide com o período informado.',
        },
      ],
    }
    const { api } = setup({ allocations: true, preview })
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    expect(await screen.findByRole('button', { name: /Confirmar importação/ })).toBeDisabled()
    expect(screen.getByRole('cell', { name: '31/02/2026' })).toBeVisible()
    expect(screen.getByText(/Existe uma lotação que coincide/)).toBeVisible()
    expect(api.confirmSpreadsheet).not.toHaveBeenCalled()
  })

  it('confere, apresenta existentes, confirma uma vez e atualiza a lista com retorno acessível', async () => {
    const { api, imported, busy, file, container } = setup()
    expect(api.previewSpreadsheet).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    const confirm = await screen.findByRole('button', {
      name: 'Confirmar importação de 1 registro(s)',
    })
    expect(api.previewSpreadsheet).toHaveBeenCalledWith('collaborators', file, undefined)
    expect(api.confirmSpreadsheet).not.toHaveBeenCalled()
    expect(screen.getByText(/2 registro\(s\): 1 novo/)).toBeVisible()
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toHaveLength(0)
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(imported).toHaveBeenCalledOnce())
    expect(api.confirmSpreadsheet).toHaveBeenCalledExactlyOnceWith('preview-1')
    expect(confirm).toBeDisabled()
    expect(busy.mock.calls).toEqual([[true], [false]])
    expect(screen.getByText(/Importação concluída:/)).toBeVisible()
  })

  it('bloqueia lote com pendências e invalida a conferência quando troca de arquivo', async () => {
    const { api } = setup({ preview: { ...sample, errors: 1, existing: 0 } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    expect(await screen.findByRole('button', { name: /Confirmar importação/ })).toBeDisabled()
    expect(screen.getByText(/Confirmação bloqueada: 1 registro/)).toBeVisible()
    fireEvent.change(screen.getByLabelText(/Planilha de/), {
      target: { files: [new File(['novo'], 'novo.xlsx')] },
    })
    expect(screen.queryByRole('button', { name: /Confirmar importação/ })).not.toBeInTheDocument()
    expect(api.discardSpreadsheet).toHaveBeenCalledWith('preview-1')
    expect(api.confirmSpreadsheet).not.toHaveBeenCalled()
  })

  it('exige ciclo nas atribuições, explica filial ignorada e invalida ao mudar o ciclo', async () => {
    const { api, file } = setup({ assignments: true })
    expect(screen.getByRole('button', { name: 'Conferir planilha' })).toBeDisabled()
    expect(screen.getByText(/Filial será desconsiderada/)).toBeVisible()
    fireEvent.change(screen.getByLabelText('Ciclo para importar atribuições'), {
      target: { value: 'cycle-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    await screen.findByRole('button', { name: /Confirmar importação/ })
    expect(api.previewSpreadsheet).toHaveBeenCalledWith('assignments', file, 'cycle-1')
    fireEvent.change(screen.getByLabelText('Ciclo para importar atribuições'), {
      target: { value: '' },
    })
    expect(screen.queryByRole('button', { name: /Confirmar importação/ })).not.toBeInTheDocument()
  })

  it('descarta conferência desatualizada e informa o motivo sem afirmar sucesso', async () => {
    const { api, imported } = setup({
      failure: new ApiError({ status: 409, code: 'IMPORT_STALE' }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar importação/ }))
    expect(await screen.findByText(/Os cadastros mudaram ou há pendências/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Confirmar importação/ })).not.toBeInTheDocument()
    expect(imported).not.toHaveBeenCalled()
    expect(api.discardSpreadsheet).toHaveBeenCalledWith('preview-1')
  })

  it('mantém o token para repetir após falha de rede e bloqueia arquivos fora do limite', async () => {
    const { api } = setup()
    vi.mocked(api.confirmSpreadsheet).mockRejectedValueOnce(new Error('network'))
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    const confirm = await screen.findByRole('button', { name: /Confirmar importação/ })
    fireEvent.click(confirm)
    await screen.findByText(/Não foi possível concluir/)
    fireEvent.click(confirm)
    await screen.findByText(/Importação concluída:/)
    expect(vi.mocked(api.confirmSpreadsheet).mock.calls).toEqual([['preview-1'], ['preview-1']])
    fireEvent.change(screen.getByLabelText(/Planilha de/), {
      target: { files: [new File(['x'], 'invalido.xls')] },
    })
    expect(screen.getByRole('button', { name: 'Conferir planilha' })).toBeDisabled()
    expect(screen.getByText(/Selecione um arquivo .xlsx de até 1 MB/)).toBeVisible()
    const large = new File([new Uint8Array(1_048_577)], 'grande.xlsx')
    fireEvent.change(screen.getByLabelText(/Planilha de/), { target: { files: [large] } })
    expect(screen.getByRole('button', { name: 'Conferir planilha' })).toBeDisabled()
  })

  it('consulta a próxima página com o token da prévia e trata sessão expirada', async () => {
    const { api, expired } = setup({
      preview: { ...sample, total: 26, totalPages: 2 },
      failure: new ApiError({ status: 401 }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Conferir planilha' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Próxima página' }))
    await waitFor(() => expect(api.getSpreadsheetPreview).toHaveBeenCalledWith('preview-1', 2))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar importação/ }))
    await waitFor(() => expect(expired).toHaveBeenCalledOnce())
  })
})

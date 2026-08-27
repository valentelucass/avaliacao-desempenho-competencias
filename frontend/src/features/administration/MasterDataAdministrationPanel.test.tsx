import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  ActiveAllocation,
  ActiveQuestionnaireAssignment,
  AdministrativeCollaborator,
  AdministrativeNamedResource,
  QuestionnaireAssignmentOption,
} from '../../api/contracts'
import { MasterDataAdministrationPanel } from './MasterDataAdministrationPanel'

describe('MasterDataAdministrationPanel', () => {
  it('carrega nomes autorizados e cria uma lotação usando seletores, sem UUID manual', async () => {
    const api = createApi()

    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(
      await screen.findByRole('button', { name: 'Desativar filial Matriz' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText('Matriz').find((element) => element.tagName === 'TD'),
    ).toHaveAttribute('data-label', 'Nome')
    expect(screen.getAllByText('Patrícia Avaliada').length).toBeGreaterThan(0)
    expect(screen.queryByText('branch-1')).not.toBeInTheDocument()
    expect(screen.queryByText('collaborator-1')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Colaborador da lotação'), {
      target: { value: 'collaborator-1' },
    })
    fireEvent.change(screen.getByLabelText('Filial', { exact: true }), {
      target: { value: 'branch-1' },
    })
    fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'area-1' } })
    fireEvent.change(screen.getByLabelText('Gestor informado'), {
      target: { value: 'Gestora responsável' },
    })
    fireEvent.change(screen.getByLabelText('Início da lotação'), {
      target: { value: '2026-08-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar lotação' }))

    await waitFor(() =>
      expect(api.createAllocation).toHaveBeenCalledWith({
        collaboratorId: 'collaborator-1',
        branchId: 'branch-1',
        areaId: 'area-1',
        managerText: 'Gestora responsável',
        startsOn: '2026-08-01',
      }),
    )
  })

  it('exige confirmação explícita antes de desativar uma filial', async () => {
    const api = createApi()

    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar filial Matriz' }))

    expect(api.deactivateBranch).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveClass('confirmation-dialog')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Confirmação necessária')

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desativação da filial' }))

    await waitFor(() => expect(api.deactivateBranch).toHaveBeenCalledWith('branch-1'))
    expect(
      await screen.findByText('Filial desativada. O histórico não foi removido.'),
    ).toBeInTheDocument()
  })

  it('isola, mantém o foco e restaura o acionador ao fechar uma confirmação por Escape', async () => {
    const api = createApi()

    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    const trigger = await screen.findByRole('button', { name: 'Desativar filial Matriz' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('alertdialog')
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    const confirm = screen.getByRole('button', { name: 'Confirmar desativação da filial' })

    expect(cancel).toHaveFocus()
    expect(trigger.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(trigger.closest('[aria-hidden="true"]')).toHaveProperty('inert', true)

    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(cancel).toHaveFocus()
    cancel.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(confirm).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(dialog).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('permite excluir definitivamente apenas a filial já desativada', async () => {
    const api = createApi({
      listBranches: vi.fn().mockResolvedValue([sampleBranch({ active: false })]),
    })

    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir filial Matriz' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('excluir permanentemente a filial')
    expect(api.deleteInactiveUnusedBranch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão definitiva da filial' }))

    await waitFor(() => expect(api.deleteInactiveUnusedBranch).toHaveBeenCalledWith('branch-1'))
  })

  it('pagina filiais e áreas em grupos independentes de cinco itens', async () => {
    const branches = Array.from({ length: 6 }, (_, index) =>
      sampleBranch({ id: `branch-${index + 1}`, name: `Filial ${index + 1}` }),
    )
    const areas = Array.from({ length: 6 }, (_, index) =>
      sampleArea({ id: `area-${index + 1}`, name: `Área ${index + 1}` }),
    )
    const api = createApi({
      listBranches: vi.fn().mockResolvedValue(branches),
      listAreas: vi.fn().mockResolvedValue(areas),
    })

    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    const branchesTable = await screen.findByRole('table', { name: 'Filiais cadastradas' })
    const areasTable = screen.getByRole('table', { name: 'Áreas cadastradas' })
    expect(await within(branchesTable).findByRole('cell', { name: 'Filial 5' })).toBeInTheDocument()
    expect(within(branchesTable).queryByRole('cell', { name: 'Filial 6' })).not.toBeInTheDocument()
    expect(within(areasTable).getByRole('cell', { name: 'Área 5' })).toBeInTheDocument()
    expect(within(areasTable).queryByRole('cell', { name: 'Área 6' })).not.toBeInTheDocument()
    expect(screen.getByText('Página 1 de 2 · 5 filiais exibidos')).toBeInTheDocument()

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Paginação de filiais' })).getByRole('button', {
        name: 'Próxima página',
      }),
    )

    expect(within(branchesTable).getByRole('cell', { name: 'Filial 6' })).toBeInTheDocument()
    expect(within(branchesTable).queryByRole('cell', { name: 'Filial 1' })).not.toBeInTheDocument()
    expect(branchesTable.querySelectorAll('.pagination-placeholder')).toHaveLength(4)
    expect(within(areasTable).getByRole('cell', { name: 'Área 5' })).toBeInTheDocument()
    expect(within(areasTable).queryByRole('cell', { name: 'Área 6' })).not.toBeInTheDocument()
  })

  it('exige a data na confirmação antes de encerrar uma lotação', async () => {
    const api = createApi()

    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Encerrar lotação de Patrícia Avaliada' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento da lotação' }))
    expect(
      await screen.findByText('Informe a data de encerramento da lotação.'),
    ).toBeInTheDocument()
    expect(api.closeAllocation).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Data de encerramento'), {
      target: { value: '2026-08-31' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento da lotação' }))

    await waitFor(() =>
      expect(api.closeAllocation).toHaveBeenCalledWith('allocation-1', { endsOn: '2026-08-31' }),
    )
  })

  it('atribui e revoga questionário por nomes, exigindo motivo na revogação', async () => {
    const assignment = sampleQuestionnaireAssignment()
    const api = createApi({
      listActiveQuestionnaireAssignments: vi.fn().mockResolvedValue([assignment]),
    })

    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    await screen.findByRole('option', { name: '2026.2 — Ciclo de avaliação 2026.2' })
    fireEvent.change(screen.getByLabelText('Ciclo em rascunho'), { target: { value: 'cycle-1' } })
    fireEvent.change(screen.getByLabelText('Colaborador para atribuição'), {
      target: { value: 'collaborator-1' },
    })
    const questionnaireOption = screen.getByRole('option', {
      name: 'Questionário de competências',
    }) as HTMLOptionElement
    fireEvent.change(screen.getByLabelText('Questionário aplicado ao ciclo'), {
      target: { value: questionnaireOption.value },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar atribuição' }))

    await waitFor(() =>
      expect(api.createQuestionnaireAssignment).toHaveBeenCalledWith({
        cycleId: 'cycle-1',
        collaboratorId: 'collaborator-1',
        cycleQuestionnaireId: 'cycle-questionnaire-1',
      }),
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Revogar atribuição de Patrícia Avaliada: 2026.2 — Ciclo de avaliação 2026.2 — Questionário de competências',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revogação da atribuição' }))
    expect(await screen.findByText('Informe o motivo da revogação.')).toBeInTheDocument()
    expect(api.revokeQuestionnaireAssignment).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Motivo da revogação'), {
      target: { value: 'Atribuição criada para o ciclo incorreto.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revogação da atribuição' }))

    await waitFor(() =>
      expect(api.revokeQuestionnaireAssignment).toHaveBeenCalledWith(assignment.id, {
        reason: 'Atribuição criada para o ciclo incorreto.',
      }),
    )
  })

  it('não consulta nem exibe operações de cadastro sem CADASTROS.GERIR', () => {
    const api = createApi()

    render(<MasterDataAdministrationPanel api={api} permissions={[]} onSessionExpired={vi.fn()} />)

    expect(api.listBranches).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Você não possui permissão para consultar ou gerir os cadastros de apoio.',
    )
    expect(screen.queryByRole('button', { name: 'Criar filial' })).not.toBeInTheDocument()
  })

  it('explica os pré-requisitos quando não há ciclo em rascunho para atribuição', async () => {
    const api = createApi({ listQuestionnaireAssignmentOptions: vi.fn().mockResolvedValue([]) })

    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(
      await screen.findByText(/primeiro crie um ciclo em rascunho e aplique/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Ciclo em rascunho')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Criar atribuição' })).toBeDisabled()
  })

  it('notifica a expiração de sessão ao falhar a leitura autorizada com 401', async () => {
    const onSessionExpired = vi.fn()
    const api = createApi({
      listBranches: vi.fn().mockRejectedValue(new ApiError({ status: 401 })),
    })

    render(
      <MasterDataAdministrationPanel
        api={api}
        permissions={['CADASTROS.GERIR']}
        onSessionExpired={onSessionExpired}
      />,
    )

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
  })
})

function createApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listBranches: vi.fn().mockResolvedValue([sampleBranch()]),
    listAreas: vi.fn().mockResolvedValue([sampleArea()]),
    listCollaborators: vi.fn().mockResolvedValue([sampleCollaborator()]),
    listActiveAllocations: vi.fn().mockResolvedValue([sampleAllocation()]),
    listActiveQuestionnaireAssignments: vi.fn().mockResolvedValue([]),
    listQuestionnaireAssignmentOptions: vi.fn().mockResolvedValue([sampleAssignmentOption()]),
    createBranch: vi.fn().mockResolvedValue({ id: 'created-branch' }),
    deactivateBranch: vi.fn().mockResolvedValue(undefined),
    deleteInactiveUnusedBranch: vi.fn().mockResolvedValue(undefined),
    createArea: vi.fn().mockResolvedValue({ id: 'created-area' }),
    deactivateArea: vi.fn().mockResolvedValue(undefined),
    createCollaborator: vi.fn().mockResolvedValue({ id: 'created-collaborator' }),
    deactivateCollaborator: vi.fn().mockResolvedValue(undefined),
    createAllocation: vi.fn().mockResolvedValue({ id: 'created-allocation' }),
    closeAllocation: vi.fn().mockResolvedValue(undefined),
    createQuestionnaireAssignment: vi.fn().mockResolvedValue({ id: 'created-assignment' }),
    revokeQuestionnaireAssignment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ApiClient
}

function sampleBranch(
  overrides: Partial<AdministrativeNamedResource> = {},
): AdministrativeNamedResource {
  return { id: 'branch-1', name: 'Matriz', active: true, ...overrides }
}

function sampleArea(
  overrides: Partial<AdministrativeNamedResource> = {},
): AdministrativeNamedResource {
  return { id: 'area-1', name: 'Operações', active: true, ...overrides }
}

function sampleCollaborator(
  overrides: Partial<AdministrativeCollaborator> = {},
): AdministrativeCollaborator {
  return { id: 'collaborator-1', displayName: 'Patrícia Avaliada', active: true, ...overrides }
}

function sampleAllocation(overrides: Partial<ActiveAllocation> = {}): ActiveAllocation {
  return {
    id: 'allocation-1',
    collaboratorId: 'collaborator-1',
    branchId: 'branch-1',
    areaId: 'area-1',
    managerText: 'Gestora atual',
    startsOn: '2026-01-10',
    ...overrides,
  }
}

function sampleAssignmentOption(
  overrides: Partial<QuestionnaireAssignmentOption> = {},
): QuestionnaireAssignmentOption {
  return {
    cycleId: 'cycle-1',
    cycleCode: '2026.2',
    cycleName: 'Ciclo de avaliação 2026.2',
    questionnaires: [
      { cycleQuestionnaireId: 'cycle-questionnaire-1', title: 'Questionário de competências' },
    ],
    ...overrides,
  }
}

function sampleQuestionnaireAssignment(
  overrides: Partial<ActiveQuestionnaireAssignment> = {},
): ActiveQuestionnaireAssignment {
  return {
    id: 'assignment-1',
    cycleId: 'cycle-1',
    cycleCode: '2026.2',
    cycleName: 'Ciclo de avaliação 2026.2',
    collaboratorId: 'collaborator-1',
    cycleQuestionnaireId: 'cycle-questionnaire-1',
    questionnaireTitle: 'Questionário de competências',
    ...overrides,
  }
}

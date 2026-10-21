import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../api/client'
import { ApiError } from '../../api/client'
import type {
  ApprovedQuestionnaireVersion,
  AppliedCycleQuestionnaire,
  DraftCycleConfiguration,
  EvaluationCycle,
  EvaluationCycleAdministrationConfiguration,
} from '../../api/contracts'
import { CycleAdministrationPanel } from './CycleAdministrationPanel'

describe('CycleAdministrationPanel', () => {
  it('prorroga somente o encerramento usando a data esperada do detalhe e recarrega a vigência', async () => {
    const oldConfiguration = sampleConfiguration()
    const updatedConfiguration = sampleConfiguration({
      closingAtLocal: '2026-12-31T23:59',
      closingAt: '2027-01-01T02:59:00Z',
      windowStatus: 'VIGENTE',
    })
    const api = createApi({
      listAllCycles: vi
        .fn()
        .mockResolvedValueOnce([
          sampleCycle({
            status: 'ABERTO',
            closingAt: '2026-10-01T00:00:00Z',
            windowStatus: 'PRAZO_ENCERRADO',
          }),
        ])
        .mockResolvedValue([
          sampleCycle({
            status: 'ABERTO',
            closingAt: updatedConfiguration.closingAt,
            windowStatus: 'VIGENTE',
          }),
        ]),
      getEvaluationCycleAdministrationConfiguration: vi
        .fn()
        .mockResolvedValueOnce(oldConfiguration)
        .mockResolvedValue(updatedConfiguration),
    })
    const confirmation = vi.spyOn(window, 'confirm')
    try {
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
      await screen.findByRole('form', { name: 'Prorrogar encerramento' })
      expect(
        screen.getByText('Encerramento atual: 16/10/2026, 23:59 (Brasília).'),
      ).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Novo encerramento (Brasília)'), {
        target: { value: '2026-12-31T23:59' },
      })
      fireEvent.change(screen.getByLabelText('Motivo da prorrogação'), {
        target: { value: '  Prazo ampliado para concluir o ciclo.  ' },
      })
      expect(
        screen.getByText('Novo encerramento: 31/12/2026, 23:59 (Brasília).'),
      ).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Prorrogar encerramento' }))
      expect(
        await screen.findByText(
          'Encerramento prorrogado. A vigência e a configuração foram atualizadas.',
        ),
      ).toBeInTheDocument()
      expect(api.extendEvaluationCycleClosing).toHaveBeenCalledExactlyOnceWith('cycle-draft-1', {
        closingAtLocal: '2026-12-31T23:59',
        expectedClosingAt: '2026-10-17T02:59:00Z',
        reason: 'Prazo ampliado para concluir o ciclo.',
      })
      expect(api.listAllCycles).toHaveBeenCalledTimes(2)
      expect(api.getEvaluationCycleAdministrationConfiguration).toHaveBeenCalledTimes(2)
      expect(screen.getByLabelText('Encerramento')).toHaveValue('2026-12-31T23:59')
      expect(screen.getByLabelText('Nome do ciclo')).toHaveValue(oldConfiguration.name)
      expect(screen.getByLabelText('Permitir autoavaliação neste ciclo')).toBeChecked()
      expect(screen.getByLabelText('Encerramento')).toBeDisabled()
      expect(screen.getByText('Aberto', { selector: '.status-badge' })).toBeInTheDocument()
      expect(screen.getByLabelText('Novo encerramento (Brasília)')).toHaveValue('')
      expect(confirmation).not.toHaveBeenCalled()
      expect(api.replaceEvaluationCycle).not.toHaveBeenCalled()
      expect(api.closeEvaluationCycle).not.toHaveBeenCalled()
    } finally {
      confirmation.mockRestore()
    }
  })

  it.each([
    ['RASCUNHO', '2026-10-17T02:59:00Z'],
    ['ENCERRADO', '2026-10-17T02:59:00Z'],
    ['ABERTO', undefined],
    ['ABERTO', null],
    ['ABERTO', 'data-invalida'],
  ])(
    'não oferece prorrogação para %s sem um prazo autoritativo válido (%s)',
    async (status, closingAt) => {
      const api = createApi({
        listAllCycles: vi.fn().mockResolvedValue([sampleCycle({ status: status as string })]),
        getEvaluationCycleAdministrationConfiguration: vi
          .fn()
          .mockResolvedValue(sampleConfiguration({ status: status as string, closingAt })),
      })
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      fireEvent.click(
        await screen.findByRole('button', {
          name: status === 'RASCUNHO' ? 'Configurar' : 'Consultar',
        }),
      )
      await screen.findByRole('button', { name: 'Visualizar questionário aplicado 1' })
      expect(screen.queryByRole('form', { name: 'Prorrogar encerramento' })).toBeNull()
    },
  )

  it.each([
    [
      '',
      'Motivo correto da prorrogação.',
      'Informe um novo encerramento posterior ao prazo atual.',
    ],
    [
      '2026-10-16T23:59',
      'Motivo correto da prorrogação.',
      'Informe um novo encerramento posterior ao prazo atual.',
    ],
    [
      '2026-10-15T23:59',
      'Motivo correto da prorrogação.',
      'Informe um novo encerramento posterior ao prazo atual.',
    ],
    ['2026-12-31T23:59', 'curto', 'Informe um motivo entre 10 e 500 caracteres.'],
  ])(
    'valida nova data e motivo antes de enviar a prorrogação (%s)',
    async (closingAtLocal, reason, message) => {
      const api = createApi({
        listAllCycles: vi.fn().mockResolvedValue([sampleCycle({ status: 'ABERTO' })]),
        getEvaluationCycleAdministrationConfiguration: vi
          .fn()
          .mockResolvedValue(sampleConfiguration()),
      })
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
      await screen.findByRole('form', { name: 'Prorrogar encerramento' })
      fireEvent.change(screen.getByLabelText('Novo encerramento (Brasília)'), {
        target: { value: closingAtLocal },
      })
      fireEvent.change(screen.getByLabelText('Motivo da prorrogação'), {
        target: { value: reason },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Prorrogar encerramento' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(api.extendEvaluationCycleClosing).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['CYCLE_EXTENSION_CONFLICT', 'O ciclo foi alterado ou não está mais aberto.'],
    ['CYCLE_EXTENSION_NOT_FUTURE', 'posterior ao prazo atual e ao horário atual de Brasília'],
  ])(
    'preserva os dados e informa o conflito %s sem repetir a escrita',
    async (reasonCode, message) => {
      const api = createApi({
        listAllCycles: vi.fn().mockResolvedValue([sampleCycle({ status: 'ABERTO' })]),
        getEvaluationCycleAdministrationConfiguration: vi
          .fn()
          .mockResolvedValue(sampleConfiguration()),
        extendEvaluationCycleClosing: vi
          .fn()
          .mockRejectedValue(
            new ApiError({ status: 409, reasonCode, requestId: 'extension-conflict' }),
          ),
      })
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
      await screen.findByRole('form', { name: 'Prorrogar encerramento' })
      fillExtension()
      fireEvent.click(screen.getByRole('button', { name: 'Prorrogar encerramento' }))
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(message)
      expect(alert).toHaveTextContent('Referência: extension-conflict.')
      expect(screen.getByLabelText('Encerramento')).toHaveValue('2026-10-16T23:59')
      expect(screen.getByLabelText('Novo encerramento (Brasília)')).toHaveValue('2026-12-31T23:59')
      expect(api.extendEvaluationCycleClosing).toHaveBeenCalledTimes(1)
      expect(api.getEvaluationCycleAdministrationConfiguration).toHaveBeenCalledTimes(1)
    },
  )

  it('bloqueia envio duplicado e mudança de ciclo durante a prorrogação', async () => {
    let fail!: (reason: Error) => void
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([sampleCycle({ status: 'ABERTO' })]),
      getEvaluationCycleAdministrationConfiguration: vi
        .fn()
        .mockResolvedValue(sampleConfiguration()),
      extendEvaluationCycleClosing: vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject
          }),
      ),
    })
    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
    const extensionForm = await screen.findByRole('form', { name: 'Prorrogar encerramento' })
    fillExtension()
    fireEvent.submit(extensionForm)
    fireEvent.submit(extensionForm)
    expect(api.extendEvaluationCycleClosing).toHaveBeenCalledTimes(1)
    expect(extensionForm).toHaveAttribute('aria-busy', 'true')
    for (const name of ['Novo ciclo', 'Consultar', 'Atualizar', 'Encerrar ciclo', 'Prorrogando…']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    await act(async () => fail(new ApiError({ status: 503, code: 'UNAVAILABLE' })))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prorrogar encerramento' })).toBeEnabled()
    expect(screen.getByLabelText('Novo encerramento (Brasília)')).toHaveValue('2026-12-31T23:59')
  })

  it('não recarrega ou altera outra tela quando a prorrogação termina após sair do painel', async () => {
    let finish!: () => void
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([sampleCycle({ status: 'ABERTO' })]),
      getEvaluationCycleAdministrationConfiguration: vi
        .fn()
        .mockResolvedValue(sampleConfiguration()),
      extendEvaluationCycleClosing: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      ),
    })
    const rendered = render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
    await screen.findByRole('form', { name: 'Prorrogar encerramento' })
    fillExtension()
    fireEvent.click(screen.getByRole('button', { name: 'Prorrogar encerramento' }))
    rendered.unmount()
    await act(async () => finish())
    expect(api.listAllCycles).toHaveBeenCalledTimes(1)
    expect(api.getEvaluationCycleAdministrationConfiguration).toHaveBeenCalledTimes(1)
  })

  it('mostra a vigência informada pelo servidor e as datas em Brasília', async () => {
    const cycle = sampleCycle({
      status: 'ABERTO',
      openingAt: '2026-09-16T17:00:00Z',
      closingAt: '2026-10-17T02:59:00Z',
      windowStatus: 'PRAZO_ENCERRADO',
    })
    const api = createApi({ listAllCycles: vi.fn().mockResolvedValue([cycle]) })
    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(
      await screen.findByText('Aberto — prazo encerrado', { selector: '.status-badge' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Abertura: 16\/09\/2026, 14:00/)).toHaveTextContent(
      'Encerramento: 16/10/2026, 23:59 (Brasília).',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))
    expect(await screen.findByText(/Prazo encerrado para criar avaliações/)).toHaveTextContent(
      'Abertura: 01/09/2026, 00:00. Encerramento: 16/09/2026, 00:00 (Brasília).',
    )
  })

  it.each(['VIGENTE', 'AGUARDANDO_ABERTURA', 'SEM_JANELA'] as const)(
    'não deduz o vencimento no navegador quando o servidor informa %s',
    async (windowStatus) => {
      const api = createApi({
        listAllCycles: vi
          .fn()
          .mockResolvedValue([
            sampleCycle({ status: 'ABERTO', windowStatus, closingAt: '2000-01-01T00:00:00Z' }),
          ]),
      })
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      expect(await screen.findByText('Aberto', { selector: '.status-badge' })).toBeInTheDocument()
      expect(screen.queryByText('Aberto — prazo encerrado')).toBeNull()
    },
  )

  it.each([403, 404, 503])(
    'não apresenta valores falsos quando a consulta retorna HTTP %s e permite tentar novamente',
    async (status) => {
      const api = createApi({
        listAllCycles: vi.fn().mockResolvedValue([sampleCycle({ status: 'ABERTO' })]),
        getEvaluationCycleAdministrationConfiguration: vi
          .fn()
          .mockRejectedValueOnce(
            new ApiError({ status, code: 'UNAVAILABLE', requestId: 'cycle-read' }),
          )
          .mockResolvedValue({
            ...sampleDraft(),
            status: 'ABERTO',
            windowStatus: 'PRAZO_ENCERRADO',
          }),
      })
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Referência: cycle-read.')
      expect(screen.queryByLabelText('Código do ciclo')).toBeNull()
      expect(screen.queryByLabelText('Permitir autoavaliação neste ciclo')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Encerrar ciclo' })).toBeNull()
      expect(screen.getByText(/A configuração não foi carregada/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))
      await waitFor(() => expect(screen.getByLabelText('Código do ciclo')).toHaveValue('2026.2'))
      expect(screen.queryByRole('alert')).toBeNull()
    },
  )

  it('informa uma janela incompleta preservando a data real disponível', async () => {
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([sampleCycle({ status: 'ENCERRADO' })]),
      getEvaluationCycleAdministrationConfiguration: vi.fn().mockResolvedValue({
        ...sampleDraft(),
        openingAtLocal: null,
        closingAtLocal: '2026-10-16T23:59:00',
        status: 'ENCERRADO',
        windowStatus: 'SEM_JANELA',
      }),
    })
    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
    expect(await screen.findByText(/Período não configurado/)).toHaveTextContent(
      'Abertura: Não configurada. Encerramento: 16/10/2026, 23:59 (Brasília).',
    )
    expect(screen.getByLabelText('Abertura')).toHaveValue('')
    expect(screen.getByLabelText('Encerramento')).toHaveValue('2026-10-16T23:59')
  })

  it('informa sessão expirada sem apresentar dados de um ciclo não carregado', async () => {
    const onSessionExpired = vi.fn()
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([sampleCycle({ status: 'ABERTO' })]),
      getEvaluationCycleAdministrationConfiguration: vi
        .fn()
        .mockRejectedValue(new ApiError({ status: 401 })),
    })
    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={onSessionExpired}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce())
    expect(screen.queryByLabelText('Código do ciclo')).toBeNull()
  })

  it('descarta o questionário antigo quando outro ciclo é selecionado', async () => {
    let finish!: (value: AppliedCycleQuestionnaire) => void
    const cycles = [
      sampleCycle({ status: 'ABERTO' }),
      sampleCycle({ id: 'cycle-2', name: 'Segundo ciclo', status: 'ENCERRADO' }),
    ]
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue(cycles),
      getEvaluationCycleAdministrationConfiguration: vi
        .fn()
        .mockResolvedValueOnce({ ...sampleDraft(), status: 'ABERTO', windowStatus: 'VIGENTE' })
        .mockResolvedValueOnce({
          ...sampleDraft({ cycleId: 'cycle-2', name: 'Segundo ciclo' }),
          status: 'ENCERRADO',
          windowStatus: 'PRAZO_ENCERRADO',
        }),
      getAppliedCycleQuestionnaire: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      ),
    })
    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
    fireEvent.click((await screen.findAllByRole('button', { name: 'Consultar' }))[0])
    fireEvent.click(
      await screen.findByRole('button', { name: 'Visualizar questionário aplicado 1' }),
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[1])
    await screen.findByRole('form', { name: 'Configuração: Segundo ciclo' })
    await act(async () => finish(sampleAppliedQuestionnaire()))
    expect(screen.queryByText('Conduz atividades com responsabilidade?')).toBeNull()
    expect(screen.getByRole('form', { name: 'Configuração: Segundo ciclo' })).toBeInTheDocument()
  })

  it('oculta os campos durante a consulta e descarta a resposta após iniciar um novo ciclo', async () => {
    let finish!: (value: EvaluationCycleAdministrationConfiguration) => void
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([sampleCycle({ status: 'ABERTO' })]),
      getEvaluationCycleAdministrationConfiguration: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      ),
    })
    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
    expect(screen.getByText('Carregando configuração do ciclo…')).toBeInTheDocument()
    expect(screen.queryByLabelText('Código do ciclo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }))
    await act(async () =>
      finish({ ...sampleDraft(), status: 'ABERTO', windowStatus: 'PRAZO_ENCERRADO' }),
    )
    expect(screen.getByRole('form', { name: 'Novo ciclo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Código do ciclo')).toHaveValue('')
    expect(screen.getByLabelText('Permitir autoavaliação neste ciclo')).not.toBeChecked()
    expect(screen.queryByText('Carregando configuração do ciclo…')).toBeNull()
  })

  it.each(['success', 'failure'])(
    'descarta uma resposta %s do ciclo anterior após selecionar outro ciclo',
    async (result) => {
      let finish!: (value: EvaluationCycleAdministrationConfiguration) => void
      let fail!: (reason: Error) => void
      const cycles = [
        sampleCycle({ status: 'ABERTO' }),
        sampleCycle({ id: 'cycle-2', name: 'Segundo ciclo', status: 'ENCERRADO' }),
      ]
      const api = createApi({
        listAllCycles: vi.fn().mockResolvedValue(cycles),
        getEvaluationCycleAdministrationConfiguration: vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise((resolve, reject) => {
                finish = resolve
                fail = reject
              }),
          )
          .mockResolvedValue({
            ...sampleDraft({ cycleId: 'cycle-2', code: 'SEGUNDO', name: 'Segundo ciclo' }),
            status: 'ENCERRADO',
            windowStatus: 'PRAZO_ENCERRADO',
          }),
      })
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      fireEvent.click((await screen.findAllByRole('button', { name: 'Consultar' }))[0])
      fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[1])
      await waitFor(() => expect(screen.getByLabelText('Código do ciclo')).toHaveValue('SEGUNDO'))
      await act(async () => {
        if (result === 'success')
          finish({ ...sampleDraft(), status: 'ABERTO', windowStatus: 'PRAZO_ENCERRADO' })
        else fail(new ApiError({ status: 503, code: 'UNAVAILABLE' }))
      })
      expect(screen.getByLabelText('Código do ciclo')).toHaveValue('SEGUNDO')
      expect(screen.getByRole('form', { name: 'Configuração: Segundo ciclo' })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).toBeNull()
    },
  )

  it.each(['ABERTO', 'ENCERRADO'])(
    'consulta os valores e questionários reais de um ciclo %s sem permitir edição',
    async (status) => {
      const cycle = sampleCycle({ status })
      const api = createApi({
        listAllCycles: vi.fn().mockResolvedValue([cycle]),
        getEvaluationCycleAdministrationConfiguration: vi.fn().mockResolvedValue({
          ...sampleDraft(),
          status,
          windowStatus: 'PRAZO_ENCERRADO',
        }),
      })

      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )

      fireEvent.click(await screen.findByRole('button', { name: 'Consultar' }))
      await waitFor(() => expect(screen.getByLabelText('Código do ciclo')).toHaveValue('2026.2'))
      expect(screen.getByLabelText('Nome do ciclo')).toHaveValue(cycle.name)
      expect(screen.getByLabelText('Abertura')).toHaveValue('2026-09-01T00:00')
      expect(screen.getByLabelText('Encerramento')).toHaveValue('2026-09-16T00:00')
      expect(screen.getByLabelText('Fuso horário')).toHaveValue('America/Sao_Paulo')
      expect(screen.getByLabelText('Permitir autoavaliação neste ciclo')).toBeChecked()
      for (const label of [
        'Código do ciclo',
        'Nome do ciclo',
        'Abertura',
        'Encerramento',
        'Fuso horário',
        'Permitir autoavaliação neste ciclo',
      ]) {
        expect(screen.getByLabelText(label)).toBeDisabled()
      }
      expect(api.getEvaluationCycleAdministrationConfiguration).toHaveBeenCalledWith(cycle.id)
      expect(api.getEvaluationCycleAdministrationDraft).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Salvar configuração' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Criar ciclo' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Abrir ciclo' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Visualizar questionário aplicado 1' }))
      expect(await screen.findByText('Conduz atividades com responsabilidade?')).toBeInTheDocument()
      expect(api.replaceEvaluationCycle).not.toHaveBeenCalled()
      expect(api.openEvaluationCycle).not.toHaveBeenCalled()
      expect(api.closeEvaluationCycle).not.toHaveBeenCalled()
    },
  )

  it('cria o ciclo com as datas e a autoavaliação informadas pelo gestor', async () => {
    const api = createApi({
      createEvaluationCycle: vi.fn().mockResolvedValue({
        cycleId: 'cycle-created',
        questionnaires: [
          {
            cycleQuestionnaireId: 'cycle-questionnaire-created',
            questionnaireVersionId: 'questionnaire-version-1',
          },
        ],
      }),
    })

    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    await screen.findByRole('checkbox', {
      name: 'MEDIA_SIMPLES_2024_1 v1 · GERAL v1',
    })
    fireEvent.change(screen.getByLabelText('Código do ciclo'), { target: { value: '2026' } })
    fireEvent.change(screen.getByLabelText('Nome do ciclo'), {
      target: { value: 'Avaliação de Desempenho 2026' },
    })
    fireEvent.change(screen.getByLabelText('Abertura'), {
      target: { value: '2026-09-16T14:00' },
    })
    fireEvent.change(screen.getByLabelText('Encerramento'), {
      target: { value: '2026-10-16T23:59' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'MEDIA_SIMPLES_2024_1 v1 · GERAL v1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Permitir autoavaliação neste ciclo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar ciclo' }))

    await waitFor(() =>
      expect(api.createEvaluationCycle).toHaveBeenCalledWith({
        code: '2026',
        configuration: {
          name: 'Avaliação de Desempenho 2026',
          openingAtLocal: '2026-09-16T14:00',
          closingAtLocal: '2026-10-16T23:59',
          timeZone: 'America/Sao_Paulo',
          selfAssessmentEnabled: true,
          questionnaires: [
            {
              questionnaireVersionId: 'questionnaire-version-1',
              calculationConfigurationVersionId: 'calculation-version-1',
              classificationMatrixVersionId: 'matrix-version-1',
            },
          ],
        },
      }),
    )
    expect(
      await screen.findByText('Ciclo criado como rascunho. Revise-o antes de abrir.'),
    ).toBeInTheDocument()
  })

  it('carrega e atualiza a configuração de um ciclo em rascunho', async () => {
    const cycle = sampleCycle()
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([cycle]),
      getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
    })

    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
    await screen.findByText('O rascunho selecionado contém 1 questionário(s) aplicado(s).')
    fireEvent.change(screen.getByLabelText('Nome do ciclo'), {
      target: { value: 'Ciclo de avaliação revisado' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }))

    await waitFor(() =>
      expect(api.replaceEvaluationCycle).toHaveBeenCalledWith('cycle-draft-1', {
        configuration: {
          name: 'Ciclo de avaliação revisado',
          openingAtLocal: '2026-09-01T00:00',
          closingAtLocal: '2026-09-16T00:00',
          timeZone: 'America/Sao_Paulo',
          selfAssessmentEnabled: true,
          questionnaires: [
            {
              questionnaireVersionId: 'questionnaire-version-1',
              calculationConfigurationVersionId: 'calculation-version-1',
              classificationMatrixVersionId: 'matrix-version-1',
            },
          ],
        },
      }),
    )
  })

  it.each([
    ['Nome do ciclo', 'name', 'Ciclo de avaliação revisado'],
    ['Fuso horário', 'timeZone', 'America/Manaus'],
    ['Abertura', 'openingAtLocal', '2026-09-02T08:00'],
    ['Encerramento', 'closingAtLocal', '2026-11-01T18:00'],
    ['Permitir autoavaliação neste ciclo', 'selfAssessmentEnabled', false],
  ] as const)(
    'preserva %s se o DOM for restaurado antes de processar o estado pendente',
    async (label, field, value) => {
      vi.useFakeTimers()
      const api = createApi({ listAllCycles: vi.fn().mockResolvedValue([sampleCycle()]) })

      try {
        await act(async () => {
          render(
            // Restaura o DOM ainda no evento, antes de React processar o updater.
            <div onChange={(event) => (event.target as HTMLInputElement).form?.reset()}>
              <CycleAdministrationPanel
                api={api}
                permissions={['CICLOS.GERIR']}
                onSessionExpired={vi.fn()}
              />
            </div>,
          )
        })
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Configurar' }))
        })

        const input = screen.getByLabelText(label)
        act(() => {
          // O destaque e a edição ficam no mesmo lote, antes do próximo render.
          vi.advanceTimersByTime(380)
          if (typeof value === 'boolean') {
            fireEvent.click(input)
          } else {
            fireEvent.change(input, { target: { value } })
          }
        })

        if (typeof value === 'boolean') {
          expect(input).not.toBeChecked()
        } else {
          expect(input).toHaveValue(value)
        }
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }))
        })
        if (field === 'timeZone') {
          expect(api.replaceEvaluationCycle).not.toHaveBeenCalled()
          expect(screen.getByRole('alert')).toBeInTheDocument()
        } else {
          expect(api.replaceEvaluationCycle).toHaveBeenCalledWith('cycle-draft-1', {
            configuration: expect.objectContaining({ [field]: value }),
          })
        }
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.each(['2026-09-16T14:00', '2026-09-15T23:59'])(
    'impede encerramento %s igual ou anterior à abertura sem chamar a API',
    async (closing) => {
      const api = createApi()
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      await screen.findByRole('checkbox', { name: 'MEDIA_SIMPLES_2024_1 v1 · GERAL v1' })
      fireEvent.change(screen.getByLabelText('Código do ciclo'), { target: { value: '2026' } })
      fireEvent.change(screen.getByLabelText('Nome do ciclo'), {
        target: { value: 'Ciclo fictício' },
      })
      fireEvent.change(screen.getByLabelText('Abertura'), { target: { value: '2026-09-16T14:00' } })
      fireEvent.change(screen.getByLabelText('Encerramento'), { target: { value: closing } })
      fireEvent.click(screen.getByRole('checkbox', { name: 'MEDIA_SIMPLES_2024_1 v1 · GERAL v1' }))
      fireEvent.click(screen.getByRole('button', { name: 'Criar ciclo' }))
      expect(screen.getByRole('alert')).toHaveTextContent(
        'O encerramento deve ocorrer depois da abertura.',
      )
      expect(api.createEvaluationCycle).not.toHaveBeenCalled()
    },
  )

  it('leva até o painel em linha ao consultar, configurar ou iniciar um ciclo', async () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    const draftCycle = sampleCycle()
    const openCycle = sampleCycle({ id: 'cycle-open-1', name: 'Ciclo aberto', status: 'ABERTO' })
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([draftCycle, openCycle]),
      getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
      getEvaluationCycleAdministrationConfiguration: vi.fn().mockResolvedValue({
        ...sampleDraft({ cycleId: openCycle.id, name: openCycle.name }),
        status: 'ABERTO',
        windowStatus: 'VIGENTE',
      }),
    })

    try {
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )

      fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
      const configurationPanel = await screen.findByRole('form', {
        name: 'Configuração: Ciclo de avaliação 2026.2',
      })
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }),
      )
      expect(configurationPanel).toHaveFocus()
      await waitFor(() => expect(configurationPanel).toHaveClass('inline-panel-focus--highlighted'))
      expect(screen.getByLabelText('Código do ciclo').closest('.field')).toHaveClass(
        'field--inline-reveal',
      )
      expect(screen.getByLabelText('Nome do ciclo').closest('.field')).toHaveClass(
        'field--inline-reveal',
      )
      expect(screen.getByRole('group', { name: 'Questionários aplicados' })).toHaveClass(
        'fieldset--inline-reveal',
      )
      expect(document.querySelector('.cycle-questionnaire-table tbody tr')).toHaveClass(
        'cycle-questionnaire-table__row--inline-reveal',
      )

      fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))
      await screen.findByRole('form', { name: 'Configuração: Ciclo aberto' })
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2))
      expect(screen.getByLabelText('Abertura')).toBeDisabled()
      expect(screen.getByLabelText('Encerramento')).toBeDisabled()
      expect(screen.getByLabelText('Fuso horário')).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }))
      await screen.findByRole('form', { name: 'Novo ciclo' })
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(3))
      await waitFor(() =>
        expect(screen.getByLabelText('Código do ciclo').closest('.field')).toHaveClass(
          'field--inline-reveal',
        ),
      )
      expect(screen.getByLabelText('Nome do ciclo').closest('.field')).not.toHaveClass(
        'field--inline-reveal',
      )
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
    }
  })

  it('mantém rótulos de dados nos ciclos para a apresentação móvel', async () => {
    const api = createApi({ listAllCycles: vi.fn().mockResolvedValue([sampleCycle()]) })

    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    const cells = (await screen.findByRole('button', { name: 'Configurar' }))
      .closest('tr')
      ?.querySelectorAll('td')

    expect(cells).toHaveLength(3)
    expect(cells?.[0]).toHaveAttribute('data-label', 'Ciclo')
    expect(cells?.[1]).toHaveAttribute('data-label', 'Situação')
    expect(cells?.[2]).toHaveAttribute('data-label', 'Ação')
  })

  it('pede confirmação antes de abrir o ciclo em rascunho', async () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const cycle = sampleCycle()
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([cycle]),
      getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
    })

    try {
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )

      fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Abrir ciclo' }))

      expect(confirmation).toHaveBeenCalledWith(
        'Confirma abrir o ciclo “Ciclo de avaliação 2026.2”?',
      )
      await waitFor(() => expect(api.openEvaluationCycle).toHaveBeenCalledWith('cycle-draft-1'))
      expect(await screen.findByText('Ciclo aberto.')).toBeInTheDocument()
    } finally {
      confirmation.mockRestore()
    }
  })

  it('explica abertura futura sem alterar o rascunho nem repetir a escrita', async () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([sampleCycle()]),
      openEvaluationCycle: vi.fn().mockRejectedValue(
        new ApiError({
          status: 409,
          reasonCode: 'CYCLE_OPENING_NOT_REACHED',
          requestId: 'cycle-future-1',
        }),
      ),
    })
    try {
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
      await screen.findByText('O rascunho selecionado contém 1 questionário(s) aplicado(s).')
      fireEvent.click(screen.getByRole('button', { name: 'Abrir ciclo' }))
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('ainda não chegou à data e ao horário de abertura salvos')
      expect(alert).toHaveTextContent('Referência: cycle-future-1.')
      expect(api.openEvaluationCycle).toHaveBeenCalledTimes(1)
      expect(api.replaceEvaluationCycle).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Abertura')).toHaveValue('2026-09-01T00:00')
      expect(screen.getByRole('button', { name: 'Salvar configuração' })).toBeEnabled()
      expect(screen.queryByText('Ciclo aberto.')).not.toBeInTheDocument()
    } finally {
      confirmation.mockRestore()
    }
  })

  it('consulta em modo somente leitura o questionário aplicado ao ciclo', async () => {
    const cycle = sampleCycle()
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([cycle]),
      getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
      getAppliedCycleQuestionnaire: vi.fn().mockResolvedValue(sampleAppliedQuestionnaire()),
    })

    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Visualizar questionário aplicado 1' }),
    )

    await waitFor(() =>
      expect(api.getAppliedCycleQuestionnaire).toHaveBeenCalledWith(
        'cycle-draft-1',
        'cycle-questionnaire-1',
      ),
    )
    expect(
      await screen.findByRole('heading', { name: 'Equipe 2026.2 · versão 1' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Conduz atividades com responsabilidade?')).toBeInTheDocument()
    expect(screen.getByText('Resposta obrigatória')).toBeInTheDocument()
  })

  it('não consulta nem exibe controles sem CICLOS.GERIR', () => {
    const api = createApi()

    render(<CycleAdministrationPanel api={api} permissions={[]} onSessionExpired={vi.fn()} />)

    expect(api.listAllCycles).not.toHaveBeenCalled()
    expect(api.listApprovedQuestionnaireVersions).not.toHaveBeenCalled()
    expect(api.createEvaluationCycle).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Criar ciclo' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Você não possui permissão para administrar ciclos de avaliação.',
    )
  })
})

function createApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAllCycles: vi.fn().mockResolvedValue([]),
    listApprovedQuestionnaireVersions: vi.fn().mockResolvedValue([sampleApprovedVersion()]),
    getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
    getEvaluationCycleAdministrationConfiguration: vi.fn().mockResolvedValue({
      ...sampleDraft(),
      status: 'ABERTO',
      windowStatus: 'PRAZO_ENCERRADO',
    }),
    getAppliedCycleQuestionnaire: vi.fn().mockResolvedValue(sampleAppliedQuestionnaire()),
    createEvaluationCycle: vi.fn(),
    replaceEvaluationCycle: vi.fn().mockResolvedValue(undefined),
    openEvaluationCycle: vi.fn().mockResolvedValue(undefined),
    closeEvaluationCycle: vi.fn().mockResolvedValue(undefined),
    extendEvaluationCycleClosing: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ApiClient
}

function sampleCycle(overrides: Partial<EvaluationCycle> = {}): EvaluationCycle {
  return {
    id: 'cycle-draft-1',
    name: 'Ciclo de avaliação 2026.2',
    status: 'RASCUNHO',
    ...overrides,
  }
}

function sampleConfiguration(
  overrides: Partial<EvaluationCycleAdministrationConfiguration> = {},
): EvaluationCycleAdministrationConfiguration {
  return {
    ...sampleDraft({ closingAtLocal: '2026-10-16T23:59' }),
    status: 'ABERTO',
    windowStatus: 'PRAZO_ENCERRADO',
    closingAt: '2026-10-17T02:59:00Z',
    ...overrides,
  }
}

function fillExtension() {
  fireEvent.change(screen.getByLabelText('Novo encerramento (Brasília)'), {
    target: { value: '2026-12-31T23:59' },
  })
  fireEvent.change(screen.getByLabelText('Motivo da prorrogação'), {
    target: { value: 'Prazo ampliado para concluir o ciclo.' },
  })
}

function sampleApprovedVersion(
  overrides: Partial<ApprovedQuestionnaireVersion> = {},
): ApprovedQuestionnaireVersion {
  return {
    questionnaireVersionId: 'questionnaire-version-1',
    questionnaireCode: 'EQUIPE',
    questionnaireName: 'Avaliação de equipe',
    versionNumber: 1,
    title: 'Equipe 2026.2',
    configurationOptions: [
      {
        calculationConfigurationVersionId: 'calculation-version-1',
        calculationCode: 'MEDIA_SIMPLES_2024_1',
        calculationVersionNumber: 1,
        classificationMatrixVersionId: 'matrix-version-1',
        classificationMatrixCode: 'GERAL',
        classificationMatrixVersionNumber: 1,
      },
    ],
    ...overrides,
  }
}

function sampleDraft(overrides: Partial<DraftCycleConfiguration> = {}): DraftCycleConfiguration {
  return {
    cycleId: 'cycle-draft-1',
    code: '2026.2',
    name: 'Ciclo de avaliação 2026.2',
    openingAtLocal: '2026-09-01T00:00',
    closingAtLocal: '2026-09-16T00:00',
    timeZone: 'America/Sao_Paulo',
    selfAssessmentEnabled: true,
    questionnaires: [
      {
        cycleQuestionnaireId: 'cycle-questionnaire-1',
        questionnaireVersionId: 'questionnaire-version-1',
        calculationConfigurationVersionId: 'calculation-version-1',
        classificationMatrixVersionId: 'matrix-version-1',
      },
    ],
    ...overrides,
  }
}

function sampleAppliedQuestionnaire(
  overrides: Partial<AppliedCycleQuestionnaire> = {},
): AppliedCycleQuestionnaire {
  return {
    cycleQuestionnaireId: 'cycle-questionnaire-1',
    questionnaireVersionId: 'questionnaire-version-1',
    questionnaireCode: 'EQUIPE',
    questionnaireVersionNumber: 1,
    title: 'Equipe 2026.2',
    competencies: [
      {
        id: 'competency-1',
        name: 'Responsabilidade',
        questions: [
          {
            id: 'question-1',
            text: 'Conduz atividades com responsabilidade?',
            required: true,
            options: [
              { id: 'option-1', label: 'Dentro das expectativas' },
              { id: 'option-2', label: 'Supera as expectativas' },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

import { selectAssessmentFilter } from '../../test/selectAssessmentFilter'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import { AssessmentsPanel } from './AssessmentsPanel'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function setup(allowed = true, exportAssessments = vi.fn()) {
  const api = {
    listAssessments: vi.fn().mockResolvedValue({ items: [], page: { limit: 6, nextCursor: null } }),
    exportAssessments,
  } as unknown as ApiClient
  const onSessionExpired = vi.fn()
  render(
    <AssessmentsPanel
      api={api}
      canCreateManagerAssessment={false}
      canCreateDirectorAssessment={false}
      canCreateSelfAssessment={false}
      canSubmitSelfAssessment={false}
      canPublishAssessments={false}
      canReopenAssessments={false}
      canRecordFeedback={false}
      isAdministrativeView={true}
      canUseAdministrativeFilters={false}
      canExportAssessments={allowed}
      onExitEditor={() => {}}
      onSelectAssessment={() => {}}
      onSessionExpired={onSessionExpired}
    />,
  )
  return { api, exportAssessments, onSessionExpired }
}
describe('Exportar Excel da lista', () => {
  it('não oferece exportação sem autorização', async () => {
    setup(false)
    await screen.findByText('Nenhuma avaliação disponível')
    expect(screen.queryByRole('button', { name: 'Exportar Excel' })).toBeNull()
  })
  it('exporta com filtros aplicados e ignora alterações ainda não aplicadas', async () => {
    const content = new Blob(['workbook'])
    const fn = vi.fn().mockResolvedValue({ content, filename: 'avaliacoes-desempenho.xlsx' })
    const create = vi.fn().mockReturnValue('blob:export-test')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    setup(true, fn)
    await screen.findByText('Nenhuma avaliação disponível')
    fireEvent.change(screen.getByLabelText('Nome do Gestor Responsável'), {
      target: { value: 'João' },
    })
    await selectAssessmentFilter('Status da Avaliação', 'PUBLICADA')
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await screen.findByText('Nenhuma avaliação encontrada')
    fireEvent.change(screen.getByLabelText('Nome do Gestor Responsável'), {
      target: { value: 'Ainda não aplicado' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }))
    await waitFor(() =>
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ managerName: 'João', status: 'PUBLICADA' }),
      ),
    )
    expect(create).toHaveBeenCalledWith(content)
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
  })
  it('bloqueia cliques repetidos durante exportação e trata falha sem download', async () => {
    let reject!: (error: unknown) => void
    const fn = vi.fn().mockReturnValue(
      new Promise((_, no) => {
        reject = no
      }),
    )
    setup(true, fn)
    await screen.findByText('Nenhuma avaliação disponível')
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }))
    expect(screen.getByRole('button', { name: 'Exportando…' })).toBeDisabled()
    reject(new ApiError({ status: 422, code: 'ASSESSMENT_EXPORT_TOO_LARGE' }))
    expect(
      await screen.findByText('Aplique filtros para exportar até 50.000 avaliações por arquivo.'),
    ).toBeVisible()
    expect(fn).toHaveBeenCalledOnce()
  })
})

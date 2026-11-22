import { fireEvent, screen } from '@testing-library/react'

const labels: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADA: 'Enviada',
  PUBLICADA: 'Publicada',
  PENDENTE: 'Pendente',
  CONCLUIDO: 'Concluído',
  NAO_APLICAVEL: 'Não aplicável',
}

export async function selectAssessmentFilter(name: string, value: string) {
  fireEvent.click(screen.getByRole('combobox', { name }))
  fireEvent.click(await screen.findByRole('option', { name: labels[value] }))
}

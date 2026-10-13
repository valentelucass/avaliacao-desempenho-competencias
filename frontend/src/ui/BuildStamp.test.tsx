import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuildStamp } from './BuildStamp'

describe('BuildStamp', () => {
  it('exibe o modo local com a configuração padrão de testes', () => {
    expect(import.meta.env.VITE_BUILD_TIMESTAMP).toBeFalsy()
    render(<BuildStamp />)
    expect(screen.getByText('Build de desenvolvimento')).toBeVisible()
  })
  it('identifica a compilação em Brasília, independentemente do fuso do navegador', () => {
    render(<BuildStamp timestamp="2026-10-14T01:02:03.000Z" />)
    const timestamp = screen.getByText('13/10/2026, 22:02:03')
    expect(timestamp.tagName).toBe('TIME')
    expect(timestamp).toHaveAttribute('datetime', '2026-10-14T01:02:03.000Z')
    expect(timestamp.parentElement).toHaveTextContent('Build 13/10/2026, 22:02:03 (Brasília)')
  })

  it('não apresenta o relógio atual como uma publicação no desenvolvimento', () => {
    const { container } = render(<BuildStamp timestamp={null} />)
    expect(screen.getByText('Build de desenvolvimento')).toBeVisible()
    expect(container.querySelector('time')).toBeNull()
  })
})

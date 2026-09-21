import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContextHelp } from './ContextHelp'

describe('ContextHelp', () => {
  it('não abre durante a navegação pelo teclado e fecha a ajuda aberta por hover com Escape', () => {
    render(
      <ContextHelp title="Situação do ciclo">
        <p>Um ciclo aberto aceita avaliações dentro da sua vigência.</p>
      </ContextHelp>,
    )

    const trigger = screen.getByRole('button', { name: 'Ajuda sobre Situação do ciclo' })
    fireEvent.focus(trigger)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.mouseEnter(trigger)

    const popover = screen.getByRole('tooltip')
    expect(popover).toHaveTextContent('Um ciclo aberto aceita avaliações dentro da sua vigência.')
    expect(popover).toHaveStyle({ width: '420px' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(trigger, { key: 'Escape' })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

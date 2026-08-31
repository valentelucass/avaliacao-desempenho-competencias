import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContextHelp } from './ContextHelp'

describe('ContextHelp', () => {
  it('abre uma explicação pelo teclado e permite fechá-la com Escape', () => {
    render(
      <ContextHelp title="Situação do ciclo">
        <p>Um ciclo aberto aceita avaliações dentro da sua vigência.</p>
      </ContextHelp>,
    )

    const trigger = screen.getByRole('button', { name: 'Ajuda sobre Situação do ciclo' })
    fireEvent.focus(trigger)

    const popover = screen.getByRole('tooltip')
    expect(popover).toHaveTextContent('Um ciclo aberto aceita avaliações dentro da sua vigência.')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(trigger, { key: 'Escape' })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

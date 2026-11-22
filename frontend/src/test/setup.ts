import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom não implementa matchMedia. Layout/breakpoints são verificados no Edge,
// enquanto estes testes exercitam componentes, contratos, ações e acessibilidade.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (media: string): MediaQueryList => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  }),
})

afterEach(() => {
  cleanup()
})

// A posição real dos elementos é verificada no navegador; o jsdom não implementa rolagem.
if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {}

// O diálogo modal é nativo no navegador. No jsdom, simulamos somente o seu ciclo de abertura.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
    this.querySelector<HTMLElement>('[autofocus],button:not(:disabled),a[href]')?.focus()
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}

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

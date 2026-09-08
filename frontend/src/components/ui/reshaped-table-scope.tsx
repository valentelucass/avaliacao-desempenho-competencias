import { type ReactNode, useSyncExternalStore } from 'react'
import { Reshaped } from 'reshaped/bundle'
import './reshaped-table.css'

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function ReshapedTableScope({ children }: { children: ReactNode }) {
  const colorMode = useSyncExternalStore<'light' | 'dark'>(
    subscribeTheme,
    currentTheme,
    () => 'light',
  )

  return (
    <Reshaped scoped theme="slate" colorMode={colorMode} className="adc-reshaped-table-scope">
      {children}
    </Reshaped>
  )
}

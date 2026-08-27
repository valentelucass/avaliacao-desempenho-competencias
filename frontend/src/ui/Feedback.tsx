import type { ReactNode } from 'react'

export function FeedbackMessage({
  kind,
  children,
}: {
  kind: 'error' | 'info' | 'status' | 'warning'
  children: ReactNode
}) {
  return (
    <p className={`feedback feedback--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

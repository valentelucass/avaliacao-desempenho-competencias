import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  children: ReactNode
  action?: ReactNode
  className?: string
  icon?: ReactNode
  headingLevel?: 2 | 3
}

/** Mensagem explícita para coleções ou módulos sem conteúdo disponível. */
export function EmptyState({
  title,
  children,
  action,
  className,
  icon,
  headingLevel = 3,
}: EmptyStateProps) {
  const Title = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <section className={`empty-state empty-state--centered${className ? ` ${className}` : ''}`}>
      <span aria-hidden="true" className="empty-state__icon">
        {icon ?? <Inbox size={24} strokeWidth={1.7} />}
      </span>
      <div className="empty-state__body">
        <Title>{title}</Title>
        <p>{children}</p>
        {action ? <div className="empty-state__action">{action}</div> : null}
      </div>
    </section>
  )
}

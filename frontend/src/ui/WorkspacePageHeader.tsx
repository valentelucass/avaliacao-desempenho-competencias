import { Heading } from '@astryxdesign/core/Heading'
import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { WorkspaceHeaderHost } from './workspaceHeaderHost'

export function WorkspacePageHeader({
  id,
  title,
  group,
  help,
  actions,
  children,
}: {
  id: string
  title: ReactNode
  group: ReactNode
  help?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  const host = useContext(WorkspaceHeaderHost)
  const heading = (
    <div className="ev-page-head">
      <div className="ev-header-title">
        <span>{group}</span>
        <div className="ev-heading-help">
          <Heading level={host ? 1 : 2} id={id}>
            {title}
          </Heading>
          {help}
        </div>
      </div>
      {actions}
    </div>
  )
  return (
    <>
      {host ? createPortal(heading, host) : heading}
      {children}
    </>
  )
}

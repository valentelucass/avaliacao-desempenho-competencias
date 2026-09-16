import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, TriangleAlert, X } from 'lucide-react'

type FeedbackProps = {
  kind: 'error' | 'info' | 'status' | 'warning'
  children: ReactNode
  id?: string
  ref?: Ref<HTMLDivElement>
  tabIndex?: number
  onDismiss?: () => void
}

const viewports = new WeakMap<HTMLElement, { element: HTMLDivElement; users: number }>()

export function FeedbackMessage(props: FeedbackProps) {
  if (props.kind !== 'info') return <FloatingFeedback {...props} />
  return (
    <div className="feedback feedback--info" role="status" id={props.id}>
      {props.children}
    </div>
  )
}

function FloatingFeedback({ kind, children, id, ref, tabIndex, onDismiss }: FeedbackProps) {
  const previousFocus = useRef<HTMLElement | null>(null)
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [dismissed, setDismissed] = useState<ReactNode>()
  const [pointerInside, setPointerInside] = useState(false)
  const [focusInside, setFocusInside] = useState(false)
  const visible = children !== dismissed
  const paused = pointerInside || focusInside
  const expire = useEffectEvent(() => {
    setDismissed(children)
    onDismiss?.()
  })

  useEffect(() => {
    if (!viewport || !visible) return
    let timeout: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timeout)
      // Uma interação ou retorno à aba oferece novamente o prazo inteiro para leitura.
      if (!paused && !document.hidden)
        timeout = setTimeout(() => expire(), kind === 'status' ? 5000 : 10000)
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => {
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [children, kind, paused, viewport, visible])

  const attachAnchor = useCallback((node: HTMLSpanElement | null) => {
    if (!node) return
    // Dentro de um modal, manter os avisos na área acessível ao seu controle de foco.
    const parent =
      node.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]') ?? document.body
    let entry = viewports.get(parent)
    if (!entry) {
      const element = document.createElement('div')
      element.className = 'feedback-viewport'
      element.setAttribute('role', 'region')
      element.setAttribute('aria-label', 'Notificações')
      parent.appendChild(element)
      entry = { element, users: 0 }
      viewports.set(parent, entry)
    }
    entry.users++
    setViewport(entry.element)
    return () => {
      if (--entry.users === 0) {
        entry.element.remove()
        viewports.delete(parent)
      }
    }
  }, [])

  const Icon = kind === 'error' ? AlertCircle : kind === 'warning' ? TriangleAlert : CheckCircle2
  return (
    <>
      <span ref={attachAnchor} hidden id={!visible ? id : undefined}>
        {!visible ? children : null}
      </span>
      {viewport && visible
        ? createPortal(
            <div
              className={`feedback feedback--${kind} feedback--floating`}
              role={kind === 'error' ? 'alert' : 'status'}
              aria-atomic="true"
              id={id}
              ref={ref}
              tabIndex={tabIndex}
              onPointerEnter={() => setPointerInside(true)}
              onPointerLeave={() => setPointerInside(false)}
              onFocus={(event) => {
                setFocusInside(true)
                if (
                  event.relatedTarget instanceof HTMLElement &&
                  !event.currentTarget.contains(event.relatedTarget)
                )
                  previousFocus.current = event.relatedTarget
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false)
              }}
            >
              <Icon aria-hidden="true" size={21} />
              <span className="feedback__message">{children}</span>
              <button
                type="button"
                className="feedback__dismiss"
                aria-label="Fechar aviso"
                onClick={() => {
                  if (previousFocus.current?.isConnected)
                    previousFocus.current.focus({ preventScroll: true })
                  setDismissed(children)
                  onDismiss?.()
                }}
              >
                <X aria-hidden="true" size={19} />
              </button>
            </div>,
            viewport,
          )
        : null}
    </>
  )
}

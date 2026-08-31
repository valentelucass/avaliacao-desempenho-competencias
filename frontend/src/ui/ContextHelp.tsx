import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { createPortal } from 'react-dom'

type ContextHelpProps = {
  title: string
  children: ReactNode
  ariaLabel?: string
  className?: string
  estimatedHeight?: number
}

type PopoverPosition = {
  top: number
  left: number
  width: number
  side: 'above' | 'below'
}

const viewportInset = 16
const popoverGap = 8

export function ContextHelp({
  title,
  children,
  ariaLabel,
  className,
  estimatedHeight = 220,
}: ContextHelpProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<PopoverPosition>({
    top: viewportInset,
    left: viewportInset,
    width: 304,
    side: 'below',
  })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | undefined>(undefined)
  const helpId = `context-help-${useId().replaceAll(':', '')}`
  const { side, ...popoverStyle } = position

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = undefined
    }
  }, [])

  const updatePosition = useCallback(() => {
    const trigger = buttonRef.current
    if (!trigger) {
      return
    }

    const width = Math.min(304, window.innerWidth - viewportInset * 2)
    const bounds = trigger.getBoundingClientRect()
    const availableHeight = window.innerHeight - viewportInset * 2
    const measuredHeight = popoverRef.current?.getBoundingClientRect().height
    const height = Math.min(measuredHeight ?? estimatedHeight, availableHeight)
    const spaceBelow = window.innerHeight - bounds.bottom - viewportInset
    const showAbove = spaceBelow < height && bounds.top > spaceBelow
    const preferredTop = showAbove ? bounds.top - height - popoverGap : bounds.bottom + popoverGap
    const top = Math.min(
      Math.max(viewportInset, preferredTop),
      window.innerHeight - height - viewportInset,
    )
    const preferredLeft = bounds.left + bounds.width / 2 - width / 2
    const left = Math.min(
      Math.max(viewportInset, preferredLeft),
      window.innerWidth - width - viewportInset,
    )

    setPosition({ top, left, width, side: showAbove ? 'above' : 'below' })
  }, [estimatedHeight])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  useEffect(
    () => () => {
      clearCloseTimer()
    },
    [clearCloseTimer],
  )

  function openHelp() {
    clearCloseTimer()
    setIsOpen(true)
  }

  function scheduleClose() {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 180)
  }

  function closeHelp() {
    clearCloseTimer()
    setIsOpen(false)
  }

  return (
    <span className={['context-help', className].filter(Boolean).join(' ')}>
      <button
        aria-controls={helpId}
        aria-expanded={isOpen}
        aria-label={ariaLabel ?? `Ajuda sobre ${title}`}
        className="context-help__button"
        onBlur={scheduleClose}
        onClick={openHelp}
        onFocus={openHelp}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            closeHelp()
          }
        }}
        onMouseEnter={openHelp}
        onMouseLeave={scheduleClose}
        ref={buttonRef}
        type="button"
      >
        <CircleHelp aria-hidden="true" size={14} strokeWidth={2} />
      </button>
      {isOpen
        ? createPortal(
            <div
              className="context-help__popover"
              data-side={side}
              id={helpId}
              ref={popoverRef}
              role="tooltip"
              style={popoverStyle as CSSProperties}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  closeHelp()
                  buttonRef.current?.focus()
                }
              }}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleClose}
            >
              <div className="context-help__header">
                <span aria-hidden="true" className="context-help__header-icon">
                  <CircleHelp size={16} strokeWidth={2} />
                </span>
                <div>
                  <span className="context-help__eyebrow">Ajuda rápida</span>
                  <strong>{title}</strong>
                </div>
              </div>
              <div className="context-help__content">{children}</div>
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}

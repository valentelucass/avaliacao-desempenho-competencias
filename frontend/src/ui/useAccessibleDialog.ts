import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

type UseAccessibleDialogOptions = {
  dialogRef: RefObject<HTMLElement | null>
  isOpen: boolean
  onRequestClose: () => void
  canDismiss?: boolean
}

type IsolatedElement = {
  element: HTMLElement
  hadAriaHidden: boolean
  previousAriaHidden: string | null
  previousInert: boolean
}

const focusableSelector = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',')

/**
 * Mantém diálogos compostos em React equivalentes ao comportamento de um modal
 * nativo: o restante da interface fica inerte, o foco permanece no diálogo e
 * retorna ao acionador quando o diálogo é fechado.
 */
export function useAccessibleDialog({
  dialogRef,
  isOpen,
  onRequestClose,
  canDismiss = true,
}: UseAccessibleDialogOptions) {
  const onRequestCloseRef = useRef(onRequestClose)
  const canDismissRef = useRef(canDismiss)

  useLayoutEffect(() => {
    onRequestCloseRef.current = onRequestClose
    canDismissRef.current = canDismiss
  }, [canDismiss, onRequestClose])

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }

    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    const previouslyFocused = document.activeElement
    const initialFocusTarget =
      dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]') ??
      getFocusableElements(dialog)[0] ??
      dialog

    initialFocusTarget.focus({ preventScroll: true })
    const restoreBackground = isolateDialogBackground(dialog)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (canDismissRef.current) {
          event.preventDefault()
          event.stopPropagation()
          onRequestCloseRef.current()
        }
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = getFocusableElements(dialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const firstFocusable = focusableElements[0]
      const lastFocusable = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey) {
        if (activeElement === firstFocusable || !dialog.contains(activeElement)) {
          event.preventDefault()
          lastFocusable.focus({ preventScroll: true })
        }
        return
      }

      if (activeElement === lastFocusable || !dialog.contains(activeElement)) {
        event.preventDefault()
        firstFocusable.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      restoreBackground()

      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [dialogRef, isOpen])
}

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled') &&
      element.getAttribute('aria-hidden') !== 'true',
  )
}

function isolateDialogBackground(dialog: HTMLElement): () => void {
  const isolatedElements: IsolatedElement[] = []
  let childOnDialogPath: HTMLElement = dialog
  let parent = dialog.parentElement

  while (parent && parent !== document.body) {
    for (const sibling of Array.from(parent.children)) {
      if (sibling === childOnDialogPath || !(sibling instanceof HTMLElement)) {
        continue
      }

      isolatedElements.push({
        element: sibling,
        hadAriaHidden: sibling.hasAttribute('aria-hidden'),
        previousAriaHidden: sibling.getAttribute('aria-hidden'),
        previousInert: sibling.inert,
      })
      sibling.inert = true
      sibling.setAttribute('aria-hidden', 'true')
    }

    childOnDialogPath = parent
    parent = parent.parentElement
  }

  return () => {
    for (const isolatedElement of isolatedElements) {
      isolatedElement.element.inert = isolatedElement.previousInert
      if (isolatedElement.hadAriaHidden) {
        isolatedElement.element.setAttribute(
          'aria-hidden',
          isolatedElement.previousAriaHidden ?? 'true',
        )
      } else {
        isolatedElement.element.removeAttribute('aria-hidden')
      }
    }
  }
}

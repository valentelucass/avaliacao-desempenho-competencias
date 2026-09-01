import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Leva a pessoa até um painel que foi aberto na própria página. O padrão é
 * opt-in para não deslocar navegações, diálogos ou ações que não revelem conteúdo.
 */
export function useInlinePanelFocus<T extends HTMLElement>() {
  const panelRef = useRef<T>(null)
  const pendingFieldIdsRef = useRef<readonly string[]>([])
  const [requestId, setRequestId] = useState(0)
  const [isHighlighted, setIsHighlighted] = useState(false)
  const [highlightedFieldIds, setHighlightedFieldIds] = useState<readonly string[]>([])
  const [highlightPulse, setHighlightPulse] = useState(0)

  const revealInlinePanel = useCallback((fieldIds: readonly string[] = []) => {
    pendingFieldIdsRef.current = fieldIds
    setRequestId((currentRequestId) => currentRequestId + 1)
  }, [])

  const isFieldHighlighted = useCallback(
    (fieldId: string) => highlightedFieldIds.includes(fieldId),
    [highlightedFieldIds],
  )

  useEffect(() => {
    if (requestId === 0 || !panelRef.current) {
      return
    }

    const panel = panelRef.current
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    panel.scrollIntoView?.({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
    panel.focus({ preventScroll: true })
    setIsHighlighted(false)
    setHighlightedFieldIds([])

    // A pulsação começa já perto do fim da rolagem suave. Assim os campos não
    // chamam atenção fora da área visível enquanto a pessoa é levada até eles.
    const revealDelay = prefersReducedMotion ? 0 : 380
    const highlightTimer = window.setTimeout(() => {
      setIsHighlighted(true)
      setHighlightedFieldIds(pendingFieldIdsRef.current)
      setHighlightPulse((currentPulse) => currentPulse + 1)
    }, revealDelay)
    return () => window.clearTimeout(highlightTimer)
  }, [requestId])

  return { highlightPulse, isFieldHighlighted, isHighlighted, panelRef, revealInlinePanel }
}

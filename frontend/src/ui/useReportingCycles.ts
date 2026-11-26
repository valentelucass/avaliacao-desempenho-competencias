import { useEffect, useState } from 'react'
import { isAuthenticationError, type ApiClient } from '../api/client'
import type { EvaluationCycle } from '../api/contracts'
import { safeLoadErrorMessage } from './safeErrorMessage'

const emptyCycles: readonly EvaluationCycle[] = []

export function useReportingCycles(api: ApiClient, onSessionExpired: () => void) {
  const [result, setResult] = useState<{
    cycles: readonly EvaluationCycle[]
    error?: string
  }>()

  useEffect(() => {
    let active = true
    void api.listAllCycles().then(
      (cycles) => {
        if (active) setResult({ cycles })
      },
      (error: unknown) => {
        if (!active) return
        if (isAuthenticationError(error)) onSessionExpired()
        setResult({ cycles: emptyCycles, error: safeLoadErrorMessage(error, 'os ciclos') })
      },
    )
    return () => {
      active = false
    }
  }, [api, onSessionExpired])

  return {
    cycles: result?.cycles ?? emptyCycles,
    error: result?.error,
    isLoading: result === undefined,
  }
}

export function isReportingCycle(cycle: EvaluationCycle) {
  return cycle.status === 'ABERTO' || cycle.status === 'ENCERRADO'
}

export function preferredReportingCycle(cycles: readonly EvaluationCycle[]): string {
  return (
    cycles.find((cycle) => cycle.windowStatus === 'VIGENTE')?.id ??
    cycles.find((cycle) => cycle.status === 'ABERTO')?.id ??
    cycles[0]?.id ??
    ''
  )
}

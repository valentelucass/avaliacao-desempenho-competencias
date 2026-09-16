import { useCallback, useEffect, useRef, useState } from 'react'
import { isAuthenticationError } from '../../api/client'
import { safeLoadErrorMessage } from '../../ui/safeErrorMessage'

type Read = { key: string; label: string; load: () => Promise<() => void> }

export function administrativeRead<T>(
  key: string,
  label: string,
  query: () => Promise<T>,
  accept: (value: T) => void,
): Read {
  return {
    key,
    label,
    load: async () => {
      const value = await query()
      return () => accept(value)
    },
  }
}

/** Mantém resultados independentes e ignora respostas de uma carga substituída. */
export function useAdministrativeLoad(onSessionExpired: () => void) {
  const generation = useRef(0)
  const [statuses, setStatuses] = useState<Record<string, 'loading' | 'ready' | 'failed'>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

  const load = useCallback(
    async (reads: readonly Read[]) => {
      const current = ++generation.current
      let sessionReported = false
      setStatuses(Object.fromEntries(reads.map(({ key }) => [key, 'loading'])))
      setErrors({})
      await Promise.all(
        reads.map(async ({ key, label, load: read }) => {
          try {
            const accept = await read()
            if (current !== generation.current) return
            accept()
            setStatuses((previous) => ({ ...previous, [key]: 'ready' }))
          } catch (error) {
            if (current !== generation.current) return
            setStatuses((previous) => ({ ...previous, [key]: 'failed' }))
            setErrors((previous) => ({ ...previous, [key]: safeLoadErrorMessage(error, label) }))
            if (isAuthenticationError(error) && !sessionReported) {
              sessionReported = true
              onSessionExpired()
            }
          }
        }),
      )
    },
    [onSessionExpired],
  )

  return {
    load,
    errors: Object.values(errors),
    isLoading: Object.values(statuses).includes('loading'),
    isAvailable: (key: string) => statuses[key] === 'ready',
  }
}

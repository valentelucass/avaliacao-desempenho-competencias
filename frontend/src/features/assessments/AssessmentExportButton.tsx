import { ActionButton } from '../../ui/ActionButton'
import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { AssessmentExport } from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'

export function AssessmentExportButton({
  requestExport,
  disabled,
  onSessionExpired,
  tooltip = 'Exportar todas as avaliações autorizadas que atendem aos filtros aplicados',
}: {
  requestExport: () => Promise<AssessmentExport>
  disabled: boolean
  onSessionExpired: () => void
  tooltip?: string
}) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  async function exportFile() {
    if (isExporting || disabled) return
    setIsExporting(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const result = await requestExport()
      const url = URL.createObjectURL(result.content)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      anchor.hidden = true
      document.body.append(anchor)
      try {
        anchor.click()
      } finally {
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setNotice('Planilha preparada para download com os filtros aplicados.')
    } catch (failure) {
      if (isAuthenticationError(failure)) onSessionExpired()
      else setError(safeErrorMessage(failure))
    } finally {
      setIsExporting(false)
    }
  }
  return (
    <>
      <ActionButton
        size="sm"
        variant="secondary"
        className="ev-export"
        type="button"
        onClick={exportFile}
        disabled={disabled || isExporting}
        aria-busy={isExporting}
        tooltip={tooltip}
        icon={<FileSpreadsheet size={16} aria-hidden="true" />}
        label={isExporting ? 'Exportando…' : 'Exportar Excel'}
      />
      {error ? (
        <div className="assessment-export-message">
          <FeedbackMessage kind="error" onDismiss={() => setError(undefined)}>
            {error}
          </FeedbackMessage>
        </div>
      ) : null}
      {notice ? (
        <div className="assessment-export-message">
          <FeedbackMessage kind="status" onDismiss={() => setNotice(undefined)}>
            {notice}
          </FeedbackMessage>
        </div>
      ) : null}
    </>
  )
}

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import type { ApiClient } from '../../api/client'
import { isAuthenticationError } from '../../api/client'
import type { AssessmentExportRequest } from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'

export function AssessmentExportButton({
  api,
  filters,
  disabled,
  onSessionExpired,
}: {
  api: ApiClient
  filters: AssessmentExportRequest
  disabled: boolean
  onSessionExpired: () => void
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
      const result = await api.exportAssessments(filters)
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
      <button
        className="button button--success assessment-export-button"
        type="button"
        onClick={exportFile}
        disabled={disabled || isExporting}
        aria-busy={isExporting}
        title="Exportar todas as avaliações autorizadas que atendem aos filtros aplicados"
      >
        <FileSpreadsheet size={18} aria-hidden="true" />
        {isExporting ? 'Exportando…' : 'Exportar Excel'}
      </button>
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

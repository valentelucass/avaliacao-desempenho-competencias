import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, FileSpreadsheet } from 'lucide-react'
import { ApiError, isAuthenticationError, type ApiClient } from '../../api/client'
import type {
  QuestionnaireAssignmentOption,
  SpreadsheetImportKind,
  SpreadsheetImportPreview,
} from '../../api/contracts'
import { AdministrativeTable } from '@/components/ui/administrative-table'
import { FeedbackMessage } from '../../ui/Feedback'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'

type Props = {
  kind: SpreadsheetImportKind
  api: ApiClient
  cycles?: readonly QuestionnaireAssignmentOption[]
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onImported: () => Promise<void>
  onSessionExpired: () => void
}

const importLabels = {
  collaborators: 'colaboradores',
  assignments: 'atribuições de questionário',
  allocations: 'lotações',
} as const

const importInstructions = {
  collaborators:
    'Cabeçalho: Colaboradores. Cadastros existentes serão mantidos; nomes ambíguos precisam de revisão individual.',
  assignments:
    'Cabeçalhos: Ciclo em Rascunho, Filial, Colaborador e Questionário Aplicado no Ciclo. Filial será desconsiderada. Importe os colaboradores primeiro.',
  allocations:
    'Cabeçalhos: Filial, Colaborador, Área, Gestor e Início da Lotação. Somente essas colunas serão consideradas; colunas extras de dados serão ignoradas.',
} as const

export function SpreadsheetImportPanel({
  kind,
  api,
  cycles = [],
  disabled,
  onBusyChange,
  onImported,
  onSessionExpired,
}: Props) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const pendingPreview = useRef<string | undefined>(undefined)
  const [expanded, setExpanded] = useState(false)
  const [file, setFile] = useState<File>()
  const [cycleId, setCycleId] = useState('')
  const [preview, setPreview] = useState<SpreadsheetImportPreview>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [completed, setCompleted] = useState(false)
  const label = importLabels[kind]
  const selectedCycle = cycles.find((cycle) => cycle.cycleId === cycleId)
  const blocked = busy || disabled
  const ready =
    file && (kind !== 'assignments' || cycles.some((cycle) => cycle.cycleId === cycleId))

  const discardPreview = useCallback(() => {
    const pending = pendingPreview.current
    pendingPreview.current = undefined
    if (pending)
      void api.discardSpreadsheet(pending).catch(() => {
        /* Se a rede falhar, a prévia também expira no servidor. */
      })
  }, [api])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Uma confirmação já enviada deve terminar antes de descartar seu token.
      if (!inFlight.current) discardPreview()
    }
  }, [discardPreview])

  function invalidate() {
    setCompleted(false)
    setPreview(undefined)
    setNotice(undefined)
    setError(undefined)
    discardPreview()
  }

  async function run(action: () => Promise<void>, writing = false) {
    if (inFlight.current || disabled) return
    inFlight.current = true
    setBusy(true)
    setError(undefined)
    if (writing) onBusyChange(true)
    try {
      await action()
    } catch (failure) {
      if (!mounted.current) return
      if (failure instanceof ApiError && failure.status === 409) invalidate()
      if (isAuthenticationError(failure)) onSessionExpired()
      else setError(safeErrorMessage(failure))
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
      else discardPreview()
      if (writing) onBusyChange(false)
    }
  }

  function review() {
    if (!ready) return
    void run(async () => {
      if (preview) await api.discardSpreadsheet(preview.id)
      pendingPreview.current = undefined
      if (!mounted.current) return
      setPreview(undefined)
      setCompleted(false)
      setNotice(undefined)
      const result = await api.previewSpreadsheet(
        kind,
        file,
        kind === 'assignments' ? cycleId : undefined,
      )
      pendingPreview.current = result.id
      if (mounted.current) setPreview(result)
    })
  }

  function confirm() {
    if (!preview || preview.errors || !preview.creates || completed) return
    void run(async () => {
      const result = await api.confirmSpreadsheet(preview.id)
      if (!mounted.current) return
      setCompleted(true)
      setNotice(
        `Importação concluída: ${result.created} registro(s) criado(s) e ${result.existing} já existente(s) mantido(s).`,
      )
      await onImported()
    }, true)
  }

  function page(number: number) {
    if (preview)
      void run(async () => {
        const result = await api.getSpreadsheetPreview(preview.id, number)
        if (mounted.current) setPreview(result)
      })
  }

  return (
    <div className="spreadsheet-import">
      <div className="spreadsheet-import__entry">
        <button
          type="button"
          className="button spreadsheet-import__toggle"
          aria-label={`Importar Excel de ${label}`}
          aria-expanded={expanded}
          aria-controls={`${id}-panel`}
          onClick={() => setExpanded(!expanded)}
        >
          <FileSpreadsheet aria-hidden="true" size={17} />
          Importar Excel
          <ChevronDown aria-hidden="true" size={16} />
        </button>
      </div>
      <div
        id={`${id}-panel`}
        className="spreadsheet-import__panel"
        role="region"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        aria-busy={busy}
        hidden={!expanded}
      >
        <h4 id={`${id}-title`}>Importar {label}</h4>
        <p id={`${id}-description`} className="muted">
          Selecione a planilha .xlsx, confira os dados e confirme a criação. Até 1 MB e 1.000
          registros por arquivo, em uma única aba e sem fórmulas.
        </p>
        <p className="muted">{importInstructions[kind]}</p>
        {kind === 'allocations' && (
          <p className="muted">
            Colaborador e início são obrigatórios. Use uma data do Excel ou dd/mm/aaaa, sem horário.
            Filial e área, quando informadas, devem existir e estar ativas. Gestor é uma informação
            da lotação. Lotações idênticas serão mantidas; períodos conflitantes precisam de revisão
            individual.
          </p>
        )}
        {kind === 'assignments' && (
          <div className="field">
            <label htmlFor={`${id}-cycle`}>Ciclo para importar atribuições</label>
            <select
              id={`${id}-cycle`}
              disabled={blocked}
              value={cycleId}
              onChange={(event) => {
                invalidate()
                setCycleId(event.target.value)
              }}
            >
              <option value="">Selecione um ciclo em rascunho</option>
              {cycles.map((cycle) => (
                <option key={cycle.cycleId} value={cycle.cycleId}>
                  {cycle.cycleCode} — {cycle.cycleName}
                </option>
              ))}
            </select>
            <span className="muted">
              O ciclo e os títulos dos questionários da planilha devem corresponder a este cadastro.
            </span>
            {selectedCycle && (
              <div className="spreadsheet-import__references">
                <strong>Questionários aplicados neste ciclo</strong>
                {selectedCycle.questionnaires.length ? (
                  <ul>
                    {selectedCycle.questionnaires.map((questionnaire) => (
                      <li key={questionnaire.cycleQuestionnaireId}>{questionnaire.title}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Nenhum questionário aplicado. Confira o cadastro em Administração de ciclos.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <div className="spreadsheet-import__file-row">
          <div className="field">
            <label htmlFor={`${id}-file`}>Planilha de {label}</label>
            <input
              ref={input}
              id={`${id}-file`}
              type="file"
              accept=".xlsx"
              disabled={blocked}
              aria-describedby={`${id}-description`}
              onChange={(event) => {
                invalidate()
                const selected = event.target.files?.[0]
                if (
                  selected &&
                  (!/\.xlsx$/i.test(selected.name) ||
                    selected.size > 1_048_576 ||
                    selected.size === 0)
                ) {
                  setFile(undefined)
                  event.target.value = ''
                  setError('Selecione um arquivo .xlsx de até 1 MB que não esteja vazio.')
                } else setFile(selected)
              }}
            />
          </div>
          <button type="button" className="button" disabled={blocked || !ready} onClick={review}>
            {busy ? 'Aguarde…' : 'Conferir planilha'}
          </button>
        </div>
        {error && (
          <FeedbackMessage kind="error" onDismiss={() => setError(undefined)}>
            {error}
          </FeedbackMessage>
        )}
        {notice && (
          <FeedbackMessage kind="status" onDismiss={() => setNotice(undefined)}>
            {notice}
          </FeedbackMessage>
        )}
        {preview && (
          <>
            <p role="status">
              {preview.total} registro(s): {preview.creates} novo(s), {preview.existing} já
              existente(s), {preview.errors} com pendência.
            </p>
            <p className="muted" id={`${id}-confirmation-help`}>
              {completed
                ? 'Lote concluído. Confira as listas atualizadas abaixo.'
                : preview.errors
                  ? `Confirmação bloqueada: ${preview.errors} registro(s) com pendência no lote. Resolva as pendências na planilha ou nos cadastros e clique em Conferir planilha novamente. Nenhum registro foi gravado; a importação é feita somente com o lote inteiro válido.`
                  : 'Confira todas as páginas. A confirmação cria somente os registros novos e mantém os existentes. A conferência vale por 15 minutos.'}
            </p>
            {preview.errors > 0 && kind === 'allocations' && (
              <p className="muted">
                Se uma filial ou área não for encontrada, confira o nome nas seções Filiais e Áreas
                desta tela. Cadastre o recurso se ele realmente for novo ou ajuste a planilha para
                usar o nome do cadastro correto. A importação não cria nem substitui essas
                referências.
              </p>
            )}
            {preview.errors > 0 && kind === 'assignments' && (
              <p className="muted">
                Se faltar um questionário, confira a lista do ciclo acima. Selecione um ciclo em
                rascunho que contenha todos os questionários da planilha ou revise o cadastro em
                Administração de ciclos. Questionários diferentes não são substituídos
                automaticamente.
              </p>
            )}
            <div className="administration-users spreadsheet-import__table">
              <AdministrativeTable>
                <caption className="visually-hidden">Conferência de {label}</caption>
                <thead>
                  <tr>
                    <th scope="col">Linha</th>
                    <th scope="col">Colaborador</th>
                    {kind === 'allocations' && (
                      <>
                        <th scope="col">Filial</th>
                        <th scope="col">Área</th>
                        <th scope="col">Gestor</th>
                        <th scope="col">Início da Lotação</th>
                      </>
                    )}
                    {kind === 'assignments' && <th scope="col">Questionário</th>}
                    <th scope="col">Conferência</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.line}>
                      <td data-label="Linha">{row.line}</td>
                      <td data-label="Colaborador">{row.name}</td>
                      {kind === 'allocations' && (
                        <>
                          <td data-label="Filial">{row.allocation?.branch || 'Não informada'}</td>
                          <td data-label="Área">{row.allocation?.area || 'Não informada'}</td>
                          <td data-label="Gestor">{row.allocation?.manager || 'Não informado'}</td>
                          <td data-label="Início da Lotação">
                            <span className="spreadsheet-import__date">
                              {row.allocation?.startsOn || 'Não informado'}
                            </span>
                          </td>
                        </>
                      )}
                      {kind === 'assignments' && (
                        <td data-label="Questionário">{row.questionnaire}</td>
                      )}
                      <td data-label="Conferência">
                        <strong>
                          {row.status === 'ERROR'
                            ? 'Pendência'
                            : row.status === 'EXISTS'
                              ? 'Já existe'
                              : 'Novo'}
                        </strong>{' '}
                        — {row.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AdministrativeTable>
            </div>
            <Pagination
              currentPage={preview.page}
              totalPages={preview.totalPages}
              hasNextPage={preview.page < preview.totalPages}
              itemCountOnPage={preview.rows.length}
              itemLabel="linhas da planilha"
              isLoading={blocked}
              onNextPage={() => page(preview.page + 1)}
              onPreviousPage={() => page(preview.page - 1)}
            />
            <div className="spreadsheet-import__actions">
              <button
                type="button"
                className="button"
                disabled={blocked}
                onClick={() => {
                  invalidate()
                  setFile(undefined)
                  if (input.current) input.current.value = ''
                }}
              >
                Descartar conferência
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={blocked || completed || preview.errors > 0 || preview.creates === 0}
                aria-describedby={`${id}-confirmation-help`}
                onClick={confirm}
              >
                {preview.errors > 0
                  ? `Confirmar importação — ${preview.errors} pendência(s)`
                  : completed
                    ? 'Importação concluída'
                    : preview.creates === 0
                      ? 'Nenhum registro novo para importar'
                      : `Confirmar importação de ${preview.creates} registro(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

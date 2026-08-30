import type { AssessmentDetail } from '../../api/contracts'
import { Pagination } from '../../ui/Pagination'
import { useClientPagination } from '../../ui/useClientPagination'

type IndividualAssessmentSummaryProps = {
  assessment: AssessmentDetail
  displayMode?: 'complete' | 'chart'
}

type CompetencyScore = NonNullable<AssessmentDetail['competencyScores']>[number]

const minimumScore = 80
const maximumScore = 120
const chartSize = 720
const chartCenter = chartSize / 2
const chartRadius = 190
const labelRadius = 220
const rings = [80, 90, 100, 110, 120]

export function IndividualAssessmentSummary({
  assessment,
  displayMode = 'complete',
}: IndividualAssessmentSummaryProps) {
  const competencyScores = assessment.competencyScores ?? []
  const competencyScorePairs = pairCompetencyScores(competencyScores)
  const pagination = useClientPagination(competencyScorePairs, 5)

  if (
    !assessment.result ||
    competencyScores.length === 0 ||
    (assessment.status !== 'ENVIADA' && assessment.status !== 'PUBLICADA')
  ) {
    return null
  }

  const points = competencyScores.map((competency, index) =>
    polarPoint(index, competencyScores.length, radiusFor(competency.score)),
  )
  const shape = points.map(({ x, y }) => `${x},${y}`).join(' ')
  const score = formatScore(assessment.result.finalScore)

  return (
    <section
      className={`individual-assessment-summary individual-assessment-summary--${displayMode} card`}
      aria-labelledby="individual-summary-title"
    >
      {displayMode === 'complete' ? (
        <div className="section-heading">
          <div>
            <p className="eyebrow">Resumo individual</p>
            <h3 id="individual-summary-title">Resultado de {assessment.evaluated.displayName}</h3>
            <p className="muted">Ciclo: {assessment.cycle.name}</p>
          </div>
          <dl className="individual-assessment-summary__result">
            <div>
              <dt>Nota final</dt>
              <dd>{score}</dd>
            </div>
            <div>
              <dt>Classificação</dt>
              <dd>{assessment.result.classification.label}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="individual-assessment-summary__chart-header">
          <div className="individual-assessment-summary__chart-heading">
            <p className="eyebrow">Resultado por competência</p>
            <h3 id="individual-summary-title">Gráfico da avaliação</h3>
          </div>
          <dl
            aria-label="Resultado calculado no servidor"
            className="individual-assessment-summary__chart-result"
          >
            <div>
              <dt>Nota final</dt>
              <dd>{score}</dd>
            </div>
            <div>
              <dt>Classificação</dt>
              <dd>{assessment.result.classification.label}</dd>
            </div>
            {assessment.result.classification.guidance ? (
              <div className="individual-assessment-summary__guidance">
                <dt>Orientação</dt>
                <dd>{assessment.result.classification.guidance}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}

      <div className="individual-assessment-summary__content">
        <figure className="competency-radar" aria-describedby="competency-radar-description">
          <svg
            className="competency-radar__svg"
            preserveAspectRatio="xMidYMid meet"
            viewBox={`0 0 ${chartSize} ${chartSize}`}
            role="img"
            aria-labelledby="competency-radar-title competency-radar-description"
          >
            <title id="competency-radar-title">Pontuação por competência</title>
            {rings.map((ring) => (
              <g key={ring}>
                <polygon
                  className="competency-radar__ring"
                  points={competencyScores
                    .map((_, index) => polarPoint(index, competencyScores.length, radiusFor(ring)))
                    .map(({ x, y }) => `${x},${y}`)
                    .join(' ')}
                />
                <text
                  aria-hidden="true"
                  className="competency-radar__ring-label"
                  x={chartCenter + 8}
                  y={chartCenter - radiusFor(ring) + 4}
                >
                  {ring}
                </text>
              </g>
            ))}
            {competencyScores.map((competency, index) => {
              const point = polarPoint(index, competencyScores.length, chartRadius)
              const labelPoint = polarPoint(index, competencyScores.length, labelRadius)
              const lines = splitLabel(competency.name, competencyScores.length)
              return (
                <g key={competency.id}>
                  <line
                    className="competency-radar__axis"
                    x1={chartCenter}
                    x2={point.x}
                    y1={chartCenter}
                    y2={point.y}
                  />
                  <text
                    aria-hidden="true"
                    className="competency-radar__label"
                    textAnchor={labelAnchor(labelPoint.x)}
                    x={labelPoint.x}
                    y={labelPoint.y - (lines.length - 1) * 7}
                  >
                    {lines.map((line, lineIndex) => (
                      <tspan key={line} x={labelPoint.x} dy={lineIndex === 0 ? 0 : '1.15em'}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              )
            })}
            <polygon className="competency-radar__shape" points={shape} />
            {points.map((point, index) => (
              <circle
                className="competency-radar__point"
                cx={point.x}
                cy={point.y}
                key={competencyScores[index].id}
                r="3"
              />
            ))}
          </svg>
          <figcaption id="competency-radar-description">
            Escala fixa de 80 a 120. A tabela a seguir apresenta os mesmos dados em texto.
          </figcaption>
        </figure>

        {displayMode === 'complete' ? (
          <div className="individual-assessment-summary__notes">
            <SummaryText
              label="Comentário"
              value={assessment.comment}
              emptyLabel="Nenhum comentário informado."
            />
            <SummaryText
              label="Plano de ação"
              value={assessment.actionPlan}
              emptyLabel="Nenhum plano de ação informado."
            />
          </div>
        ) : null}
      </div>

      <div className="table-scroll">
        <table className="individual-assessment-summary__table">
          <caption>Resultado por competência</caption>
          <thead>
            <tr>
              <th scope="col">Competência</th>
              <th scope="col">Pontuação</th>
              <th scope="col">Competência</th>
              <th scope="col">Pontuação</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map(([first, second]) => (
              <tr key={first.id}>
                <td data-label="Competência">{first.name}</td>
                <td data-label="Pontuação">{formatScore(first.score)}</td>
                {second ? (
                  <>
                    <td data-label="Competência">{second.name}</td>
                    <td data-label="Pontuação">{formatScore(second.score)}</td>
                  </>
                ) : (
                  <td aria-hidden="true" colSpan={2} />
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={pagination.currentPage}
        hasNextPage={pagination.hasNextPage}
        itemCountOnPage={pagination.items.length}
        itemLabel="pares de competências"
        onNextPage={pagination.onNextPage}
        onPreviousPage={pagination.onPreviousPage}
        totalPages={pagination.totalPages}
      />
    </section>
  )
}

function SummaryText({
  label,
  value,
  emptyLabel,
}: {
  label: string
  value?: string
  emptyLabel: string
}) {
  return (
    <section aria-label={label}>
      <h4>{label}</h4>
      <p>{value?.trim() || emptyLabel}</p>
    </section>
  )
}

function radiusFor(score: number): number {
  return ((score - minimumScore) / (maximumScore - minimumScore)) * chartRadius
}

function polarPoint(index: number, total: number, radius: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2
  return {
    x: Number((chartCenter + Math.cos(angle) * radius).toFixed(2)),
    y: Number((chartCenter + Math.sin(angle) * radius).toFixed(2)),
  }
}

function labelAnchor(x: number): 'start' | 'middle' | 'end' {
  if (x < chartCenter - 24) {
    return 'end'
  }
  if (x > chartCenter + 24) {
    return 'start'
  }
  return 'middle'
}

function splitLabel(label: string, total: number): readonly string[] {
  const maximumCharacters = total > 14 ? 19 : 25
  const words = label.trim().split(/\s+/)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && next.length > maximumCharacters) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) {
    lines.push(line)
  }
  return lines.slice(0, 3)
}

function pairCompetencyScores(
  competencyScores: readonly CompetencyScore[],
): ReadonlyArray<readonly [CompetencyScore, CompetencyScore?]> {
  return competencyScores.reduce<Array<readonly [CompetencyScore, CompetencyScore?]>>(
    (pairs, competency, index) => {
      if (index % 2 === 0) {
        pairs.push([competency, competencyScores[index + 1]])
      }
      return pairs
    },
    [],
  )
}

function formatScore(score: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(score)
}

import type { AssessmentDetail } from '../../api/contracts'

type IndividualAssessmentSummaryProps = {
  assessment: AssessmentDetail
}

const minimumScore = 80
const maximumScore = 120
const chartSize = 360
const chartCenter = chartSize / 2
const chartRadius = 122
const rings = [80, 90, 100, 110, 120]

export function IndividualAssessmentSummary({ assessment }: IndividualAssessmentSummaryProps) {
  const competencyScores = assessment.competencyScores ?? []
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
      className="individual-assessment-summary card"
      aria-labelledby="individual-summary-title"
    >
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

      <div className="individual-assessment-summary__content">
        <figure className="competency-radar" aria-describedby="competency-radar-description">
          <svg
            viewBox={`0 0 ${chartSize} ${chartSize}`}
            role="img"
            aria-labelledby="competency-radar-title competency-radar-description"
          >
            <title id="competency-radar-title">Pontuação por competência</title>
            {rings.map((ring) => (
              <polygon
                className="competency-radar__ring"
                key={ring}
                points={competencyScores
                  .map((_, index) => polarPoint(index, competencyScores.length, radiusFor(ring)))
                  .map(({ x, y }) => `${x},${y}`)
                  .join(' ')}
              />
            ))}
            {competencyScores.map((competency, index) => {
              const point = polarPoint(index, competencyScores.length, chartRadius)
              return (
                <line
                  className="competency-radar__axis"
                  key={competency.id}
                  x1={chartCenter}
                  x2={point.x}
                  y1={chartCenter}
                  y2={point.y}
                />
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
      </div>

      <div className="table-scroll">
        <table className="individual-assessment-summary__table">
          <caption>Resultado por competência</caption>
          <thead>
            <tr>
              <th scope="col">Competência</th>
              <th scope="col">Pontuação</th>
            </tr>
          </thead>
          <tbody>
            {competencyScores.map((competency) => (
              <tr key={competency.id}>
                <td data-label="Competência">{competency.name}</td>
                <td data-label="Pontuação">{formatScore(competency.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function formatScore(score: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(score)
}

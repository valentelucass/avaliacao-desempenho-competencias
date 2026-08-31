import { ClipboardCheck, UsersRound } from 'lucide-react'
import { ContextHelp } from '../../ui/ContextHelp'
import { EmptyState } from '../../ui/EmptyState'

type DashboardPanelProps = {
  canCreateAssessment: boolean
  canCreateSelfAssessment: boolean
  onOpenAssessments: (kind: 'EQUIPE' | 'AUTOAVALIACAO') => void
}

/** Página inicial. A escolha orienta a jornada; a atribuição do questionário segue no servidor. */
export function DashboardPanel({
  canCreateAssessment,
  canCreateSelfAssessment,
  onOpenAssessments,
}: DashboardPanelProps) {
  return (
    <section aria-labelledby="dashboard-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Página inicial</p>
          <div className="context-help__heading">
            <h2 id="dashboard-title">Avaliações de desempenho</h2>
            <ContextHelp title="Como as jornadas são liberadas">
              <p>
                Os atalhos exibidos dependem do perfil da conta. Ao iniciar uma jornada, o servidor
                ainda confirma vínculo, ciclo aberto e questionário atribuído.
              </p>
              <p className="context-help__note">
                Escolher uma opção nesta página não concede acesso nem altera permissões.
              </p>
            </ContextHelp>
          </div>
          <p className="muted">
            Escolha a jornada para começar. O formulário aplicável é confirmado pelo servidor.
          </p>
        </div>
      </div>

      <section className="dashboard-hero card" aria-labelledby="assessment-kind-title">
        <div>
          <p className="eyebrow">Nova avaliação</p>
          <h3 id="assessment-kind-title">Qual avaliação deseja realizar?</h3>
          <p className="muted">
            A seleção não altera dados nem permissões. Ao criar, o sistema valida vínculo, ciclo e
            questionário atribuído.
          </p>
        </div>
        <div className="assessment-kind-grid">
          {canCreateAssessment || canCreateSelfAssessment ? (
            <>
              {canCreateAssessment ? (
                <button
                  className="assessment-kind-card"
                  onClick={() => onOpenAssessments('EQUIPE')}
                  type="button"
                >
                  <UsersRound aria-hidden="true" size={22} strokeWidth={1.7} />
                  <span>Avaliar minha equipe</span>
                  <small>
                    Para as pessoas vinculadas à sua gestão e autorizadas pelo servidor.
                  </small>
                </button>
              ) : null}
              {canCreateSelfAssessment ? (
                <button
                  className="assessment-kind-card"
                  onClick={() => onOpenAssessments('AUTOAVALIACAO')}
                  type="button"
                >
                  <ClipboardCheck aria-hidden="true" size={22} strokeWidth={1.7} />
                  <span>Minha autoavaliação</span>
                  <small>Preencha a sua avaliação no ciclo autorizado.</small>
                </button>
              ) : null}
            </>
          ) : (
            <EmptyState className="empty-state--compact" title="Nenhuma jornada disponível">
              Esta conta não possui uma jornada de avaliação liberada. As jornadas dependem do
              perfil, dos vínculos, do ciclo aberto e do questionário atribuído.
            </EmptyState>
          )}
        </div>
      </section>

      <section className="card dashboard-info" aria-labelledby="storage-title">
        <h3 id="storage-title">Dados protegidos</h3>
        <p className="muted">
          Rascunhos e respostas são salvos no banco interno pela API. A nota e a classificação são
          calculadas exclusivamente no servidor.
        </p>
      </section>
    </section>
  )
}

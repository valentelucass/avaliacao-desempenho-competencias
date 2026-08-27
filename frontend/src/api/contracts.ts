export type Permission = string

export interface CurrentUser {
  id: string
  displayName: string
  permissions: readonly Permission[]
  passwordChangeRequired?: boolean
  supremeAdministrator?: boolean
}

export type AccountStatus = 'ACTIVE' | 'BLOCKED' | 'DISABLED'

export type PermissionGrantEffect = 'ALLOW' | 'DENY'

export interface AdministrationUserPermissionGrant {
  code: string
  effect: PermissionGrantEffect
}

/**
 * Dados não sensíveis de uma conta local retornados para a administração técnica.
 * A tela de consulta não recebe nem apresenta senha, hash, token ou sessão.
 */
export interface AdministrationUser {
  id: string
  login: string
  displayName: string
  status: AccountStatus
  protectedFromNormalFlow: boolean
  logicallyDeleted: boolean
  passwordChangeRequired: boolean
  roles: readonly string[]
  individualPermissions: readonly AdministrationUserPermissionGrant[]
  updatedAt: string
}

export interface CreateAdministrationUserInput {
  login: string
  displayName: string
  initialPassword: string
  initialRoles: readonly string[]
}

export interface LogicalDeleteAdministrationUserInput {
  deleted: boolean
}

export interface ResetAdministrationUserPasswordInput {
  temporaryPassword: string
}

export interface UpdateAdministrationUserInput {
  displayName: string
  status: AccountStatus
}

export interface ReplaceAdministrationUserAccessGrantsInput {
  roles: readonly string[]
  permissions: readonly AdministrationUserPermissionGrant[]
}

export interface CreatedResource {
  id: string
}

export interface AdministrativeNamedResource {
  id: string
  name: string
  active: boolean
}

export interface AdministrativeCollaborator {
  id: string
  displayName: string
  active: boolean
}

export interface ActiveAllocation {
  id: string
  collaboratorId: string
  branchId: string | null
  areaId: string | null
  managerText: string | null
  startsOn: string | null
}

export interface ActiveManagerAssignment {
  id: string
  managerUserId: string
  collaboratorId: string
  startsOn: string | null
}

/** Opções sem dados de conta para administrar somente vínculos de gestão. */
export interface ManagerAssignmentOptions {
  managers: readonly AdministrativePersonOption[]
  collaborators: readonly AdministrativePersonOption[]
}

export interface UserCollaboratorLinkOptions {
  users: readonly AdministrativePersonOption[]
  collaborators: readonly AdministrativePersonOption[]
}

export interface AdministrativePersonOption {
  id: string
  displayName: string
}

export interface ActiveUserCollaboratorLink {
  id: string
  userId: string
  collaboratorId: string
  startsOn: string
}

export interface ActiveQuestionnaireAssignment {
  id: string
  cycleId: string
  cycleCode: string
  cycleName: string
  collaboratorId: string
  cycleQuestionnaireId: string
  questionnaireTitle: string
}

/** Opções mínimas para atribuir um questionário já aplicado a um colaborador. */
export interface QuestionnaireAssignmentOption {
  cycleId: string
  cycleCode: string
  cycleName: string
  questionnaires: readonly QuestionnaireAssignmentCycleQuestionnaireOption[]
}

export interface QuestionnaireAssignmentCycleQuestionnaireOption {
  cycleQuestionnaireId: string
  title: string
}

export interface ApprovedQuestionnaireVersion {
  questionnaireVersionId: string
  questionnaireCode: string
  questionnaireName: string
  versionNumber: number
  title: string
  configurationOptions: readonly CalculationMatrixOption[]
}

export interface CalculationMatrixOption {
  calculationConfigurationVersionId: string
  calculationCode: string
  calculationVersionNumber: number
  classificationMatrixVersionId: string
  classificationMatrixCode: string
  classificationMatrixVersionNumber: number
}

export interface DraftCycleConfiguration {
  cycleId: string
  code: string
  name: string
  openingAtLocal: string
  closingAtLocal: string
  timeZone: string
  selfAssessmentEnabled: boolean
  questionnaires: readonly DraftCycleAppliedQuestionnaire[]
}

export interface DraftCycleAppliedQuestionnaire {
  cycleQuestionnaireId: string
  questionnaireVersionId: string
  calculationConfigurationVersionId: string
  classificationMatrixVersionId: string
}

export interface NamedResourceInput {
  name: string
}

export interface CreateCollaboratorInput {
  displayName: string
}

export interface CreateAllocationInput {
  collaboratorId: string
  branchId?: string
  areaId?: string
  managerText?: string
  startsOn: string
}

export interface CloseRecordInput {
  endsOn: string
}

export interface CreateManagerAssignmentInput {
  managerUserId: string
  collaboratorId: string
  startsOn: string
}

export interface CreateUserCollaboratorLinkInput {
  userId: string
  collaboratorId: string
  startsOn: string
}

export interface CreateQuestionnaireAssignmentInput {
  cycleId: string
  collaboratorId: string
  cycleQuestionnaireId: string
}

export interface RevokeQuestionnaireAssignmentInput {
  reason: string
}

export interface CreateQuestionnaireVersionInput {
  questionnaire: QuestionnaireIdentityInput
  versionNumber: number
  title: string
  description?: string
  calculation: CalculationConfigurationInput
  classificationMatrixVersionNumber: number
  competencies: readonly QuestionnaireCompetencyInput[]
}

export interface QuestionnaireIdentityInput {
  code: string
  name: string
}

export interface CalculationConfigurationInput {
  code: string
  versionNumber: number
}

export interface QuestionnaireCompetencyInput {
  code: string
  name: string
  versionNumber: number
  description?: string
  order: number
  questions: readonly QuestionnaireQuestionInput[]
}

export interface QuestionnaireQuestionInput {
  code: string
  text: string
  description?: string
  order: number
}

export interface CreatedQuestionnaireVersion {
  questionnaireVersionId: string
  calculationConfigurationVersionId: string
  classificationMatrixVersionId: string
}

export interface CycleQuestionnaireInput {
  questionnaireVersionId: string
  calculationConfigurationVersionId: string
  classificationMatrixVersionId: string
}

export interface EvaluationCycleConfigurationInput {
  name: string
  openingAtLocal: string
  closingAtLocal: string
  timeZone: string
  selfAssessmentEnabled: boolean
  questionnaires: readonly CycleQuestionnaireInput[]
}

export interface CreateEvaluationCycleInput {
  code: string
  configuration: EvaluationCycleConfigurationInput
}

export interface ReplaceEvaluationCycleInput {
  configuration: EvaluationCycleConfigurationInput
}

export interface CreatedEvaluationCycleQuestionnaire {
  cycleQuestionnaireId: string
  questionnaireVersionId: string
}

export interface CreatedEvaluationCycle {
  cycleId: string
  questionnaires: readonly CreatedEvaluationCycleQuestionnaire[]
}

export interface ApiProblem {
  status: number
  code?: string
  requestId?: string
  errors?: readonly {
    field: string
    code: string
  }[]
}

export interface EvaluationCycle {
  id: string
  name: string
  status: string
}

export interface AppliedCycleQuestionnaire {
  cycleQuestionnaireId: string
  questionnaireVersionId: string
  questionnaireCode: string
  questionnaireVersionNumber: number
  title: string
  competencies: readonly AppliedCycleQuestionnaireCompetency[]
}

export interface AppliedCycleQuestionnaireCompetency {
  id: string
  name: string
  questions: readonly AppliedCycleQuestionnaireQuestion[]
}

export interface AppliedCycleQuestionnaireQuestion {
  id: string
  text: string
  description?: string
  required: boolean
  options: readonly AppliedCycleQuestionnaireOption[]
}

export interface AppliedCycleQuestionnaireOption {
  id: string
  label: string
}

export interface AssessmentSummary {
  id: string
  cycle: {
    id: string
    name: string
  }
  evaluated: {
    displayName: string
  }
  type: string
  status: string
  revision?: string
  updatedAt?: string
}

export type CreateAssessmentInput =
  | {
      type: 'AUTOAVALIACAO'
      cycleId: string
    }
  | {
      type: 'GESTOR'
      cycleId: string
      collaboratorId: string
    }

export interface ManagerAssessmentCreationOption {
  id: string
  displayName: string
}

export interface AssessmentResponseOption {
  id: string
  label: string
  points: number
}

export interface AssessmentQuestion {
  id: string
  text: string
  description?: string
  required: boolean
  options: readonly AssessmentResponseOption[]
}

export interface AssessmentCompetency {
  id: string
  name: string
  questions: readonly AssessmentQuestion[]
}

export interface AssessmentResult {
  finalScore: number
  classification: {
    label: string
    guidance?: string
  }
}

export interface AssessmentDetail extends AssessmentSummary {
  questionnaire: {
    version: string
    competencies: readonly AssessmentCompetency[]
  }
  answers: readonly {
    questionId: string
    optionId: string
  }[]
  comment?: string
  actionPlan?: string
  result?: AssessmentResult
  competencyScores?: readonly {
    id: string
    name: string
    score: number
  }[]
}

export interface AssessmentDraftInput {
  answers: readonly {
    questionId: string
    optionId: string
  }[]
  comment?: string
  actionPlan?: string
}

export type IndicatorMetric =
  'FINAL_SCORE_AVERAGE' | 'COMPETENCY_SCORE_AVERAGE' | 'CLASSIFICATION_DISTRIBUTION'

export type PopulationDimension = 'BRANCH' | 'AREA' | 'MANAGER'

export interface IndicatorQuery {
  cycleId: string
  metric: IndicatorMetric
  branchId?: string
  areaId?: string
  managerUserId?: string
  competencyId?: string
}

export interface IndicatorFilterOption {
  id: string
  label: string
}

export interface IndicatorFilterOptions {
  branches: readonly IndicatorFilterOption[]
  areas: readonly IndicatorFilterOption[]
  managers: readonly IndicatorFilterOption[]
  competencies: readonly IndicatorFilterOption[]
}

export type IndicatorAvailability = 'AVAILABLE' | 'DADOS_INSUFICIENTES' | 'INSUFFICIENT_DATA'

export interface AvailableIndicatorResponse {
  availability: 'AVAILABLE'
  policyVersion: string
  metric: IndicatorMetric
  averageScore?: number
  classificationDistribution?: readonly {
    classification: string
    percentage: number
  }[]
}

export interface InsufficientIndicatorResponse {
  availability: Exclude<IndicatorAvailability, 'AVAILABLE'>
  policyVersion?: string
}

export type IndicatorResponse = AvailableIndicatorResponse | InsufficientIndicatorResponse

export interface IndicatorExport {
  filename: string
  content: Blob
}

export interface Page<T> {
  items: readonly T[]
  page: {
    limit: number
    nextCursor: string | null
  }
}

export interface PageRequest {
  limit?: number
  cursor?: string
}

export interface AssessmentListRequest extends PageRequest {
  cycleId?: string
  collaboratorId?: string
}

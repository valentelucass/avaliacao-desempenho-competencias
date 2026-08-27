export type QuestionnaireTemplateId = 'LIDERANCA' | 'COLABORADORES' | 'OPERACIONAL'

export type QuestionnaireTemplateItem = {
  code: string
  name: string
  description: string
}

export type QuestionnaireTemplate = {
  id: QuestionnaireTemplateId
  questionnaireCode: string
  questionnaireName: string
  title: string
  description: string
  items: readonly QuestionnaireTemplateItem[]
}

const leadershipItems: readonly QuestionnaireTemplateItem[] = [
  [
    'PREZA_SEGURANCA',
    'Preza pela segurança',
    'Coloca a segurança pessoal e dos outros como prioridade, agindo de forma proativa para identificar e mitigar riscos.',
  ],
  [
    'RESPONSABILIDADE_DECISOES',
    'Responsabilidade sobre decisões',
    'Assume a responsabilidade por ações e decisões, entrega resultados nos prazos e busca soluções.',
  ],
  [
    'REGULAMENTO_INTERNO',
    'Regulamento interno',
    'Demonstra entendimento prático do regulamento interno, dos valores e dos princípios da Rodogarcia.',
  ],
  [
    'SENSO_DONO',
    'Senso de dono',
    'Atua pelo crescimento do negócio, com excelência e foco nos resultados para a Rodogarcia.',
  ],
  [
    'RELACIONAMENTO_INTERPESSOAL',
    'Relacionamento interpessoal',
    'Trata todas as pessoas com respeito e dignidade e promove um ambiente agradável.',
  ],
  ['COMUNICACAO', 'Comunicação', 'Comunica informações de forma clara, acessível e transparente.'],
  [
    'PROATIVIDADE',
    'Proatividade',
    'Antecipa possíveis problemas e assume postura proativa para fazer as coisas acontecerem.',
  ],
  [
    'QUALIDADE_TRABALHO',
    'Qualidade do trabalho',
    'Realiza atividades com qualidade, sem retrabalho e com foco no resultado estratégico.',
  ],
  [
    'NORMAS_REGRAS',
    'Cumprimento de normas e regras',
    'Pratica regras, normas e procedimentos com disciplina e comprometimento.',
  ],
  [
    'FATURAMENTO_SETOR',
    'Faturamento da filial/setor',
    'Cumpre metas de faturamento, custos e demais metas da filial ou área.',
  ],
  [
    'TRABALHO_EQUIPE',
    'Trabalho em equipe',
    'Colabora com a equipe, soma esforços e permanece acessível e disponível.',
  ],
  [
    'FLEXIBILIDADE',
    'Flexibilidade',
    'Adapta-se a ambientes e necessidades de mudança com flexibilidade e organização.',
  ],
  [
    'CRIATIVIDADE_PROBLEMAS',
    'Criatividade na resolução de problemas',
    'Compartilha conhecimento, propõe soluções e aprende com a experiência de outras pessoas.',
  ],
  [
    'MENTE_EMPREENDEDORA',
    'Mente empreendedora',
    'Mantém-se atualizado, ensina, aprende, inova e atua com senso de urgência.',
  ],
  [
    'GESTAO_TEMPO',
    'Gestão do tempo',
    'Organiza rotinas, prioridades e necessidades da operação ou da área.',
  ],
  [
    'FEEDBACK',
    'Feedback',
    'Oferece e solicita feedbacks necessários ao crescimento pessoal e da equipe.',
  ],
  [
    'DESENVOLVIMENTO_EQUIPE',
    'Desenvolvimento de equipe',
    'Encoraja a equipe a aceitar desafios e buscar padrões superiores de desempenho.',
  ],
  [
    'VISAO_SISTEMICA',
    'Visão sistêmica',
    'Integra processos, pessoas e recursos para alcançar os resultados da área.',
  ],
  ['DELEGACAO_TAREFAS', 'Delegação de tarefas', 'Delega e gerencia tarefas de forma eficiente.'],
  [
    'MELHORIA_CONTINUA',
    'Melhoria contínua da área/filial',
    'Propõe e executa melhorias contínuas e novas abordagens para a área ou filial.',
  ],
  [
    'APRIMORAMENTO',
    'Aprimoramento',
    'Busca conhecimentos e habilidades por cursos, faculdade, treinamentos e capacitações.',
  ],
].map(([code, name, description]) => ({ code, name, description }))

const collaboratorItems: readonly QuestionnaireTemplateItem[] = [
  [
    'APRENDIZAGEM',
    'Aprendizagem',
    'Desenvolve novas competências e habilidades dentro da própria função.',
  ],
  [
    'COMPROMETIMENTO',
    'Comprometimento',
    'Esforça-se, segue normas e condutas e se envolve com o propósito do setor.',
  ],
  [
    'TRABALHO_EQUIPE',
    'Trabalho em equipe',
    'Colabora com a equipe, soma esforços e permanece acessível e disponível.',
  ],
  [
    'RESPONSABILIDADE_CONFIANCA',
    'Responsabilidade e confiança',
    'Demonstra confiabilidade e responsabilidade por decisões, erros, informações e prazos.',
  ],
  [
    'RELACIONAMENTO_INTERPESSOAL',
    'Relacionamento interpessoal',
    'Interage com respeito e dignidade, promovendo um ambiente positivo.',
  ],
  ['COMUNICACAO', 'Comunicação', 'Comunica de forma clara, acessível, transparente e objetiva.'],
  ['PROATIVIDADE', 'Proatividade', 'Antecipa problemas e assume uma postura proativa.'],
  [
    'QUALIDADE_TRABALHO',
    'Qualidade do trabalho',
    'Trabalha com qualidade, sem retrabalho e no padrão exigido pela Rodogarcia.',
  ],
  [
    'CONDUTA_PESSOAL',
    'Conduta pessoal',
    'Cumpre regras, normas, procedimentos e instruções do superior imediato.',
  ],
  [
    'PONTUALIDADE_ASSIDUIDADE',
    'Pontualidade e assiduidade',
    'Cumpre horários e jornada de trabalho de forma integral.',
  ],
  [
    'FLEXIBILIDADE',
    'Flexibilidade',
    'Adapta-se a ambientes e necessidades de mudança com flexibilidade e organização.',
  ],
  [
    'CRIATIVIDADE_PROBLEMAS',
    'Criatividade na resolução de problemas',
    'Propõe ideias e soluções para situações inesperadas.',
  ],
  [
    'PRODUTIVIDADE',
    'Produtividade',
    'Trabalha com agilidade e atinge ou supera as expectativas da função.',
  ],
  ['GESTAO_TEMPO', 'Gestão do tempo', 'Organiza a rotina, cumpre prazos e atende às prioridades.'],
  [
    'RECURSOS',
    'Recursos',
    'Zela pelo local de trabalho, máquinas, equipamentos, ferramentas e limpeza.',
  ],
  [
    'CONHECIMENTO_TECNICO',
    'Conhecimento técnico',
    'Aplica o conhecimento necessário para exercer a função.',
  ],
  ['APRIMORAMENTO', 'Aprimoramento', 'Busca novos conhecimentos e habilidades em capacitações.'],
  [
    'PREZA_SEGURANCA',
    'Preza pela segurança',
    'Coloca a segurança pessoal e dos outros como prioridade, identificando e mitigando riscos.',
  ],
].map(([code, name, description]) => ({ code, name, description }))

const operationalItems = collaboratorItems
  .filter((item) => item.code !== 'GESTAO_TEMPO')
  .map((item) =>
    item.code === 'CONDUTA_PESSOAL'
      ? {
          ...item,
          description:
            'Cumpre regras, normas, procedimentos, uso de EPI e instruções do superior imediato.',
        }
      : item,
  )

export const questionnaireTemplates: readonly QuestionnaireTemplate[] = [
  {
    id: 'LIDERANCA',
    questionnaireCode: 'LIDERANCA',
    questionnaireName: 'Avaliação de liderança',
    title: 'Avaliação de liderança 2024.1',
    description: 'Competências de liderança da regra operacional 2024.1.',
    items: leadershipItems,
  },
  {
    id: 'COLABORADORES',
    questionnaireCode: 'ADMINISTRATIVO',
    questionnaireName: 'Avaliação de colaboradores',
    title: 'Avaliação de colaboradores 2024.1',
    description: 'Competências aplicáveis a colaboradores da regra operacional 2024.1.',
    items: collaboratorItems,
  },
  {
    id: 'OPERACIONAL',
    questionnaireCode: 'OPERACIONAL',
    questionnaireName: 'Avaliação operacional',
    title: 'Avaliação operacional 2024.1',
    description: 'Competências operacionais da regra operacional 2024.1.',
    items: operationalItems,
  },
]

export const assessmentScale = [
  { code: 'ABAIXO_ESPERADO', label: 'Abaixo do esperado', points: 80 },
  { code: 'EM_DESENVOLVIMENTO', label: 'Em desenvolvimento', points: 90 },
  { code: 'DENTRO_EXPECTATIVAS', label: 'Dentro das expectativas', points: 100 },
  { code: 'SUPERA_EXPECTATIVAS', label: 'Supera as expectativas', points: 110 },
  { code: 'REFERENCIA', label: 'É referência', points: 120 },
] as const

export function templateById(id: string): QuestionnaireTemplate | undefined {
  return questionnaireTemplates.find((template) => template.id === id)
}

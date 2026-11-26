export const integerFormat = new Intl.NumberFormat('pt-BR')
export const decimalFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const percentFormat = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatPercent(value: number) {
  return percentFormat.format(value / 100)
}

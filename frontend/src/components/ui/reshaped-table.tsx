// Reshaped Table — https://www.reshaped.so/docs/components/table
// Bundle pré-compilado: não altera a configuração PostCSS da aplicação.
// Nesta SPA, usar ReshapedTableScope para limitar tema/reset à tabela.
import { Table } from 'reshaped/bundle'
import type { TableProps } from 'reshaped/bundle'
import 'reshaped/bundle.css'
import 'reshaped/themes/slate/theme.css'

export type { TableProps }
export { Table }
export default Table

import type { ComponentPropsWithoutRef } from 'react'
import { Table } from './reshaped-table'
import { ReshapedTableScope } from './reshaped-table-scope'

export function AdministrativeTable({
  className,
  ...attributes
}: ComponentPropsWithoutRef<'table'>) {
  // A raiz do Table do pacote recebe atributos em uma div e não aceita caption.
  // Manter table/caption nativos preserva nome acessível e os seletores mobile.
  return (
    <ReshapedTableScope>
      <table
        {...attributes}
        className={['adc-administrative-table', className].filter(Boolean).join(' ')}
      />
    </ReshapedTableScope>
  )
}

function Head({ children, className, ...attributes }: ComponentPropsWithoutRef<'thead'>) {
  return (
    <Table.Head className={className} attributes={attributes}>
      {children}
    </Table.Head>
  )
}

function Body({ children, className, ...attributes }: ComponentPropsWithoutRef<'tbody'>) {
  return (
    <Table.Body className={className} attributes={attributes}>
      {children}
    </Table.Body>
  )
}

function Row({ children, className, ...attributes }: ComponentPropsWithoutRef<'tr'>) {
  return (
    <Table.Row className={className} attributes={attributes}>
      {children}
    </Table.Row>
  )
}

function Heading({
  children,
  className,
  colSpan,
  rowSpan,
  ...attributes
}: ComponentPropsWithoutRef<'th'>) {
  return (
    <Table.Heading
      className={className}
      colSpan={colSpan}
      rowSpan={rowSpan}
      attributes={attributes}
    >
      {children}
    </Table.Heading>
  )
}

function Cell({
  children,
  className,
  colSpan,
  rowSpan,
  ...attributes
}: ComponentPropsWithoutRef<'td'>) {
  return (
    <Table.Cell className={className} colSpan={colSpan} rowSpan={rowSpan} attributes={attributes}>
      {children}
    </Table.Cell>
  )
}

AdministrativeTable.Head = Head
AdministrativeTable.Body = Body
AdministrativeTable.Row = Row
AdministrativeTable.Heading = Heading
AdministrativeTable.Cell = Cell

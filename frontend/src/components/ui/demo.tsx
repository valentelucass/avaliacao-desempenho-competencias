import { Card } from 'reshaped/bundle'
import Table from '@/components/ui/reshaped-table'
import { ReshapedTableScope } from '@/components/ui/reshaped-table-scope'

export default function Demo() {
  return (
    <ReshapedTableScope>
      <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', padding: 24 }}>
        <Card raised padding={0}>
          <Table>
            <Table.Row highlighted>
              <Table.Heading>Column 1</Table.Heading>
              <Table.Heading colSpan={2}>Column 2</Table.Heading>
            </Table.Row>
            <Table.Row>
              <Table.Cell>Cell 1</Table.Cell>
              <Table.Cell>Cell 2</Table.Cell>
              <Table.Cell align="end">Cell 3</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>Cell 1</Table.Cell>
              <Table.Cell>Cell 2</Table.Cell>
              <Table.Cell align="end">Cell 3</Table.Cell>
            </Table.Row>
          </Table>
        </Card>
      </div>
    </ReshapedTableScope>
  )
}

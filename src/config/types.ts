import type { Role } from '../lib/auth'
import type { Row } from '../lib/refs'

export type FType = 'text' | 'number' | 'money' | 'date' | 'select' | 'ref' | 'checkbox' | 'textarea' | 'time'

export interface FieldDef {
  key: string
  label: string
  type: FType
  ref?: string
  /** server-side filter for ref options, may depend on header */
  refFilter?: (header: Row) => Record<string, unknown> | undefined
  /** client-side filter for ref options */
  refWhere?: (r: Row, header: Row) => boolean
  options?: { value: string; label: string }[]
  required?: boolean
  default?: unknown | ((h: Row) => unknown)
  show?: (header: Row) => boolean
  readOnly?: boolean
  /** computed value for display (lines) */
  compute?: (line: Row, header: Row) => number
  width?: string
  span?: 1 | 2 | 3 | 4
  hint?: string
}

export interface AskField extends FieldDef {}

export interface ActionCtx {
  navigate: (to: string) => void
  reload: () => Promise<void>
  ask: (title: string, fields: AskField[], initial?: Row) => Promise<Row | null>
  setLines: (fn: (lines: Row[]) => Row[]) => void
  header: Row
}

export interface DocAction {
  label: string
  show: (doc: Row) => boolean
  run: (doc: Row, ctx: ActionCtx) => Promise<string | void>
  variant?: 'primary' | 'secondary' | 'danger'
  confirm?: string
  /** save draft before running (default true for drafts) */
  saveFirst?: boolean
  roles?: Role[]
}

export interface PrintCol { key: string; label: string; type?: 'text' | 'money' | 'qty' | 'ref'; ref?: string; width?: string; align?: 'right' | 'left' | 'center' }

export interface PrintDef {
  title: string
  titleEn?: string
  partner?: 'customer' | 'supplier' | 'none'
  columns: PrintCol[]
  totals?: boolean
  signatures: string[]
  info?: (doc: Row) => { label: string; value: string }[]
  /** number of copies printed with labels, e.g. ['ต้นฉบับ','สำเนา'] */
  copies?: string[]
}

export interface DocConfig {
  key: string
  title: string
  short: string
  table: string
  linesTable: string
  fk: string
  read: Role[]
  write: Role[]
  header: FieldDef[]
  lines: FieldDef[]
  /** hidden line columns to preserve when re-saving lines */
  keepLineKeys?: string[]
  list: { key: string; label: string; type?: 'text' | 'money' | 'date' | 'ref' | 'select'; ref?: string; options?: { value: string; label: string }[] }[]
  totals: 'vat' | 'sum' | 'dc' | 'payroll' | 'none'
  sumKey?: string
  approve?: boolean
  post?: { rpc: string; label: string; confirm?: string; roles?: Role[] }
  voidable?: boolean
  actions?: DocAction[]
  print?: PrintDef
  statusless?: boolean
  noDocNo?: boolean
  editable?: (doc: Row) => boolean
  onLineChange?: (line: Row, key: string, header: Row) => Promise<Partial<Row> | void> | Partial<Row> | void
  onHeaderChange?: (header: Row, key: string, row?: Row | null) => Promise<Partial<Row> | void> | Partial<Row> | void
  listSelect?: string
  listFilter?: Record<string, unknown>
  help?: string
}

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RefDef {
  table: string
  select: string
  label: (r: Row) => string
  sub?: (r: Row) => string
  order?: string
  where?: Record<string, unknown>
  valueKey?: string
}

const ITEM_TYPE: Record<string, string> = { raw: 'วัตถุดิบ', packaging: 'บรรจุภัณฑ์', finished: 'สินค้าสำเร็จรูป', other: 'อื่นๆ' }
export const itemTypeLabel = (t: string) => ITEM_TYPE[t] ?? t
export const ITEM_TYPE_OPTIONS = Object.entries(ITEM_TYPE).map(([value, label]) => ({ value, label }))

export const REFS: Record<string, RefDef> = {
  items: {
    table: 'items', select: 'id,code,name,type,unit_id,sale_price,std_cost,track_lot,kg_per_unit,units(name)',
    label: (r) => `${r.code} · ${r.name}`, sub: (r) => `${itemTypeLabel(r.type)} · ${r.units?.name ?? ''}`,
    order: 'code', where: { active: true },
  },
  customers: { table: 'customers', select: 'id,code,name,credit_days,default_delivery,ship_address,address,tax_id', label: (r) => `${r.code} · ${r.name}`, order: 'code', where: { active: true } },
  suppliers: { table: 'suppliers', select: 'id,code,name,credit_days', label: (r) => `${r.code} · ${r.name}`, order: 'code', where: { active: true } },
  warehouses: { table: 'warehouses', select: 'id,code,name', label: (r) => r.name, order: 'code', where: { active: true } },
  carriers: { table: 'carriers', select: 'id,name,phone', label: (r) => r.name, order: 'name', where: { active: true } },
  units: { table: 'units', select: 'id,code,name', label: (r) => r.name, order: 'code', where: { active: true } },
  item_categories: { table: 'item_categories', select: 'id,name', label: (r) => r.name, order: 'name', where: { active: true } },
  departments: { table: 'departments', select: 'id,code,name', label: (r) => r.name, order: 'code', where: { active: true } },
  employees: { table: 'employees', select: 'id,code,full_name', label: (r) => `${r.code} · ${r.full_name}`, order: 'code', where: { active: true } },
  boms: { table: 'boms', select: 'id,name,item_id', label: (r) => r.name, order: 'name', where: { active: true } },
  accounts: { table: 'accounts', select: 'id,code,name,type', label: (r) => `${r.code} ${r.name}`, order: 'code', where: { is_group: false, active: true } },
  cash_accounts: { table: 'accounts', select: 'id,code,name', label: (r) => `${r.code} ${r.name}`, order: 'code', where: { is_cash: true, active: true } },
  group_accounts: { table: 'accounts', select: 'id,code,name', label: (r) => `${r.code} ${r.name}`, order: 'code', where: { is_group: true } },
  lots: { table: 'v_lot_expiry', select: 'lot_id,lot_no,exp_date,qty,item_id,warehouse_id', valueKey: 'lot_id', label: (r) => `${r.lot_no}${r.exp_date ? ' (หมดอายุ ' + r.exp_date + ')' : ''} คงเหลือ ${Number(r.qty)}`, order: 'exp_date' },
  open_ar: { table: 'v_open_items', select: 'id,doc_no,doc_date,due_date,amount,outstanding,customer_id', label: (r) => `${r.doc_no} ค้าง ${Number(r.outstanding).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, order: 'doc_date', where: { side: 'ar' } },
  open_ap: { table: 'v_open_items', select: 'id,doc_no,doc_date,due_date,amount,outstanding,supplier_id', label: (r) => `${r.doc_no} ค้าง ${Number(r.outstanding).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, order: 'doc_date', where: { side: 'ap' } },
  sales_invoices: { table: 'sales_invoices', select: 'id,doc_no,customer_id', label: (r) => r.doc_no, order: 'doc_no', where: { status: 'posted' } },
}

/* --------- tiny cache so every dropdown doesn't refetch --------- */
const cache = new Map<string, Promise<Row[]>>()
let version = 0
const listeners = new Set<() => void>()
export function invalidateRefs() {
  cache.clear()
  version++
  listeners.forEach((l) => l())
}

export function fetchRef(name: string, filter?: Record<string, unknown>): Promise<Row[]> {
  const key = name + JSON.stringify(filter ?? {})
  if (!cache.has(key)) {
    const def = REFS[name]
    let q = supabase.from(def.table).select(def.select).limit(5000)
    for (const [k, v] of Object.entries({ ...(def.where ?? {}), ...(filter ?? {}) })) {
      if (v === undefined || v === null || v === '') continue
      q = q.eq(k, v as never)
    }
    if (def.order) q = q.order(def.order, { ascending: true })
    const p = Promise.resolve(q).then(({ data, error }) => {
      if (error) { cache.delete(key); throw new Error(error.message) }
      return (data ?? []) as unknown as Row[]
    })
    cache.set(key, p)
  }
  return cache.get(key)!
}

export function useRefData(name: string, filter?: Record<string, unknown>, enabled = true) {
  const [rows, setRows] = useState<Row[]>([])
  const [v, setV] = useState(version)
  const fkey = JSON.stringify(filter ?? {})
  useEffect(() => {
    const l = () => setV(version)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  useEffect(() => {
    if (!enabled) return
    let alive = true
    fetchRef(name, filter).then((r) => alive && setRows(r)).catch(() => alive && setRows([]))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, fkey, v, enabled])
  return rows
}

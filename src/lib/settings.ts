import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { round2 } from './format'
import type { Row } from './refs'

let cached: Promise<Row> | null = null
export function loadSettings(force = false): Promise<Row> {
  if (!cached || force) {
    cached = Promise.resolve(supabase.from('company_settings').select('*').eq('id', 1).maybeSingle())
      .then(({ data }) => {
        if (!data) cached = null // not signed in yet / no access: retry next time
        return (data ?? { vat_rate: 7, name: '' }) as Row
      })
  }
  return cached
}
export function useSettings() {
  const [s, setS] = useState<Row>({ vat_rate: 7, name: '' })
  useEffect(() => { loadSettings().then(setS) }, [])
  return s
}

/** same math as SQL vat_split() */
export function vatSplit(sum: number, vatType: string, rate: number) {
  const p = round2(sum)
  if (vatType === 'exclude') {
    const vat = round2((p * rate) / 100)
    return { subtotal: p, vat, total: round2(p + vat) }
  }
  if (vatType === 'include') {
    const subtotal = round2((p * 100) / (100 + rate))
    return { subtotal, vat: round2(p - subtotal), total: p }
  }
  return { subtotal: p, vat: 0, total: p }
}

export const VAT_OPTIONS = [
  { value: 'exclude', label: 'แยก VAT (ราคาไม่รวมภาษี)' },
  { value: 'include', label: 'รวม VAT ในราคาแล้ว' },
  { value: 'none', label: 'ไม่มี VAT' },
]

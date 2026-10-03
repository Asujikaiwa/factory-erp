const nf2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf3 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 3 })

export const money = (v: unknown) => (v === null || v === undefined || v === '' ? '' : nf2.format(Number(v)))
export const qty = (v: unknown) => (v === null || v === undefined || v === '' ? '' : nf3.format(Number(v)))
export const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const TH_MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

/** 2026-10-03 -> 03/10/2569 */
export function dateTH(v?: string | null) {
  if (!v) return ''
  const [y, m, d] = v.slice(0, 10).split('-').map(Number)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`
}
/** 2026-10-03 -> 3 ตุลาคม 2569 */
export function dateLongTH(v?: string | null) {
  if (!v) return ''
  const [y, m, d] = v.slice(0, 10).split('-').map(Number)
  return `${d} ${TH_MONTH_FULL[m - 1]} ${y + 543}`
}
export function monthTH(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${TH_MONTH[m - 1]} ${String(y + 543).slice(2)}`
}
export const today = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
export const monthStart = (d = today()) => d.slice(0, 8) + '01'
export const monthEnd = (d = today()) => {
  const [y, m] = d.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${d.slice(0, 8)}${String(last).padStart(2, '0')}`
}
export const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() + n)
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Thai baht text: 1234.50 -> หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์ */
export function bahtText(amount: number): string {
  const n = round2(Math.abs(Number(amount) || 0))
  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']
  const readInt = (s: string): string => {
    if (s.length > 6) {
      const head = s.slice(0, s.length - 6), tail = s.slice(-6)
      return readInt(head) + 'ล้าน' + (Number(tail) ? readInt(String(Number(tail))) : '')
    }
    let out = ''
    const len = s.length
    for (let i = 0; i < len; i++) {
      const d = Number(s[i]), pos = len - i - 1
      if (d === 0) continue
      if (pos === 1 && d === 1) out += 'สิบ'
      else if (pos === 1 && d === 2) out += 'ยี่สิบ'
      else if (pos === 0 && d === 1 && len > 1) out += 'เอ็ด'
      else out += digits[d] + units[pos]
    }
    return out
  }
  const [b, s] = n.toFixed(2).split('.')
  const baht = Number(b) === 0 ? '' : readInt(b) + 'บาท'
  const satang = Number(s) === 0 ? 'ถ้วน' : readInt(String(Number(s))) + 'สตางค์'
  return (amount < 0 ? 'ลบ' : '') + (baht || (Number(s) ? '' : 'ศูนย์บาท')) + satang
}

export const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: 'ร่าง', cls: 'bg-slate-100 text-slate-600' },
  approved: { label: 'อนุมัติ', cls: 'bg-sky-100 text-sky-700' },
  posted: { label: 'บันทึกแล้ว', cls: 'bg-emerald-100 text-emerald-700' },
  closed: { label: 'ปิดแล้ว', cls: 'bg-violet-100 text-violet-700' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-rose-100 text-rose-600' },
  void: { label: 'ยกเลิก', cls: 'bg-rose-100 text-rose-600 line-through' },
}

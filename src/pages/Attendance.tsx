import { useCallback, useEffect, useState } from 'react'
import { Empty, PageHeader, Spinner, useRunner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { addDays, dateLongTH, monthEnd, monthStart, num, today } from '../lib/format'
import type { Row } from '../lib/refs'
import { check, supabase } from '../lib/supabase'

const STATUS = [
  { value: 'present', label: 'มาทำงาน' }, { value: 'half', label: 'ครึ่งวัน' }, { value: 'absent', label: 'ขาดงาน' },
  { value: 'leave', label: 'ลากิจ/พักร้อน' }, { value: 'sick', label: 'ลาป่วย' }, { value: 'holiday', label: 'วันหยุด' },
]

export default function Attendance() {
  const { can } = useAuth()
  const { busy, run } = useRunner()
  const [date, setDate] = useState(today())
  const [emps, setEmps] = useState<Row[] | null>(null)
  const [att, setAtt] = useState<Record<number, Row>>({})
  const [summary, setSummary] = useState<Row[]>([])

  const load = useCallback(async () => {
    setEmps(null)
    const e = check(await supabase.from('employees').select('id,code,full_name,position,pay_type').eq('active', true).order('code')) as Row[]
    const a = check(await supabase.from('attendance').select('*').eq('work_date', date)) as Row[]
    const m: Record<number, Row> = {}
    for (const x of a) m[x.employee_id] = x
    setEmps(e); setAtt(m)
    const s = check(await supabase.from('attendance').select('employee_id,status,ot_hours').gte('work_date', monthStart(date)).lte('work_date', monthEnd(date))) as Row[]
    setSummary(e.map((emp) => {
      const mine = s.filter((x) => x.employee_id === emp.id)
      const c = (st: string) => mine.filter((x) => x.status === st).length
      return { ...emp, present: c('present') + c('half') * 0.5, absent: c('absent') + c('half') * 0.5, leave: c('leave'), sick: c('sick'), ot: mine.reduce((t, x) => t + num(x.ot_hours), 0) }
    }))
  }, [date])
  useEffect(() => { load() }, [load])

  const set = (id: number, k: string, v: unknown) => setAtt((a) => ({ ...a, [id]: { ...(a[id] ?? { status: 'present', ot_hours: 0 }), [k]: v } }))
  const allPresent = () => setAtt((a) => {
    const n = { ...a }
    for (const e of emps ?? []) if (!n[e.id]) n[e.id] = { status: 'present', ot_hours: 0, time_in: '08:00', time_out: '17:00' }
    return n
  })
  async function save() {
    const rows = Object.entries(att).map(([eid, r]) => ({
      employee_id: Number(eid), work_date: date, status: r.status ?? 'present', time_in: r.time_in || null, time_out: r.time_out || null,
      ot_hours: num(r.ot_hours), note: r.note ?? null,
    }))
    if (!rows.length) throw new Error('ยังไม่มีข้อมูลให้บันทึก')
    check(await supabase.from('attendance').upsert(rows, { onConflict: 'employee_id,work_date' }))
    await load()
  }
  const editable = can('hr')

  return (
    <div>
      <PageHeader title="ลงเวลาทำงาน" sub={dateLongTH(date)}>
        <button className="btn-ghost" onClick={() => setDate(addDays(date, -1))}>← วันก่อน</button>
        <input type="date" className="input w-40" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn-ghost" onClick={() => setDate(addDays(date, 1))}>วันถัดไป →</button>
        {editable && <button className="btn-secondary" onClick={allPresent}>ทุกคนมาทำงาน</button>}
        {editable && <button className="btn-primary" disabled={busy} onClick={() => run(save, 'บันทึกการลงเวลาแล้ว')}>💾 บันทึก</button>}
      </PageHeader>
      <div className="card mb-5 overflow-auto">
        {emps === null ? <Spinner /> : emps.length === 0 ? <Empty text="ยังไม่มีพนักงาน — เพิ่มที่เมนู บุคคล > พนักงาน" /> : (
          <table className="tbl">
            <thead><tr><th>รหัส</th><th>ชื่อ</th><th>สถานะ</th><th>เข้า</th><th>ออก</th><th className="num">OT (ชม.)</th><th>หมายเหตุ</th></tr></thead>
            <tbody>{emps.map((e) => { const a = att[e.id]; return (
              <tr key={e.id} className={!a ? 'text-slate-400' : ''}>
                <td>{e.code}</td><td>{e.full_name}<div className="text-xs text-slate-400">{e.position}</div></td>
                <td><select className="input py-1" disabled={!editable} value={a?.status ?? ''} onChange={(ev) => set(e.id, 'status', ev.target.value)}>
                  <option value="">— ยังไม่บันทึก —</option>{STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></td>
                <td><input type="time" className="input py-1" disabled={!editable} value={(a?.time_in ?? '').slice(0, 5)} onChange={(ev) => set(e.id, 'time_in', ev.target.value)} /></td>
                <td><input type="time" className="input py-1" disabled={!editable} value={(a?.time_out ?? '').slice(0, 5)} onChange={(ev) => set(e.id, 'time_out', ev.target.value)} /></td>
                <td><input type="number" step="0.5" className="input w-24 py-1 text-right" disabled={!editable} value={a?.ot_hours ?? ''} onChange={(ev) => set(e.id, 'ot_hours', ev.target.value)} /></td>
                <td><input className="input py-1" disabled={!editable} value={a?.note ?? ''} onChange={(ev) => set(e.id, 'note', ev.target.value)} /></td>
              </tr>) })}</tbody>
          </table>
        )}
      </div>
      <h2 className="mb-2 font-semibold">สรุปเดือนนี้</h2>
      <div className="card overflow-auto">
        <table className="tbl">
          <thead><tr><th>พนักงาน</th><th className="num">วันทำงาน</th><th className="num">ขาด</th><th className="num">ลากิจ</th><th className="num">ลาป่วย</th><th className="num">OT (ชม.)</th></tr></thead>
          <tbody>{summary.map((s) => <tr key={s.id}><td>{s.code} {s.full_name}</td><td className="num">{s.present}</td><td className="num">{s.absent || ''}</td><td className="num">{s.leave || ''}</td><td className="num">{s.sick || ''}</td><td className="num">{s.ot || ''}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

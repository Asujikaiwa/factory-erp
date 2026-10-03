import { useCallback, useEffect, useState } from 'react'
import RefSelect, { RefLabel } from '../components/RefSelect'
import { Empty, Field, PageHeader, Spinner, useRunner } from '../components/ui'
import { ROLE_LABEL, useAuth, type Role } from '../lib/auth'
import type { Row } from '../lib/refs'
import { loadSettings } from '../lib/settings'
import { check, supabase } from '../lib/supabase'

/* ---------------- Users & roles ---------------- */
export function Users() {
  const { profile, reload } = useAuth()
  const { busy, run } = useRunner()
  const [rows, setRows] = useState<Row[] | null>(null)
  const load = useCallback(async () => {
    setRows(check(await supabase.from('profiles').select('*').order('created_at')) as Row[])
  }, [])
  useEffect(() => { load() }, [load])

  async function save(r: Row) {
    if (r.id === profile?.id && !r.roles.includes('admin')) throw new Error('ห้ามถอดสิทธิ์ผู้ดูแลระบบของตัวเอง')
    check(await supabase.from('profiles').update({ roles: r.roles, active: r.active, full_name: r.full_name, department_id: r.department_id }).eq('id', r.id))
    await load(); await reload()
  }
  const toggle = (r: Row, role: Role) => setRows((rs) => rs!.map((x) => x.id === r.id
    ? { ...x, roles: x.roles.includes(role) ? x.roles.filter((y: Role) => y !== role) : [...x.roles, role], _dirty: true } : x))

  return (
    <div>
      <PageHeader title="ผู้ใช้งานและสิทธิ์" sub="ให้พนักงานลงทะเบียนเองที่หน้าเข้าสู่ระบบ แล้วติ๊กสิทธิ์ตามแผนกที่นี่ (ผู้บริหาร = ดูได้ทุกอย่าง แก้ไขไม่ได้)" />
      <div className="card overflow-auto">
        {rows === null ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <table className="tbl">
            <thead><tr><th>ชื่อ / อีเมล</th><th>แผนก</th>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <th key={r} className="text-center">{ROLE_LABEL[r]}</th>)}<th>ใช้งาน</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className={r.roles.length === 0 ? 'bg-amber-50' : ''}>
                <td><input className="input py-1" value={r.full_name ?? ''} onChange={(e) => setRows((rs) => rs!.map((x) => x.id === r.id ? { ...x, full_name: e.target.value, _dirty: true } : x))} />
                  <div className="text-xs text-slate-500">{r.email}{r.roles.length === 0 && ' · รอกำหนดสิทธิ์'}</div></td>
                <td className="min-w-40"><RefSelect refName="departments" value={r.department_id} onChange={(v) => setRows((rs) => rs!.map((x) => x.id === r.id ? { ...x, department_id: v, _dirty: true } : x))} /></td>
                {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                  <td key={role} className="text-center"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={r.roles.includes(role)} onChange={() => toggle(r, role)} /></td>
                ))}
                <td className="text-center"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={r.active} onChange={(e) => setRows((rs) => rs!.map((x) => x.id === r.id ? { ...x, active: e.target.checked, _dirty: true } : x))} /></td>
                <td>{r._dirty && <button className="btn-primary py-1" disabled={busy} onClick={() => run(() => save(r), 'บันทึกสิทธิ์แล้ว')}>บันทึก</button>}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ---------------- Company settings ---------------- */
const SETTING_FIELDS: { key: string; label: string; type?: string; span?: boolean; hint?: string }[] = [
  { key: 'name', label: 'ชื่อบริษัท (ไทย)', span: true }, { key: 'name_en', label: 'ชื่อบริษัท (อังกฤษ)', span: true },
  { key: 'tax_id', label: 'เลขประจำตัวผู้เสียภาษี' }, { key: 'branch', label: 'สาขา' }, { key: 'phone', label: 'โทรศัพท์' }, { key: 'email', label: 'อีเมล' },
  { key: 'address', label: 'ที่อยู่', type: 'textarea', span: true }, { key: 'logo_url', label: 'ลิงก์รูปโลโก้ (URL)', span: true },
  { key: 'vat_rate', label: 'อัตรา VAT (%)', type: 'number' },
  { key: 'lock_date', label: 'ปิดงวดถึงวันที่', type: 'date', hint: 'ห้ามบันทึก/ยกเลิกเอกสารที่ลงวันที่ก่อนหรือเท่ากับวันนี้' },
  { key: 'allow_negative_stock', label: 'อนุญาตสต๊อกติดลบ', type: 'checkbox' },
  { key: 'sso_rate', label: 'อัตราประกันสังคม (%)', type: 'number' }, { key: 'sso_wage_ceiling', label: 'ฐานค่าจ้างสูงสุด ปกส. (บาท)', type: 'number' },
  { key: 'ot_multiplier', label: 'อัตรา OT (เท่า)', type: 'number' }, { key: 'work_hours_per_day', label: 'ชั่วโมงทำงาน/วัน', type: 'number' },
]
export function CompanySettings() {
  const { busy, run } = useRunner()
  const [s, setS] = useState<Row | null>(null)
  useEffect(() => { loadSettings(true).then(setS) }, [])
  if (!s) return <Spinner />
  async function save() {
    const p: Row = {}
    for (const f of SETTING_FIELDS) p[f.key] = s![f.key] === '' ? null : s![f.key]
    check(await supabase.from('company_settings').update(p).eq('id', 1))
    await loadSettings(true)
  }
  return (
    <div>
      <PageHeader title="ข้อมูลบริษัท / ตั้งค่าระบบ" sub="ข้อมูลนี้แสดงบนหัวเอกสารที่พิมพ์ทุกใบ">
        <button className="btn-primary" disabled={busy} onClick={() => run(save, 'บันทึกการตั้งค่าแล้ว')}>💾 บันทึก</button>
      </PageHeader>
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {SETTING_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} className={f.span ? 'sm:col-span-2' : ''}>
            {f.type === 'checkbox' ? <div className="py-1.5"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!s[f.key]} onChange={(e) => setS({ ...s, [f.key]: e.target.checked })} /></div>
              : f.type === 'textarea' ? <textarea className="input" rows={2} value={s[f.key] ?? ''} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />
              : <input className="input" type={f.type ?? 'text'} value={s[f.key] ?? ''} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />}
            {f.hint && <span className="mt-0.5 block text-xs text-slate-400">{f.hint}</span>}
          </Field>
        ))}
      </div>
    </div>
  )
}

/* ---------------- GL mapping ---------------- */
export function GlMapping() {
  const { can } = useAuth()
  const { busy, run } = useRunner()
  const [rows, setRows] = useState<Row[] | null>(null)
  const load = useCallback(async () => setRows(check(await supabase.from('gl_mapping').select('*').order('key')) as Row[]), [])
  useEffect(() => { load() }, [load])
  return (
    <div>
      <PageHeader title="ผูกบัญชีอัตโนมัติ" sub="เอกสารแต่ละประเภทจะลงบัญชีตามรหัสบัญชีที่ผูกไว้ที่นี่" />
      <div className="card overflow-auto">
        {rows === null ? <Spinner /> : (
          <table className="tbl">
            <thead><tr><th>รายการ</th><th>บัญชีที่ใช้</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.key}><td>{r.label}<div className="text-xs text-slate-400">{r.key}</div></td>
                <td className="w-96"><RefSelect refName="accounts" value={r.account_id} disabled={!can('accounting') || busy}
                  onChange={(v) => v && run(async () => { check(await supabase.from('gl_mapping').update({ account_id: v }).eq('key', r.key)); await load() }, 'บันทึกแล้ว')} /></td></tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ---------------- Audit log ---------------- */
export function AuditLog() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [table, setTable] = useState('')
  const [users, setUsers] = useState<Map<string, string>>(new Map())
  useEffect(() => { supabase.from('profiles').select('id,full_name').then(({ data }) => setUsers(new Map((data ?? []).map((u) => [u.id, u.full_name])))) }, [])
  useEffect(() => {
    setRows(null)
    let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(300)
    if (table) q = q.eq('table_name', table)
    q.then(({ data }) => setRows((data ?? []) as Row[]))
  }, [table])
  const changed = (r: Row) => {
    if (r.action !== 'UPDATE') return r.action === 'INSERT' ? 'สร้างใหม่' : 'ลบ'
    const keys = Object.keys(r.new_data ?? {}).filter((k) => !['updated_at'].includes(k) && JSON.stringify(r.old_data?.[k]) !== JSON.stringify(r.new_data?.[k]))
    return keys.map((k) => `${k}: ${JSON.stringify(r.old_data?.[k])} → ${JSON.stringify(r.new_data?.[k])}`).join(' · ')
  }
  return (
    <div>
      <PageHeader title="ประวัติการแก้ไขข้อมูล" sub="บันทึกอัตโนมัติทุกครั้งที่มีการสร้าง แก้ไข หรือลบเอกสาร/ข้อมูลหลัก (300 รายการล่าสุด)">
        <input className="input w-56" placeholder="ชื่อตาราง เช่น sales_invoices" value={table} onChange={(e) => setTable(e.target.value.trim())} />
      </PageHeader>
      <div className="card overflow-auto">
        {rows === null ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <table className="tbl">
            <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>ตาราง</th><th>เลขที่/ID</th><th>การเปลี่ยนแปลง</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap">{new Date(r.at).toLocaleString('th-TH')}</td><td>{users.get(r.user_id) ?? '-'}</td><td>{r.table_name}</td>
                <td>{(r.new_data ?? r.old_data)?.doc_no ?? r.record_id}</td><td className="max-w-xl truncate text-xs text-slate-600" title={changed(r)}>{changed(r)}</td></tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export { RefLabel }

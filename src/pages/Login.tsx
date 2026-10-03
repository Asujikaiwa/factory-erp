import { useState } from 'react'
import { Field, useRunner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const { busy, run } = useRunner()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    await run(async () => {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message === 'Email not confirmed' ? 'ยังไม่ได้ยืนยันอีเมล กรุณากดลิงก์ในอีเมล' : error.message)
      } else {
        if (password.length < 8) throw new Error('รหัสผ่านอย่างน้อย 8 ตัวอักษร')
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
        if (error) throw new Error(error.message)
        if (!data.session) setMsg('ลงทะเบียนแล้ว — กรุณายืนยันอีเมลจากลิงก์ในกล่องจดหมาย จากนั้นรอผู้ดูแลระบบกำหนดสิทธิ์')
      }
    })
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-700">Factory ERP</div>
          <h1 className="text-xl font-semibold">{mode === 'in' ? 'เข้าสู่ระบบ' : 'ลงทะเบียนผู้ใช้ใหม่'}</h1>
        </div>
        {mode === 'up' && <Field label="ชื่อ-นามสกุล"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        <Field label="อีเมล"><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="รหัสผ่าน"><input className="input" type="password" required autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {msg && <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}
        <button className="btn-primary w-full py-2" disabled={busy}>{mode === 'in' ? 'เข้าสู่ระบบ' : 'ลงทะเบียน'}</button>
        <button type="button" className="btn-ghost w-full" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg('') }}>
          {mode === 'in' ? 'ยังไม่มีบัญชี? ลงทะเบียน' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
        </button>
        <p className="text-xs text-slate-400">ผู้ลงทะเบียนคนแรกจะเป็นผู้ดูแลระบบ · คนถัดไปต้องรอผู้ดูแลกำหนดสิทธิ์ก่อนใช้งาน</p>
      </form>
    </div>
  )
}

export function Pending() {
  const { profile, reload } = useAuth()
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="card max-w-md space-y-3 p-6 text-center">
        <div className="text-4xl">⏳</div>
        <h1 className="text-lg font-semibold">รอผู้ดูแลระบบกำหนดสิทธิ์</h1>
        <p className="text-sm text-slate-500">บัญชี {profile?.email} ลงทะเบียนแล้ว แต่ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาแจ้งผู้ดูแลระบบ{profile && !profile.active ? ' (บัญชีถูกปิดใช้งาน)' : ''}</p>
        <div className="flex justify-center gap-2">
          <button className="btn-secondary" onClick={() => reload()}>ตรวจสอบอีกครั้ง</button>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
        </div>
      </div>
    </div>
  )
}

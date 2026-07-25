import { SalaMark } from '@/components/SalaMark'
import { LoginForm } from './login-form'

// Sign-in only. Sala is invite-only (ADR 0003) — there is no sign-up path, and a
// person who is not already a user in Supabase cannot make themselves one here.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center gap-3">
          <SalaMark className="h-10 w-10 text-ink" />
          <div className="flex flex-col leading-tight">
            <span className="text-2xl font-bold">Sala</span>
            <span className="font-mono text-xs text-muted">ศาลา</span>
          </div>
        </div>

        <div>
          <h1 className="text-lg font-semibold">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-muted">
            กรอกอีเมลของคุณ เราจะส่งลิงก์สำหรับเข้าสู่ระบบไปให้
          </p>
        </div>

        <LoginForm next={next} />
      </div>
    </main>
  )
}

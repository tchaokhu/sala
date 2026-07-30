import { SalaMark } from '@/components/SalaMark'
import { LoginForm, type LinkError } from './login-form'

// Sign-in only. Sala is invite-only — there is no sign-up path, and a person who
// is not already a user in Supabase cannot make themselves one here. What
// enforces that is `shouldCreateUser: false` in the form; Memberships are granted
// out of band (ADR 0002), so an account without one lands on the "no agency yet"
// state at the root rather than anywhere with data.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams

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

        <LoginForm next={next} linkError={parseLinkError(error)} />
      </div>
    </main>
  )
}

/** Only the two reasons the callback sends. A typo or a hand-edited param shows
 *  no notice at all, rather than an empty box claiming something went wrong. */
function parseLinkError(value: string | undefined): LinkError | undefined {
  return value === 'expired' || value === 'device' ? value : undefined
}

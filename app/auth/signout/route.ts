import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Sign out is a POST, never a GET: a link or a prefetch must not be able to end
// someone's session. The form in the shell posts here.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}

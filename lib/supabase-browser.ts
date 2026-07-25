'use client'

// The browser Supabase client. It holds the same anon key the server uses and
// is limited by the same RLS — the key is public by design. Its one job here is
// the sign-in call: requesting a magic link. Every read and write of real data
// goes through the server (ADR 0002), so this client never fetches Org rows.

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

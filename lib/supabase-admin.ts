// The one place the service role key is read.
//
// This client bypasses every Row Level Security policy in the database. It is
// not a more convenient Supabase client — it is the credential ADR 0001's whole
// isolation story is written against, and ADR 0006 is the argument for it
// existing in a request path at all.
//
// The bounds, restated here because this is the file somebody will open when
// they want to reuse it:
//
//   * Orgs, Memberships and auth.admin. Nothing under Inventory, Tenancy or
//     Leads in CONTEXT.md — an Org's books are closed to the operator too.
//   * Importable from app/admin/ only. tests/no-service-role-leak.test.ts reads
//     the source tree and fails the build otherwise.
//   * Every caller re-checks isSuperadmin first. A Server Action is an HTTP
//     endpoint; no layout runs in front of it.
//
// If you are here because something else needs elevated access, the answer is an
// ADR, not an import.

import 'server-only'

import { createClient } from '@supabase/supabase-js'

function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set, so the Superadmin console cannot read anything. ` +
      `Supabase → Project Settings → API Keys → Secret keys: copy the ` +
      `sb_secret_… value (on older projects it is the service_role JWT under ` +
      `Legacy API keys). Put it in .env.local — never with a NEXT_PUBLIC_ ` +
      `prefix, and never in .env.local.example, which is tracked in git.`,
    )
  }
  return value
}

/** A Supabase client holding the service role key. No session, no cookies: it
 *  carries no user, which is also why nothing about the *caller* can be inferred
 *  from it. Authorisation is the caller's job, before this is ever reached.
 *
 *  Not memoised with React `cache` like the request-scoped client, because there
 *  is nothing request-scoped about it — it is the same client every time, and
 *  creating one is assembling an object, not a round-trip. */
export function createAdminClient() {
  return createClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        // Nothing here is a user session and none of it should be written
        // anywhere that a later request could pick up as one.
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}

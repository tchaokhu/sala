# The session is verified from the token, except in the console

Every Org page waited on four network round-trips in series before it could
send a byte: the proxy asked the auth server who the caller was, the Org layout
asked it again, then the Org was read by slug, then the page's own queries ran.
Measured against the project from Bangkok (2026-10-02, production build), each
was about 50 ms and a page took 210–230 ms; the two auth calls were half of it,
and they asked the same question.

The project signs its JWTs with an asymmetric key (ES256 — its
`/.well-known/jwks.json` lists one). That means the signature can be checked
locally with the public key, which supabase-js caches per process. So the proxy
(`lib/supabase-middleware.ts`) and `currentUser` (`lib/supabase-server.ts`) use
`auth.getClaims()` instead of `auth.getUser()`. `getClaims` still refreshes an
expiring session, so the proxy keeps its job of rotating the cookies.

**What this gives up.** `getUser` asks the auth server whether the user still
exists; a verified token only says it did when the token was issued. A user
deleted or banned in Auth keeps working until the token expires — an hour by
Supabase's default (Auth settings, JWT expiry). Signing out is unaffected (the cookies go).
Removing a **Membership** is unaffected too: `requireMember` reads it from the
database on every request, and every query runs under RLS as the token's
`sub`. In this product access is granted and revoked through Memberships, not
by deleting Auth users, so the window covers a case that does not come up in
normal operation.

**The Superadmin console keeps `getUser`.** `requireSuperadmin` goes through
`verifiedUser`, which asks the auth server every time. The console's actions run
on the service role (ADR 0006), where RLS no longer limits anything, so an
operator deleted in Auth must lose it at once. The console is used rarely and by
one person; the extra round-trip there costs nothing anyone notices.

If the project is ever moved back to a symmetric (HS256) secret, `getClaims`
falls back to calling the auth server itself. Nothing breaks; the saving is just
gone. The JWKS endpoint is the thing to check.

## Rejected

- **Keep `getUser` everywhere.** Correct, and a hundred milliseconds on every
  page for a revocation path the product does not use.
- **Drop the check from the layout and trust the proxy.** The proxy's result
  does not reach the render, and a Server Action is an endpoint no layout runs in
  front of (ADR 0002). Each must verify on its own; this ADR only makes the
  verification local.
- **`getSession()`.** Reads the cookie without verifying the signature. Anyone
  can write a cookie.
- **`getClaims` in the console as well.** Saves one round-trip on a page used a
  few times a month, and widens the window on the one path that bypasses RLS.

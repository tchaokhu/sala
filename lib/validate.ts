// Shared input validation helpers — pure, no I/O.

// Allow only http(s) URLs. Strips javascript:, data:, vbscript:, file:, etc.
// Returns null when invalid so callers can decide between "reject" and "blank".
export function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return parsed.toString()
}

// Throwing variant for save paths where we want a clear error message.
export function requireHttpUrl(input: string | null | undefined, fieldLabel = 'URL'): string {
  const ok = safeHttpUrl(input)
  if (!ok) throw new Error(`${fieldLabel} ต้องเป็น http:// หรือ https:// เท่านั้น`)
  return ok
}

// Basic length-bounded string sanitiser. Trims whitespace, enforces max length.
export function cleanText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return ''
  const trimmed = input.trim()
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

// Thai/international phone number — digits, spaces, dashes, parens, plus sign.
export function isPhone(input: string): boolean {
  const stripped = input.replace(/[\s\-()]/g, '')
  return /^\+?\d{6,15}$/.test(stripped)
}

// Lightweight email check — not RFC-perfect, but rejects obvious garbage.
export function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)
}

// Mask PII for list rendering. "1-2345-67890-12-3" → "•••••••••••••••3".
// Keeps the last `visible` digits, masks every other digit with •, preserves
// other characters (dashes, spaces) so the shape stays familiar.
export function maskTrailing(input: string | null | undefined, visible = 4): string {
  if (!input) return ''
  const digits = input.replace(/\D/g, '')
  if (digits.length <= visible) return input
  const showFrom = digits.length - visible
  let seenDigits = 0
  let out = ''
  for (const ch of input) {
    if (/\d/.test(ch)) {
      out += seenDigits >= showFrom ? ch : '•'
      seenDigits++
    } else {
      out += ch
    }
  }
  return out
}

/** What a Server Action hands back to the form that called it.
 *
 *  A discriminated union rather than a thrown error, because the caller is a
 *  form and the answer is copy: failure has a message the person can act on
 *  (CLAUDE.md — errors say what to do next), and success has one too, since
 *  several of these actions finish somewhere other than the screen. Refusals
 *  that are nobody's business — a caller who is not a Superadmin — still throw.
 */
export type ActionResult =
  /** Success is said in a toast: `message` is the headline — "<Thing> <past
   *  verb>", "Building saved" — and `detail` the specific name or number that
   *  says which one, "Lumpini Park Rama 9". No "successfully", no "!". */
  | { ok: true; message: string; detail?: string }
  | { ok: false; message: string }

/**
 * Director Mode (assist lane) feature flag — the SINGLE source of truth.
 *
 * Two env vars exist on purpose:
 *   NEXT_PUBLIC_DIRECTOR_MODE_ENABLED — the one deploy variable that drives both
 *     the client toggle and (by fallback) the server gate.
 *   DIRECTOR_MODE_ENABLED — server-only override. Set it to 'false' to kill the
 *     lane server-side without rebuilding the client bundle.
 *
 * What must NOT drift is the PARSING RULE. It used to be copy-pasted in three
 * places (both client gates + the server gate); a fourth accepted value added to
 * one copy would silently desync the toggle from the intake route. One rule now,
 * imported everywhere.
 *
 * Client-safety: this module is a pure leaf (no db/server imports) so client
 * components can import it. `isAssistLaneVisible` references
 * `process.env.NEXT_PUBLIC_DIRECTOR_MODE_ENABLED` as a STATIC literal — Next.js
 * only inlines the value into the browser bundle when it appears literally, so a
 * dynamic `env[name]` lookup here would silently evaluate to undefined and hide
 * the toggle in production. Do not "simplify" it into a variable lookup.
 */

/** The one accepted-values rule. Case-sensitive by design ('TRUE' is not 'true'). */
export function parseAssistFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

/**
 * Client-visible gate: should the Auto-edit / Director toggle render?
 * Reads only the public var — the server-only override is not present in the browser.
 * The server still enforces `isAssistIntakeEnabled`, so hiding is never the only gate.
 */
export function isAssistLaneVisible(): boolean {
  return parseAssistFlag(process.env.NEXT_PUBLIC_DIRECTOR_MODE_ENABLED);
}

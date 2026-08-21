/**
 * Internal-tools gate — fail-closed.
 *
 * Some dashboard surfaces are operator tools, not customer features: the Editron
 * debug console (its actions spend real provider money and expose signed asset
 * URLs) and the MG judge-calibration review (its labels are written to the
 * calibration ground-truth store). Clerk middleware alone lets ANY logged-in
 * customer reach them, so each such page/route must also pass this gate.
 *
 * Enable per-deploy by setting INTERNAL_TOOLS_ENABLED=true (server-only var —
 * deliberately NOT NEXT_PUBLIC; the flag itself should not ship to browsers).
 * Unset/anything else = disabled, so a fresh environment is safe by default.
 */
export function internalToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.INTERNAL_TOOLS_ENABLED;
  return v === 'true' || v === '1';
}

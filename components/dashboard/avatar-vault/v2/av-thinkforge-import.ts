/**
 * Pure helpers for the Avatar Vault ↔ ThinkForge script entry points.
 *
 * Two entry modes, both reusing existing ThinkForge endpoints (no new backend):
 *  - "Generate with AI"  → route the user to ThinkForge to write a script for this
 *    avatar, carrying a return link.
 *  - "Import from ThinkForge" → list the user's scripts (script/list-all), let them
 *    pick one, fetch its plain text (script/get) into the planner's script field.
 */

export const THINKFORGE_ROUTE = '/dashboard/thinkforge';
export const AVATAR_VAULT_ROUTE = '/dashboard/avatar-vault';

export interface ThinkForgeScriptListItem {
  scriptId: string;
  sessionId: string;
  title: string;
  documentType?: string;
  updatedAt?: string;
}

/** URL that sends the user to ThinkForge to write a script for this avatar, with a return hint. */
export function thinkForgeGenerateHref(avatarRecordId: string): string {
  const params = new URLSearchParams({ sourceAvatarId: avatarRecordId, returnTo: AVATAR_VAULT_ROUTE });
  return `${THINKFORGE_ROUTE}?${params.toString()}`;
}

/** Normalize the /script/list-all response into a clean, renderable list. */
export function extractScriptList(res: unknown): ThinkForgeScriptListItem[] {
  const scripts = (res as { scripts?: unknown } | null)?.scripts;
  if (!Array.isArray(scripts)) return [];
  return scripts
    .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
    .map((s) => ({
      scriptId: String(s.scriptId ?? 'default'),
      sessionId: String(s.sessionId ?? ''),
      title: typeof s.title === 'string' && s.title.trim() ? s.title : 'Untitled Script',
      documentType: typeof s.documentType === 'string' ? s.documentType : undefined,
      updatedAt: s.updatedAt ? String(s.updatedAt) : undefined,
    }))
    .filter((s) => s.sessionId);
}

/** Pull the plain script text out of the /script/get response (or null if empty). */
export function extractScriptContent(res: unknown): string | null {
  const content = (res as { script?: { content?: unknown } } | null)?.script?.content;
  return typeof content === 'string' && content.trim() ? content : null;
}

/** Build the /script/get URL for a chosen list item. */
export function scriptGetUrl(item: { sessionId: string; scriptId: string }): string {
  const params = new URLSearchParams({ sessionId: item.sessionId, scriptId: item.scriptId });
  return `/api/services/thinkforge/script/get?${params.toString()}`;
}

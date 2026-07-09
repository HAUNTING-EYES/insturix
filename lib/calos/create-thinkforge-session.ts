import * as db from "@/lib/thinkforge/services/db";
import { applyCommand } from "@/lib/thinkforge/services/command-service";
import {
  ensureThinkForgeBlockId,
  normalizeThinkForgeRichText,
  type ThinkForgeBlock,
  type ThinkForgeBlockKind,
} from "@/lib/thinkforge/schemas/thinkforge-block";

/**
 * Make a CalOS-generated post/script a first-class ThinkForge session.
 *
 * CalOS's Generate calls ThinkForge's writer BRAIN directly and, until now, kept the text only on the
 * calendar card. This creates a real ThinkForge SESSION for that content, so the day's deliverable is
 * visible + refinable in ThinkForge (and — later — image-ready via the same Clickatron export path).
 *
 * Reuses ThinkForge's own primitives: `db.getOrCreateSession` (create) + `applyCommand(ReplaceDocument)`
 * (save the script). Best-effort by contract: any failure returns null and NEVER fails the underlying
 * CalOS generation — the card still holds the copy regardless.
 *
 * 1a of the CalOS↔ThinkForge linkage. Follow-ups (deliberately not here): stamp the sidecar
 * (creative spec + contentCardId/campaignId/date) for image-readiness (1b), and the two-way write-back
 * so edits in either surface ripple (1c).
 */

/** Split plain writer text into ThinkForge paragraph blocks (its editor is block-based). */
function textToParagraphBlocks(text: string): ThinkForgeBlock[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({
      id: ensureThinkForgeBlockId(),
      kind: "paragraph" as ThinkForgeBlockKind,
      content: normalizeThinkForgeRichText(p),
    }));
}

export interface CreateLinkedSessionParams {
  userId: string;
  orgId: string | null;
  brandId: string;
  deliverableId: string;
  campaignId: string | null;
  title: string;
  content: string;
}

/** Returns the new ThinkForge sessionId, or null on any failure (best-effort — never throws). */
export async function createLinkedThinkForgeSession(
  params: CreateLinkedSessionParams,
): Promise<string | null> {
  const { userId, orgId, title, content } = params;
  if (!content.trim()) return null;

  try {
    // undefined sessionId => create a new one. (Direct db call, not the /session route, so we skip the
    // route's Editron script-stage project side-effect — a still post/caption doesn't need one.)
    const session = await db.getOrCreateSession(userId, undefined, undefined, orgId ?? undefined);
    const sessionId = session?._id;
    if (!sessionId) return null;

    const res = await applyCommand(
      {
        type: "ReplaceDocument",
        sessionId,
        baseVersion: 0, // ReplaceDocument on a fresh session's script creates it regardless of base
        source: "ai",
        payload: {
          scriptId: "default",
          title: title.trim() || "Untitled",
          content,
          blocks: textToParagraphBlocks(content),
        },
      },
      userId,
    );
    if (!res.ok) {
      // The session exists even if the first script write conflicted; still return the id so the card
      // links to it. Loud (R18N) — a persistent failure here is a real wiring bug.
      console.warn("[CalOS] ThinkForge script save failed (session still linked):", res.error);
    }
    return sessionId;
  } catch (err) {
    console.warn(
      "[CalOS] ThinkForge session creation failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

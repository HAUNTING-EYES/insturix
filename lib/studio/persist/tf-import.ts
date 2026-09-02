import * as tfdb from "@/lib/thinkforge/services/db";
import { appendTurnEvent, claimTfImport, releaseTfImportClaim } from "./db";

/**
 * ThinkForge conversation import (migration plan §10): old TF sessions become
 * spine Projects whose event log starts with the imported chat history, in
 * original order, BEFORE any new turn appends to the same log. Scripts stay
 * TF artifacts — only the visible conversation moves. The claim in db.ts
 * guarantees the import runs exactly once per project even when the turns
 * route and the events route race.
 */

const IMPORT_LIMIT = 500;

type TfMessage = { _id?: unknown; role?: string | null; content?: string | null; createdAt?: unknown };

const iso = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" || typeof v === "number") return new Date(v).toISOString();
  return new Date().toISOString();
};

const ms = (v: unknown): number => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" || typeof v === "number") return new Date(v).getTime();
  return 0;
};

/** Idempotent: no-op for non-TF ids, already-imported projects, or empty history. */
export async function ensureThreadBootstrapped(projectId: string): Promise<void> {
  if (!projectId.startsWith("session_")) return;
  try {
    const history = (await tfdb.getChatHistory(projectId, IMPORT_LIMIT)) as unknown as TfMessage[];
    if (!history.length) return;
    if (!(await claimTfImport(projectId))) return; // someone else imported (or is importing)
    let written = 0;
    for (const m of [...history].sort((a, b) => ms(a.createdAt) - ms(b.createdAt))) {
      const id = `tf_${String(m._id ?? `${written}_`)}`;
      const createdAt = iso(m.createdAt);
      const text = m.content ?? "";
      /* §10: imported events are MARKED as coming from ThinkForge — ids keep
       * the tf_ prefix and the payload carries the origin for any consumer */
      const saved = m.role === "user"
        ? await appendTurnEvent(projectId, { actor: "user", kind: "user", turnId: null, payload: { kind: "user", id, text, attachments: [], mentions: [], createdAt, importedFrom: "thinkforge" } })
        : await appendTurnEvent(projectId, { actor: "agent", kind: "prose", turnId: null, payload: { kind: "prose", id, text, createdAt, importedFrom: "thinkforge" } });
      if (saved) written++;
    }
    if (!written) {
      await releaseTfImportClaim(projectId); // history exists but nothing landed — let a later pass retry
      console.error(`[spine] TF import for ${projectId} wrote 0 events — claim released for retry`);
    }
  } catch (error) {
    console.error(`[spine] TF import failed for ${projectId}`, error);
    await releaseTfImportClaim(projectId).catch(() => undefined);
  }
}

/**
 * Cross-Document Synchronization Service
 *
 * Handles manual, user-triggered synchronization between documents.
 * When a user explicitly requests it (e.g., "Update VFX brief from my screenplay"),
 * this service coordinates the process.
 *
 * All sync operations are manual — no ambient triggers.
 */

import * as db from './db';
import { getDependentsOf, getDependenciesOf, type DocumentDependency } from '../blueprints/requirement-graph';
import type { DocumentType } from '../state/types';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { extractTextFromRichText } from '../utils/thinkforge-block-patch';

export interface SyncRequest {
  sessionId: string;
  userId: string;
  sourceScriptId: string;
  targetScriptId: string;
}

export interface SyncCheckResult {
  needsSync: boolean;
  sourceTitle: string;
  targetTitle: string;
  sourceType: string;
  targetType: string;
  dependents: DocumentType[];
}

/**
 * Check if a target document could be affected by changes in a source document.
 * Does NOT trigger any sync — purely informational.
 */
export async function checkSyncNeeded(
  sessionId: string,
  sourceScriptId: string,
  targetScriptId: string,
): Promise<SyncCheckResult> {
  const source = await db.getScript(sessionId, sourceScriptId);
  const target = await db.getScript(sessionId, targetScriptId);

  if (!source || !target) {
    return {
      needsSync: false,
      sourceTitle: source?.title || 'Unknown',
      targetTitle: target?.title || 'Unknown',
      sourceType: source?.documentType || 'screenplay',
      targetType: target?.documentType || 'screenplay',
      dependents: [],
    };
  }

  const sourceType = (source.documentType || 'screenplay') as DocumentType;
  const targetType = (target.documentType || 'screenplay') as DocumentType;
  const dependents = getDependentsOf(sourceType);
  const needsSync = dependents.includes(targetType);

  return {
    needsSync,
    sourceTitle: source.title,
    targetTitle: target.title,
    sourceType,
    targetType,
    dependents,
  };
}

/**
 * Build a context summary of a source document for use in cross-doc generation.
 */
export async function buildSourceContext(
  sessionId: string,
  sourceScriptId: string,
): Promise<string> {
  const source = await db.getScript(sessionId, sourceScriptId);
  if (!source) return '';

  const blocks = Array.isArray(source.blocks) ? source.blocks as ThinkForgeBlock[] : [];
  if (blocks.length > 0) {
    return blocks
      .map((b) => extractTextFromRichText(b.content))
      .filter(Boolean)
      .join('\n\n');
  }

  return source.content || '';
}

/**
 * List all documents in a session with their types and titles.
 * Useful for the Sidecar to show what documents exist and their sync status.
 */
export async function listSessionDocuments(
  sessionId: string,
): Promise<Array<{ scriptId: string; title: string; documentType: string; version: number }>> {
  const scripts = await db.listScripts(sessionId);
  return scripts.map((s: any) => ({
    scriptId: s.scriptId || s._id,
    title: s.title,
    documentType: s.documentType || 'screenplay',
    version: s.version || 1,
  }));
}

/**
 * Create a checkpoint (save current version) before a potentially destructive sync.
 * Returns the current version number for rollback purposes.
 */
export async function checkpointDocument(
  sessionId: string,
  scriptId: string,
): Promise<{ version: number; title: string } | null> {
  const script = await db.getScript(sessionId, scriptId);
  if (!script) return null;

  return {
    version: script.version || 1,
    title: script.title,
  };
}

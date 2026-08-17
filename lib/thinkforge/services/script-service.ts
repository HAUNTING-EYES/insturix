/**
 * Script Service - Simple script operations for ThinkForge
 */

import * as db from './db';
import type { Script } from './db';
import { applyCommand } from './command-service';
import type { ScriptPayload } from '../schemas/route-validation';

export interface ScriptOperation {
  sessionId: string;
  scriptId: string;
  userId: string;
  orgId?: string | null;
  action: 'get' | 'save' | 'update';
  baseVersion?: number;
  script?: ScriptPayload;
}

function requireExactScriptId(scriptId: unknown): string {
  if (typeof scriptId !== 'string' || scriptId.trim().length === 0) {
    throw new Error('Document identity is required');
  }
  if (scriptId.trim() !== scriptId) {
    throw new Error('Document identity is invalid');
  }
  return scriptId;
}

function buildReplaceDocumentPayload(scriptId: string, script: ScriptPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { scriptId };
  if (typeof script.title === 'string') payload.title = script.title;
  if (typeof script.content === 'string') payload.content = script.content;
  if (Array.isArray(script.blocks)) payload.blocks = script.blocks;
  if (script.richText !== undefined) payload.richText = script.richText;
  if (script.documentType !== undefined) payload.documentType = script.documentType;
  if (script.contentContract !== undefined) payload.contentContract = script.contentContract;
  return payload;
}

/**
 * Execute script operation
 */
export async function executeScriptOperation(operation: ScriptOperation): Promise<Script | null> {
  const { sessionId, action, script, scriptId, userId, orgId, baseVersion } = operation;
  const exactScriptId = requireExactScriptId(scriptId);
  if ((action === 'save' || action === 'update') && baseVersion === undefined) {
    throw new Error('baseVersion is required for document mutations');
  }
  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) {
    throw new Error('Session not found');
  }
  const canonicalSessionId = session._id;
  
  switch (action) {
    case 'get':
      return await db.getScript(canonicalSessionId, exactScriptId);
    
    case 'save':
    case 'update':
      if (!script) {
        throw new Error(`Script data required for ${action} operation`);
      }
      {
        const result = await applyCommand({
          type: 'ReplaceDocument',
          sessionId: canonicalSessionId,
          baseVersion: baseVersion!,
          source: 'user',
          payload: buildReplaceDocumentPayload(exactScriptId, script),
        }, userId, orgId);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result.script;
      }
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

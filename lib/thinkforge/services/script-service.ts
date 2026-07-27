/**
 * Script Service - Simple script operations for ThinkForge
 */

import * as db from './db';
import type { Script } from './db';
import { applyCommand } from './command-service';
import type { ScriptPayload } from '../schemas/route-validation';

export interface ScriptOperation {
  sessionId: string;
  userId: string;
  orgId?: string | null;
  action: 'get' | 'save' | 'update';
  scriptId?: string;
  baseVersion?: number;
  script?: ScriptPayload;
}

/**
 * Execute script operation
 */
export async function executeScriptOperation(operation: ScriptOperation): Promise<Script | null> {
  const { sessionId, action, script, scriptId, userId, orgId, baseVersion } = operation;
  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) {
    throw new Error('Session not found');
  }
  const canonicalSessionId = session._id;
  
  switch (action) {
    case 'get':
      return await db.getScript(canonicalSessionId, scriptId || null);
    
    case 'save':
      if (!script) {
        throw new Error('Script data required for save operation');
      }
      {
        const result = await applyCommand({
          type: 'ReplaceDocument',
          sessionId: canonicalSessionId,
          baseVersion: typeof baseVersion === 'number' ? baseVersion : 0,
          source: 'user',
          payload: {
            scriptId,
            title: script.title || 'Untitled Script',
            content: script.content || '',
            blocks: script.blocks || [],
            richText: script.richText,
            documentType: script.documentType,
            contentContract: script.contentContract,
          }
        }, userId, orgId);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result.script;
      }
    
    case 'update':
      if (!script) {
        throw new Error('Script data required for update operation');
      }
      {
        const result = await applyCommand({
          type: 'ReplaceDocument',
          sessionId: canonicalSessionId,
          baseVersion: typeof baseVersion === 'number' ? baseVersion : 0,
          source: 'user',
          payload: {
            scriptId,
            title: script.title || 'Untitled Script',
            content: script.content || '',
            blocks: script.blocks || [],
            richText: script.richText,
            documentType: script.documentType,
            contentContract: script.contentContract,
          }
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



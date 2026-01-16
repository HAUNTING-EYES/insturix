/**
 * Script Service - Simple script operations for ThinkForge
 */

import * as db from './db';
import type { Script } from './db';
import { applyCommand } from './command-service';
import type { BlockTree } from '../schemas/canonical';
import type { CIRDocument, CIRSection } from '../schemas/cir';

export interface ScriptOperation {
  sessionId: string;
  userId: string;
  action: 'get' | 'save' | 'update';
  scriptId?: string;
  baseVersion?: number;
  script?: {
    title?: string;
    content?: string;
      blocks?: BlockTree | CIRDocument | CIRSection[];
      richText?: any;
  };
}

/**
 * Execute script operation
 */
export async function executeScriptOperation(operation: ScriptOperation): Promise<Script | null> {
  const { sessionId, action, script, scriptId, userId, baseVersion } = operation;
  
  switch (action) {
    case 'get':
      return await db.getScript(sessionId, scriptId || null);
    
    case 'save':
      if (!script) {
        throw new Error('Script data required for save operation');
      }
      {
        const result = await applyCommand({
          type: 'ReplaceDocument',
          sessionId,
          baseVersion: typeof baseVersion === 'number' ? baseVersion : 0,
          source: 'user',
          payload: {
            scriptId,
            title: script.title || 'Untitled Script',
            content: script.content || '',
            blocks: script.blocks || [],
            richText: script.richText
          }
        }, userId);
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
          sessionId,
          baseVersion: typeof baseVersion === 'number' ? baseVersion : 0,
          source: 'user',
          payload: {
            scriptId,
            title: script.title || 'Untitled Script',
            content: script.content || '',
            blocks: script.blocks || [],
            richText: script.richText
          }
        }, userId);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result.script;
      }
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}



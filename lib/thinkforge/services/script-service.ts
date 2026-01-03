/**
 * Script Service - Simple script operations for ThinkForge
 */

import * as db from './db';
import type { Script } from './db';
import type { BlockTree } from '../schemas/canonical';
import type { CIRDocument, CIRSection } from '../schemas/cir';

export interface ScriptOperation {
  sessionId: string;
  action: 'get' | 'save' | 'update';
  script?: {
    title?: string;
    content?: string;
      blocks?: BlockTree | CIRDocument | CIRSection[];
  };
}

/**
 * Execute script operation
 */
export async function executeScriptOperation(operation: ScriptOperation): Promise<Script | null> {
  const { sessionId, action, script } = operation;
  
  switch (action) {
    case 'get':
      return await db.getScript(sessionId);
    
    case 'save':
      if (!script) {
        throw new Error('Script data required for save operation');
      }
      return await db.saveScript(sessionId, {
        title: script.title || 'Untitled Script',
        content: script.content || '',
        blocks: script.blocks || []
      });
    
    case 'update':
      if (!script) {
        throw new Error('Script data required for update operation');
      }
      return await db.updateScript(sessionId, {
        title: script.title,
        content: script.content,
        blocks: script.blocks
      });
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}



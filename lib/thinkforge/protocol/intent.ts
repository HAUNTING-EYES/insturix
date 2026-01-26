import type { ThinkForgeBlock, RichTextAST } from '../schemas/thinkforge-block';

export enum ScriptIntent {
  REWRITE = 'REWRITE',
  EDIT = 'EDIT',
  CONTINUE = 'CONTINUE',
  FORK = 'FORK',
}

export type InsertPosition =
  | { afterBlockId: string }
  | { beforeBlockId: string }
  | { atEnd: true };

export type ThinkForgeBlockContent = RichTextAST;

export type AgentScriptResponse =
  | {
      mode: 'replace';
      title?: string;
      blocks: ThinkForgeBlock[];
    }
  | {
      mode: 'insert';
      position: InsertPosition;
      blocks: ThinkForgeBlock[];
    }
  | {
      mode: 'patch';
      patches: Array<{
        blockId: string;
        content: ThinkForgeBlockContent;
      }>;
    };

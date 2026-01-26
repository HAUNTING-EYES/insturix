import { nanoid } from 'nanoid';

export type ThinkForgeBlockKind = 'header' | 'action' | 'why' | 'example' | 'paragraph';

export interface RichTextNode {
  type: 'text' | 'link';
  text?: string;
  styles?: Record<string, boolean>;
  href?: string;
  content?: RichTextNode[];
}

export type RichTextAST = RichTextNode[];

export interface ThinkForgeBlock {
  id: string;
  kind: ThinkForgeBlockKind;
  content: RichTextAST;
  blockHash?: string;
  meta?: {
    role?: string;
    goal?: string;
    level?: number; // For headers: 1, 2, or 3 (h1, h2, h3)
  };
}

/**
 * Normalizes rich-text content into a flat array of BlockNote-compatible inline nodes.
 * Enforces the invariant: only "text" and "link" types, no structural nesting.
 */
export function normalizeThinkForgeRichText(content: any): RichTextAST {
  const result: RichTextNode[] = [];

  const walk = (nodes: any) => {
    if (!nodes) return;
    const array = Array.isArray(nodes) ? nodes : [nodes];

    for (const node of array) {
      if (!node) continue;

      if (typeof node === 'string') {
        result.push({ type: 'text', text: node, styles: {} });
        continue;
      }

      const type = node.type;
      
      if (type === 'link') {
        // Links are the only allowed nested structure in BlockNote inline content
        const href = typeof node.href === 'string' ? node.href : '#';
        // We still normalize the content of the link
        const linkContent: RichTextNode[] = [];
        const subWalk = (subNodes: any) => {
          if (!subNodes) return;
          const subArray = Array.isArray(subNodes) ? subNodes : [subNodes];
          for (const sn of subArray) {
            if (typeof sn === 'string') {
              linkContent.push({ type: 'text', text: sn, styles: {} });
            } else if (sn?.text) {
              linkContent.push({ type: 'text', text: String(sn.text), styles: sn.styles || {} });
            } else if (sn?.children || sn?.content) {
              subWalk(sn.children || sn.content);
            }
          }
        };
        subWalk(node.content || node.children);
        result.push({ 
          type: 'link', 
          href, 
          content: linkContent.length ? linkContent : [{ type: 'text', text: href, styles: {} }] 
        });
      } else {
        // Everything else is treated as text or flattened
        const text = node.text ?? '';
        const styles = node.styles || {};
        
        if (text) {
          result.push({ type: 'text', text: String(text), styles });
        }
        
        // If there are children/content, flatten them into the top level
        if (node.children || node.content) {
          walk(node.children || node.content);
        }
      }
    }
  };

  walk(content);

  // Guarantee at least one text node if empty
  if (result.length === 0) {
    result.push({ type: 'text', text: '', styles: {} });
  }

  return result;
}

export function isRichTextNode(value: unknown): value is RichTextNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  if (node.type !== 'text' && node.type !== 'link') return false;
  if (node.type === 'text') {
    if (typeof node.text !== 'string') return false;
    if (node.styles !== undefined && (typeof node.styles !== 'object' || node.styles === null || Array.isArray(node.styles))) return false;
  }
  if (node.type === 'link') {
    if (typeof node.href !== 'string') return false;
    if (!Array.isArray(node.content)) return false;
    return node.content.every(isRichTextNode);
  }
  return true;
}

export function isRichTextAST(value: unknown): value is RichTextAST {
  return Array.isArray(value) && value.length > 0 && value.every(isRichTextNode);
}

export function isThinkForgeBlock(value: unknown): value is ThinkForgeBlock {
  if (!value || typeof value !== 'object') return false;
  const b = value as Record<string, unknown>;
  if (typeof b.id !== 'string' || b.id.length < 4) return false;
  if (typeof b.kind !== 'string') return false;
  const allowed: ThinkForgeBlockKind[] = ['header', 'action', 'why', 'example', 'paragraph'];
  if (!allowed.includes(b.kind as ThinkForgeBlockKind)) return false;
  
  if (!isRichTextAST(b.content)) return false;

  // Final Invariant Check (Assert no "paragraph" in content, only text/link)
  const content = b.content as RichTextNode[];
  if (content.some(n => n.type !== 'text' && n.type !== 'link')) return false;

  if (b.meta !== undefined) {
    if (typeof b.meta !== 'object' || b.meta === null || Array.isArray(b.meta)) return false;
    const m = b.meta as Record<string, unknown>;
    if (m.role !== undefined && typeof m.role !== 'string') return false;
    if (m.goal !== undefined && typeof m.goal !== 'string') return false;
  }
  return true;
}

export function ensureThinkForgeBlockId(id?: string): string {
  return id && typeof id === 'string' && id.length >= 6 ? id : `blk_${nanoid(12)}`;
}

export function validateThinkForgeBlocks(blocks: unknown[]): ThinkForgeBlock[] {
  if (!Array.isArray(blocks)) return [];
  const result = blocks
    .map((b) => {
      if (!b || typeof b !== 'object') return null;
      const raw = b as any;
      
      const kind = ['header', 'action', 'why', 'example', 'paragraph'].includes(raw.kind) 
        ? raw.kind 
        : 'paragraph';

      const candidate: ThinkForgeBlock = {
        id: ensureThinkForgeBlockId(raw.id),
        kind: kind as ThinkForgeBlockKind,
        content: normalizeThinkForgeRichText(raw.content ?? raw.text ?? []),
        // Normalize meta: convert null/undefined to undefined (not null)
        meta: raw.meta && typeof raw.meta === 'object' && Object.keys(raw.meta).length > 0 
          ? raw.meta 
          : undefined,
      };

      if (!isThinkForgeBlock(candidate)) {
        if (process.env.NODE_ENV === 'development') {
          console.error('ThinkForgeBlock Validation Failed:', JSON.stringify(candidate, null, 2));
          throw new Error(`Invalid ThinkForgeBlock: ${candidate.id}`);
        }
        return null;
      }
      return candidate;
    })
    .filter(Boolean) as ThinkForgeBlock[];

  return result;
}

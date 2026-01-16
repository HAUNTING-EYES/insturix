/**
 * Content Block - Hash-based content storage for efficient diffing and deduplication
 * 
 * This is introduced early to enable:
 * - Fast diff between versions (compare hashes first)
 * - Partial context to AI (only changed blocks)
 * - Content deduplication
 * - Future "why this changed" explanations
 */

import type { BlockTree } from '../schemas/canonical';

export type ContentBlockType = 'chat' | 'idea' | 'script' | 'scene' | 'beat';

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  content: BlockTree;
  hash: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Simple hash function for content
 * Uses a fast, non-cryptographic hash for deduplication
 */
function hashContent(content: BlockTree): string {
  const str = JSON.stringify(content);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex string with timestamp prefix for uniqueness
  return `cb_${Math.abs(hash).toString(16)}_${Date.now().toString(36)}`;
}

/**
 * Generate a unique content block ID
 */
function generateContentBlockId(): string {
  return `cb_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Content Block Store - Manages content blocks with hash-based deduplication
 */
export class ContentBlockStore {
  private blocks: Map<string, ContentBlock> = new Map();
  private hashIndex: Map<string, string[]> = new Map(); // hash -> block IDs

  /**
   * Generate hash for content
   */
  hashContent(content: BlockTree): string {
    return hashContent(content);
  }

  /**
   * Store a content block and return its ID
   * If content with same hash exists, may return existing ID (deduplication)
   */
  storeBlock(content: BlockTree, type: ContentBlockType, deduplicate: boolean = false): string {
    const hash = this.hashContent(content);
    
    // Check for existing block with same hash (deduplication)
    if (deduplicate) {
      const existingIds = this.hashIndex.get(hash);
      if (existingIds && existingIds.length > 0) {
        // Verify content actually matches (hash collision check)
        for (const existingId of existingIds) {
          const existing = this.blocks.get(existingId);
          if (existing && JSON.stringify(existing.content) === JSON.stringify(content)) {
            return existingId;
          }
        }
      }
    }
    
    // Create new block
    const id = generateContentBlockId();
    const block: ContentBlock = {
      id,
      type,
      content,
      hash,
      createdAt: new Date(),
    };
    
    this.blocks.set(id, block);
    
    // Update hash index
    const ids = this.hashIndex.get(hash) || [];
    ids.push(id);
    this.hashIndex.set(hash, ids);
    
    return id;
  }

  /**
   * Retrieve a content block by ID
   */
  getBlock(blockId: string): ContentBlock | null {
    return this.blocks.get(blockId) || null;
  }

  /**
   * Find blocks by hash
   */
  findByHash(hash: string): ContentBlock[] {
    const ids = this.hashIndex.get(hash) || [];
    return ids.map(id => this.blocks.get(id)).filter(Boolean) as ContentBlock[];
  }

  /**
   * Get multiple blocks by IDs
   */
  getBlocks(blockIds: string[]): ContentBlock[] {
    return blockIds.map(id => this.blocks.get(id)).filter(Boolean) as ContentBlock[];
  }

  /**
   * Check if two block references have the same content
   */
  areBlocksEqual(blockId1: string, blockId2: string): boolean {
    const block1 = this.blocks.get(blockId1);
    const block2 = this.blocks.get(blockId2);
    
    if (!block1 || !block2) return false;
    
    // Quick hash comparison first
    if (block1.hash !== block2.hash) return false;
    
    // Deep comparison if hashes match (collision check)
    return JSON.stringify(block1.content) === JSON.stringify(block2.content);
  }

  /**
   * Get all stored blocks
   */
  getAllBlocks(): ContentBlock[] {
    return Array.from(this.blocks.values());
  }

  /**
   * Clear all blocks
   */
  clear(): void {
    this.blocks.clear();
    this.hashIndex.clear();
  }

  /**
   * Serialize store to JSON for persistence
   */
  toJSON(): { blocks: ContentBlock[] } {
    return {
      blocks: Array.from(this.blocks.values()),
    };
  }

  /**
   * Load store from JSON
   */
  fromJSON(data: { blocks: ContentBlock[] }): void {
    this.clear();
    for (const block of data.blocks) {
      this.blocks.set(block.id, {
        ...block,
        createdAt: new Date(block.createdAt),
      });
      
      const ids = this.hashIndex.get(block.hash) || [];
      ids.push(block.id);
      this.hashIndex.set(block.hash, ids);
    }
  }
}

export default ContentBlockStore;

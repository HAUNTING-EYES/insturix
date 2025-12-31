/**
 * Version Algorithms - Efficient algorithms for version management
 * 
 * Priority order (as specified):
 * 1. LCA - Foundational, everything else depends on it
 * 2. Tree traversal utilities
 * 3. Diff (block-level)
 * 4. Three-way merge
 * 5. Graph algorithms
 */

import type { BlockTree } from '../schemas/canonical';
import type { VersionTree, VersionNode } from './VersionTree';
import type { VersionGraph } from './VersionGraph';
import type { ContentBlockStore } from './ContentBlock';

// ============================================================
// PRIORITY 1: LCA (Lowest Common Ancestor)
// ============================================================

/**
 * Find Lowest Common Ancestor of two versions
 * This is foundational - everything else depends on it
 * 
 * Uses path-based approach: O(n) time, O(n) space
 * Can be optimized to O(log n) with binary lifting for large trees
 */
export function findLCA(
  tree: VersionTree,
  versionId1: string,
  versionId2: string
): VersionNode | null {
  return tree.findCommonAncestor(versionId1, versionId2);
}

/**
 * Find LCA with path information
 * Returns the LCA and the paths from both versions to the LCA
 */
export function findLCAWithPaths(
  tree: VersionTree,
  versionId1: string,
  versionId2: string
): {
  lca: VersionNode | null;
  path1: VersionNode[];
  path2: VersionNode[];
} {
  const path1 = tree.getBranchPath(versionId1);
  const path2 = tree.getBranchPath(versionId2);
  
  const path1Ids = new Set(path1.map(n => n.versionId));
  
  let lcaIndex = -1;
  for (let i = path2.length - 1; i >= 0; i--) {
    if (path1Ids.has(path2[i].versionId)) {
      lcaIndex = i;
      break;
    }
  }
  
  if (lcaIndex === -1) {
    return { lca: null, path1, path2 };
  }
  
  const lca = path2[lcaIndex];
  const lcaIndexInPath1 = path1.findIndex(n => n.versionId === lca.versionId);
  
  return {
    lca,
    path1: path1.slice(lcaIndexInPath1 + 1),
    path2: path2.slice(lcaIndex + 1),
  };
}

// ============================================================
// PRIORITY 2: Tree Traversal Utilities
// ============================================================

/**
 * Get ancestors of a version (path to root)
 */
export function getAncestors(tree: VersionTree, versionId: string): VersionNode[] {
  return tree.getAncestors(versionId);
}

/**
 * Get descendants of a version (all children recursively)
 */
export function getDescendants(tree: VersionTree, versionId: string): VersionNode[] {
  return tree.getDescendants(versionId);
}

/**
 * Get timeline slice between two versions
 */
export function getTimelineSlice(
  tree: VersionTree,
  fromVersionId: string,
  toVersionId: string
): VersionNode[] {
  return tree.getTimelineSlice(fromVersionId, toVersionId);
}

/**
 * Find branch points (versions with multiple children)
 */
export function findBranchPoints(tree: VersionTree): VersionNode[] {
  return tree.getAllVersions().filter(n => n.childrenVersionIds.length > 1);
}

/**
 * Find leaf versions (versions with no children)
 */
export function findLeafVersions(tree: VersionTree): VersionNode[] {
  return tree.getAllVersions().filter(n => n.childrenVersionIds.length === 0);
}

/**
 * Get version depth (distance from root)
 */
export function getVersionDepth(tree: VersionTree, versionId: string): number {
  return tree.getBranchPath(versionId).length - 1;
}

// ============================================================
// PRIORITY 3: Diff (Block-level)
// ============================================================

export interface BlockDiff {
  type: 'add' | 'remove' | 'modify' | 'move';
  blockId?: string;
  oldIndex?: number;
  newIndex?: number;
  oldContent?: any;
  newContent?: any;
}

/**
 * Diff two block trees
 * Uses block-level comparison with hash optimization
 */
export function diffBlocks(blocks1: BlockTree, blocks2: BlockTree): BlockDiff[] {
  const diffs: BlockDiff[] = [];
  
  // Create maps for quick lookup
  const map1 = new Map<string, { block: any; index: number }>();
  const map2 = new Map<string, { block: any; index: number }>();
  
  blocks1.forEach((block, index) => {
    if (block.id) {
      map1.set(block.id, { block, index });
    }
  });
  
  blocks2.forEach((block, index) => {
    if (block.id) {
      map2.set(block.id, { block, index });
    }
  });
  
  // Find removed blocks (in blocks1 but not in blocks2)
  for (const [id, { block, index }] of map1) {
    if (!map2.has(id)) {
      diffs.push({
        type: 'remove',
        blockId: id,
        oldIndex: index,
        oldContent: block,
      });
    }
  }
  
  // Find added blocks (in blocks2 but not in blocks1)
  for (const [id, { block, index }] of map2) {
    if (!map1.has(id)) {
      diffs.push({
        type: 'add',
        blockId: id,
        newIndex: index,
        newContent: block,
      });
    }
  }
  
  // Find modified and moved blocks
  for (const [id, { block: block2, index: index2 }] of map2) {
    const entry1 = map1.get(id);
    if (entry1) {
      const { block: block1, index: index1 } = entry1;
      
      // Check if moved
      if (index1 !== index2) {
        diffs.push({
          type: 'move',
          blockId: id,
          oldIndex: index1,
          newIndex: index2,
        });
      }
      
      // Check if modified (deep comparison)
      if (JSON.stringify(block1) !== JSON.stringify(block2)) {
        diffs.push({
          type: 'modify',
          blockId: id,
          oldContent: block1,
          newContent: block2,
        });
      }
    }
  }
  
  return diffs;
}

/**
 * Diff two versions using their content block references
 */
export function diffVersions(
  contentStore: ContentBlockStore,
  refs1: string[],
  refs2: string[]
): BlockDiff[] {
  // Quick check: if refs are identical, no diff
  if (refs1.length === refs2.length && refs1.every((r, i) => r === refs2[i])) {
    return [];
  }
  
  // Get content blocks
  const blocks1 = refs1.flatMap(ref => {
    const block = contentStore.getBlock(ref);
    return block ? block.content : [];
  });
  
  const blocks2 = refs2.flatMap(ref => {
    const block = contentStore.getBlock(ref);
    return block ? block.content : [];
  });
  
  return diffBlocks(blocks1, blocks2);
}

// ============================================================
// PRIORITY 4: Three-way Merge
// ============================================================

export interface MergeResult {
  success: boolean;
  merged: BlockTree;
  conflicts: MergeConflict[];
  stats: {
    added: number;
    removed: number;
    modified: number;
    conflicted: number;
  };
}

export interface MergeConflict {
  blockId?: string;
  type: 'content' | 'deletion' | 'position';
  base?: any;
  ours?: any;
  theirs?: any;
  resolution?: 'ours' | 'theirs' | 'manual';
}

/**
 * Three-way merge algorithm
 * 
 * Merges two versions using their common ancestor as base
 */
export function threeWayMerge(
  base: BlockTree,
  ours: BlockTree,
  theirs: BlockTree
): MergeResult {
  const conflicts: MergeConflict[] = [];
  const merged: BlockTree = [];
  let added = 0, removed = 0, modified = 0;
  
  // Get diffs from base
  const ourDiffs = diffBlocks(base, ours);
  const theirDiffs = diffBlocks(base, theirs);
  
  // Create maps for tracking
  const baseMap = new Map<string, any>();
  const ourMap = new Map<string, any>();
  const theirMap = new Map<string, any>();
  
  base.forEach(b => b.id && baseMap.set(b.id, b));
  ours.forEach(b => b.id && ourMap.set(b.id, b));
  theirs.forEach(b => b.id && theirMap.set(b.id, b));
  
  // Track changes by block ID
  const ourChanges = new Map<string, BlockDiff[]>();
  const theirChanges = new Map<string, BlockDiff[]>();
  
  for (const diff of ourDiffs) {
    if (diff.blockId) {
      const changes = ourChanges.get(diff.blockId) || [];
      changes.push(diff);
      ourChanges.set(diff.blockId, changes);
    }
  }
  
  for (const diff of theirDiffs) {
    if (diff.blockId) {
      const changes = theirChanges.get(diff.blockId) || [];
      changes.push(diff);
      theirChanges.set(diff.blockId, changes);
    }
  }
  
  // Process all blocks from base
  const processedIds = new Set<string>();
  
  for (const block of base) {
    if (!block.id) continue;
    processedIds.add(block.id);
    
    const ourChange = ourChanges.get(block.id);
    const theirChange = theirChanges.get(block.id);
    
    if (!ourChange && !theirChange) {
      // No changes, keep base
      merged.push(block);
    } else if (ourChange && !theirChange) {
      // Only we changed it
      const ourVersion = ourMap.get(block.id);
      if (ourVersion) {
        merged.push(ourVersion);
        modified++;
      } else {
        removed++;
      }
    } else if (!ourChange && theirChange) {
      // Only they changed it
      const theirVersion = theirMap.get(block.id);
      if (theirVersion) {
        merged.push(theirVersion);
        modified++;
      } else {
        removed++;
      }
    } else {
      // Both changed it - potential conflict
      const ourVersion = ourMap.get(block.id);
      const theirVersion = theirMap.get(block.id);
      
      if (!ourVersion && !theirVersion) {
        // Both deleted
        removed++;
      } else if (!ourVersion || !theirVersion) {
        // One deleted, one modified - conflict
        conflicts.push({
          blockId: block.id,
          type: 'deletion',
          base: block,
          ours: ourVersion,
          theirs: theirVersion,
        });
        // Default: keep the non-deleted version
        merged.push(ourVersion || theirVersion);
      } else if (JSON.stringify(ourVersion) === JSON.stringify(theirVersion)) {
        // Same change, no conflict
        merged.push(ourVersion);
        modified++;
      } else {
        // Different changes - conflict
        conflicts.push({
          blockId: block.id,
          type: 'content',
          base: block,
          ours: ourVersion,
          theirs: theirVersion,
        });
        // Default: prefer ours
        merged.push(ourVersion);
        modified++;
      }
    }
  }
  
  // Add new blocks from ours
  for (const block of ours) {
    if (block.id && !processedIds.has(block.id)) {
      processedIds.add(block.id);
      merged.push(block);
      added++;
    }
  }
  
  // Add new blocks from theirs (if not already added)
  for (const block of theirs) {
    if (block.id && !processedIds.has(block.id)) {
      processedIds.add(block.id);
      merged.push(block);
      added++;
    }
  }
  
  return {
    success: conflicts.length === 0,
    merged,
    conflicts,
    stats: {
      added,
      removed,
      modified,
      conflicted: conflicts.length,
    },
  };
}

// ============================================================
// PRIORITY 5: Graph Algorithms
// ============================================================

/**
 * Find shortest path between two versions
 */
export function findPath(
  graph: VersionGraph,
  from: string,
  to: string
): VersionNode[] {
  return graph.findPath(from, to);
}

/**
 * Topological sort of versions
 */
export function topologicalSort(graph: VersionGraph): VersionNode[] {
  return graph.topologicalSort();
}

/**
 * Trace influence - which versions influenced this one
 */
export function traceInfluence(
  graph: VersionGraph,
  versionId: string
): VersionNode[] {
  return graph.traceInfluence(versionId);
}

/**
 * Get connected components
 */
export function getConnectedComponents(graph: VersionGraph): VersionNode[][] {
  return graph.getConnectedComponents();
}

/**
 * Check if two versions are connected
 */
export function areVersionsConnected(
  graph: VersionGraph,
  versionId1: string,
  versionId2: string
): boolean {
  return graph.findPath(versionId1, versionId2).length > 0;
}

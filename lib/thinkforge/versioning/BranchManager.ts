/**
 * Branch Manager - High-level operations using tree and graph
 * 
 * This is the main interface for version management operations.
 * Uses VersionTree as source of truth, VersionGraph for relationships,
 * and ContentBlockStore for content management.
 */

import type { BlockTree } from '../schemas/canonical';
import { VersionTree, VersionNode, VersionMetadata } from './VersionTree';
import { VersionGraph, EdgeType } from './VersionGraph';
import { ContentBlockStore, ContentBlockType } from './ContentBlock';
import {
  findLCA,
  findLCAWithPaths,
  diffBlocks,
  diffVersions,
  threeWayMerge,
  BlockDiff,
  MergeResult,
} from './algorithms';

export interface CreateVersionOptions {
  metadata?: VersionMetadata;
  contentType?: ContentBlockType;
  deduplicate?: boolean;
}

export interface BranchOptions {
  metadata?: VersionMetadata;
  description?: string;
}

/**
 * Branch Manager - Manages version branches using tree and graph structures
 */
export class BranchManager {
  private tree: VersionTree;
  private graph: VersionGraph;
  private contentStore: ContentBlockStore;

  constructor(
    tree: VersionTree,
    graph: VersionGraph,
    contentStore: ContentBlockStore
  ) {
    this.tree = tree;
    this.graph = graph;
    this.contentStore = contentStore;
  }

  /**
   * Get the version tree
   */
  getTree(): VersionTree {
    return this.tree;
  }

  /**
   * Get the version graph
   */
  getGraph(): VersionGraph {
    return this.graph;
  }

  /**
   * Get the content store
   */
  getContentStore(): ContentBlockStore {
    return this.contentStore;
  }

  /**
   * Create a new version from blocks
   */
  createVersion(
    parentVersionId: string | null,
    blocks: BlockTree,
    options: CreateVersionOptions = {}
  ): VersionNode {
    const { metadata = {}, contentType = 'script', deduplicate = false } = options;

    // Store blocks as content blocks
    const contentBlockRefs: string[] = [];
    for (const block of blocks) {
      const ref = this.contentStore.storeBlock([block], contentType, deduplicate);
      contentBlockRefs.push(ref);
    }

    // Create version in tree (tree generates ID)
    const newVersion = this.tree.addVersion(parentVersionId, contentBlockRefs, metadata);

    // Add parent edge in graph if this is not the root
    if (parentVersionId) {
      this.graph.addEdge({
        from: parentVersionId,
        to: newVersion.versionId,
        type: 'parent',
      });
    }

    return newVersion;
  }

  /**
   * Create a branch from an existing version
   */
  createBranch(
    fromVersionId: string,
    newBlocks: BlockTree,
    options: BranchOptions = {}
  ): VersionNode {
    const { metadata = {}, description } = options;

    // Add branch-specific metadata
    const branchMetadata: VersionMetadata = {
      ...metadata,
      isBranch: true,
      branchedFrom: fromVersionId,
      description: description || `Branch from version ${fromVersionId}`,
    };

    // Create the new version
    const newVersion = this.createVersion(fromVersionId, newBlocks, {
      metadata: branchMetadata,
    });

    // Add branch edge in graph
    this.graph.addEdge({
      from: fromVersionId,
      to: newVersion.versionId,
      type: 'branch',
    });

    return newVersion;
  }

  /**
   * Find merge base (LCA) for two versions
   */
  findMergeBase(versionId1: string, versionId2: string): VersionNode | null {
    return findLCA(this.tree, versionId1, versionId2);
  }

  /**
   * Diff two versions
   */
  diffVersions(versionId1: string, versionId2: string): BlockDiff[] {
    const v1 = this.tree.getVersion(versionId1);
    const v2 = this.tree.getVersion(versionId2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    return diffVersions(this.contentStore, v1.contentBlockRefs, v2.contentBlockRefs);
  }

  /**
   * Get blocks for a version
   */
  getVersionBlocks(versionId: string): BlockTree {
    const version = this.tree.getVersion(versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    const blocks: BlockTree = [];
    for (const ref of version.contentBlockRefs) {
      const contentBlock = this.contentStore.getBlock(ref);
      if (contentBlock) {
        blocks.push(...contentBlock.content);
      }
    }

    return blocks;
  }

  /**
   * Merge two branches
   */
  mergeBranches(
    versionId1: string,
    versionId2: string,
    resolveConflicts?: (conflicts: MergeResult['conflicts']) => BlockTree
  ): { version: VersionNode; mergeResult: MergeResult } {
    // Find merge base (LCA)
    const base = this.findMergeBase(versionId1, versionId2);
    if (!base) {
      throw new Error('No common ancestor found for merge');
    }

    // Get blocks for all three versions
    const baseBlocks = this.getVersionBlocks(base.versionId);
    const oursBlocks = this.getVersionBlocks(versionId1);
    const theirsBlocks = this.getVersionBlocks(versionId2);

    // Perform three-way merge
    const mergeResult = threeWayMerge(baseBlocks, oursBlocks, theirsBlocks);

    // Handle conflicts
    let finalBlocks = mergeResult.merged;
    if (!mergeResult.success && resolveConflicts) {
      finalBlocks = resolveConflicts(mergeResult.conflicts);
    }

    // Create merge commit
    const mergeMetadata: VersionMetadata = {
      isMergeResult: true,
      mergedFrom: [versionId1, versionId2],
      mergeBase: base.versionId,
      conflicts: mergeResult.conflicts.length,
      resolved: mergeResult.success || !!resolveConflicts,
    };

    // Create new version (parent is versionId1)
    const mergeVersion = this.createVersion(versionId1, finalBlocks, {
      metadata: mergeMetadata,
    });

    // Add merge edge from versionId2 to merge result
    this.graph.addEdge({
      from: versionId2,
      to: mergeVersion.versionId,
      type: 'merge',
    });

    return {
      version: mergeVersion,
      mergeResult,
    };
  }

  /**
   * Get version history (path to root)
   */
  getVersionHistory(versionId: string): VersionNode[] {
    const path = this.tree.getBranchPath(versionId);
    return path.reverse(); // Return from oldest to newest
  }

  /**
   * Get branch history (all versions in a branch)
   */
  getBranchHistory(branchRootId: string): VersionNode[] {
    return [
      this.tree.getVersion(branchRootId)!,
      ...this.tree.getDescendants(branchRootId),
    ].filter(Boolean);
  }

  /**
   * Get all branch heads (leaf versions)
   */
  getBranchHeads(): VersionNode[] {
    return this.tree
      .getAllVersions()
      .filter(n => n.childrenVersionIds.length === 0);
  }

  /**
   * Get the latest version
   */
  getLatestVersion(): VersionNode | null {
    return this.tree.getLatestVersion();
  }

  /**
   * Restore a version (create new version from old version's content)
   */
  restoreVersion(
    targetVersionId: string,
    currentHeadId: string
  ): VersionNode {
    const targetBlocks = this.getVersionBlocks(targetVersionId);

    return this.createVersion(currentHeadId, targetBlocks, {
      metadata: {
        restoredFrom: targetVersionId,
        description: `Restored from version ${targetVersionId}`,
      },
    });
  }

  /**
   * Get comparison between two versions
   */
  compareVersions(
    versionId1: string,
    versionId2: string
  ): {
    lca: VersionNode | null;
    path1: VersionNode[];
    path2: VersionNode[];
    diffs: BlockDiff[];
  } {
    const { lca, path1, path2 } = findLCAWithPaths(this.tree, versionId1, versionId2);
    const diffs = this.diffVersions(versionId1, versionId2);

    return { lca, path1, path2, diffs };
  }

  /**
   * Serialize manager state
   */
  toJSON(): {
    tree: ReturnType<VersionTree['toJSON']>;
    graph: ReturnType<VersionGraph['toJSON']>;
    contentStore: ReturnType<ContentBlockStore['toJSON']>;
  } {
    return {
      tree: this.tree.toJSON(),
      graph: this.graph.toJSON(),
      contentStore: this.contentStore.toJSON(),
    };
  }

  /**
   * Create manager from serialized state
   */
  static fromJSON(data: {
    tree: ReturnType<VersionTree['toJSON']>;
    graph: ReturnType<VersionGraph['toJSON']>;
    contentStore: ReturnType<ContentBlockStore['toJSON']>;
  }): BranchManager {
    const tree = VersionTree.fromJSON(data.tree);
    const graph = new VersionGraph(tree);
    const contentStore = new ContentBlockStore();

    contentStore.fromJSON(data.contentStore);
    graph.loadEdges(data.graph.edges);

    return new BranchManager(tree, graph, contentStore);
  }
}

export default BranchManager;

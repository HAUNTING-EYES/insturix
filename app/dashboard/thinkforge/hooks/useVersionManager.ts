"use client";

/**
 * Version Manager Hook - Intent-based API for version management
 * 
 * CRITICAL: This hook exposes intent-based actions, NOT internal structures.
 * The UI should feel like it's driving a machine, not assembling one.
 * 
 * Good: createVersion(), mergeBranches(), getHistory()
 * Avoid: Exposing tree nodes, graph edges, internal structures
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BlockTree } from '@/lib/thinkforge/schemas/canonical';
import {
  VersionTree,
  VersionGraph,
  ContentBlockStore,
  BranchManager,
  VersionNode,
  VersionMetadata,
  MergeResult,
  BlockDiff,
} from '@/lib/thinkforge/versioning';

// Local storage key prefix
const VERSION_STORAGE_PREFIX = 'thinkforge_versions_';

type HistoryViewMode = 'linear' | 'branched' | 'timeline';

interface VersionHistoryItem {
  id: string;
  version: number;
  timestamp: Date;
  description?: string;
  isAutoSave?: boolean;
  isMergeResult?: boolean;
  isBranch?: boolean;
  isHead?: boolean;
}

interface CreateVersionOptions {
  isAutoSave?: boolean;
  metadata?: VersionMetadata;
}

interface UseVersionManagerReturn {
  // State
  isLoading: boolean;
  error: string | null;
  currentVersionId: string | null;
  hasVersions: boolean;
  
  // Version operations
  createVersion: (changes: BlockTree, description?: string, options?: CreateVersionOptions) => VersionNode | null;
  createInitialVersion: (blocks: BlockTree, description?: string, options?: CreateVersionOptions) => VersionNode | null;
  
  // Branch operations
  createBranch: (fromVersionId: string, newBlocks: BlockTree, description?: string) => VersionNode | null;
  mergeBranches: (versionId1: string, versionId2: string) => { version: VersionNode; mergeResult: MergeResult } | null;
  
  // History operations
  getHistory: (viewMode: HistoryViewMode) => VersionHistoryItem[];
  getVersionBlocks: (versionId: string) => BlockTree | null;
  
  // Diff operations
  getChanges: (versionId1: string, versionId2: string) => BlockDiff[];
  
  // Navigation
  setCurrentVersion: (versionId: string) => void;
  restoreVersion: (targetVersionId: string) => VersionNode | null;
  
  // Branch info
  getBranchHeads: () => VersionHistoryItem[];
  
  // Persistence
  save: () => void;
  load: () => void;
}

/**
 * Version Manager Hook
 * 
 * Provides intent-based API for version management.
 * Hides internal tree/graph structures from the UI.
 */
export function useVersionManager(sessionId: string | null): UseVersionManagerReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentVersionId, setCurrentVersionIdState] = useState<string | null>(null);
  const [hasVersions, setHasVersions] = useState(false);
  
  // Internal structures (not exposed directly)
  const managerRef = useRef<BranchManager | null>(null);
  const scriptIdRef = useRef<string>(`script_${sessionId || 'default'}`);
  
  // Initialize manager
  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      setHasVersions(false);
      return;
    }
    
    const initialize = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        scriptIdRef.current = `script_${sessionId}`;
        
        // Try to load from local storage
        const storageKey = `${VERSION_STORAGE_PREFIX}${sessionId}`;
        const stored = localStorage.getItem(storageKey);
        
        if (stored) {
          const data = JSON.parse(stored);
          managerRef.current = BranchManager.fromJSON(data);
        } else {
          // Create fresh manager
          const tree = new VersionTree(scriptIdRef.current);
          const graph = new VersionGraph(tree);
          const contentStore = new ContentBlockStore();
          managerRef.current = new BranchManager(tree, graph, contentStore);
        }
        
        // Update state
        const latest = managerRef.current.getLatestVersion();
        setCurrentVersionIdState(latest?.versionId || null);
        setHasVersions(managerRef.current.getTree().getAllVersions().length > 0);
      } catch (e: any) {
        setError(e?.message || 'Failed to initialize version manager');
      } finally {
        setIsLoading(false);
      }
    };
    
    initialize();
  }, [sessionId]);
  
  // Save to local storage
  const save = useCallback(() => {
    if (!sessionId || !managerRef.current) return;
    
    try {
      const storageKey = `${VERSION_STORAGE_PREFIX}${sessionId}`;
      const data = managerRef.current.toJSON();
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save version history:', e);
    }
  }, [sessionId]);
  
  // Load from local storage
  const load = useCallback(() => {
    if (!sessionId) return;
    
    try {
      const storageKey = `${VERSION_STORAGE_PREFIX}${sessionId}`;
      const stored = localStorage.getItem(storageKey);
      
      if (stored) {
        const data = JSON.parse(stored);
        managerRef.current = BranchManager.fromJSON(data);
        
        const latest = managerRef.current.getLatestVersion();
        setCurrentVersionIdState(latest?.versionId || null);
        setHasVersions(managerRef.current.getTree().getAllVersions().length > 0);
      }
    } catch (e) {
      console.error('Failed to load version history:', e);
    }
  }, [sessionId]);
  
  // Create version from current head
  const createVersion = useCallback((
    changes: BlockTree,
    description?: string,
    options?: CreateVersionOptions
  ): VersionNode | null => {
    if (!managerRef.current) return null;
    
    try {
      const metadata: VersionMetadata = {
        ...(options?.metadata || {}),
        description: options?.metadata?.description || description || 'Manual save',
        isAutoSave: options?.isAutoSave ?? options?.metadata?.isAutoSave ?? false,
      };
      
      const version = managerRef.current.createVersion(
        currentVersionId,
        changes,
        { metadata }
      );
      
      setCurrentVersionIdState(version.versionId);
      setHasVersions(true);
      save();
      
      return version;
    } catch (e: any) {
      setError(e?.message || 'Failed to create version');
      return null;
    }
  }, [currentVersionId, save]);
  
  // Create initial version (no parent)
  const createInitialVersion = useCallback((
    blocks: BlockTree,
    description?: string,
    options?: CreateVersionOptions
  ): VersionNode | null => {
    if (!managerRef.current) return null;
    
    try {
      const metadata: VersionMetadata = {
        ...(options?.metadata || {}),
        description: options?.metadata?.description || description || 'Initial version',
        isAutoSave: options?.isAutoSave ?? options?.metadata?.isAutoSave ?? false,
      };
      
      const version = managerRef.current.createVersion(
        null, // No parent
        blocks,
        { metadata }
      );
      
      setCurrentVersionIdState(version.versionId);
      setHasVersions(true);
      save();
      
      return version;
    } catch (e: any) {
      setError(e?.message || 'Failed to create initial version');
      return null;
    }
  }, [save]);
  
  // Create branch
  const createBranch = useCallback((
    fromVersionId: string,
    newBlocks: BlockTree,
    description?: string
  ): VersionNode | null => {
    if (!managerRef.current) return null;
    
    try {
      const version = managerRef.current.createBranch(
        fromVersionId,
        newBlocks,
        { description }
      );
      
      setCurrentVersionIdState(version.versionId);
      save();
      
      return version;
    } catch (e: any) {
      setError(e?.message || 'Failed to create branch');
      return null;
    }
  }, [save]);
  
  // Merge branches
  const mergeBranches = useCallback((
    versionId1: string,
    versionId2: string
  ): { version: VersionNode; mergeResult: MergeResult } | null => {
    if (!managerRef.current) return null;
    
    try {
      const result = managerRef.current.mergeBranches(versionId1, versionId2);
      setCurrentVersionIdState(result.version.versionId);
      save();
      
      return result;
    } catch (e: any) {
      setError(e?.message || 'Failed to merge branches');
      return null;
    }
  }, [save]);
  
  // Get history
  const getHistory = useCallback((viewMode: HistoryViewMode): VersionHistoryItem[] => {
    if (!managerRef.current || !currentVersionId) return [];
    
    try {
      let versions: VersionNode[] = [];
      
      switch (viewMode) {
        case 'linear':
          versions = managerRef.current.getVersionHistory(currentVersionId);
          break;
        case 'branched':
          const root = managerRef.current.getTree().getRoot();
          if (root) {
            versions = managerRef.current.getBranchHistory(root.versionId);
          }
          break;
        case 'timeline':
          versions = managerRef.current.getTree().getAllVersions()
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          break;
      }
      
      const heads = new Set(
        managerRef.current.getBranchHeads().map(h => h.versionId)
      );
      
      return versions.map(v => ({
        id: v.versionId,
        version: v.version,
        timestamp: v.createdAt,
        description: v.metadata?.description,
        isAutoSave: v.metadata?.isAutoSave,
        isMergeResult: v.metadata?.isMergeResult,
        isBranch: v.childrenVersionIds.length > 1,
        isHead: heads.has(v.versionId),
      }));
    } catch {
      return [];
    }
  }, [currentVersionId]);
  
  // Get version blocks
  const getVersionBlocks = useCallback((versionId: string): BlockTree | null => {
    if (!managerRef.current) return null;
    
    try {
      return managerRef.current.getVersionBlocks(versionId);
    } catch {
      return null;
    }
  }, []);
  
  // Get changes between versions
  const getChanges = useCallback((
    versionId1: string,
    versionId2: string
  ): BlockDiff[] => {
    if (!managerRef.current) return [];
    
    try {
      return managerRef.current.diffVersions(versionId1, versionId2);
    } catch {
      return [];
    }
  }, []);
  
  // Set current version
  const setCurrentVersion = useCallback((versionId: string) => {
    if (!managerRef.current) return;
    
    const version = managerRef.current.getTree().getVersion(versionId);
    if (version) {
      setCurrentVersionIdState(versionId);
    }
  }, []);
  
  // Restore version
  const restoreVersion = useCallback((targetVersionId: string): VersionNode | null => {
    if (!managerRef.current || !currentVersionId) return null;
    
    try {
      const version = managerRef.current.restoreVersion(
        targetVersionId,
        currentVersionId
      );
      
      setCurrentVersionIdState(version.versionId);
      save();
      
      return version;
    } catch (e: any) {
      setError(e?.message || 'Failed to restore version');
      return null;
    }
  }, [currentVersionId, save]);
  
  // Get branch heads
  const getBranchHeads = useCallback((): VersionHistoryItem[] => {
    if (!managerRef.current) return [];
    
    try {
      const heads = managerRef.current.getBranchHeads();
      
      return heads.map(v => ({
        id: v.versionId,
        version: v.version,
        timestamp: v.createdAt,
        description: v.metadata?.description,
        isAutoSave: v.metadata?.isAutoSave,
        isMergeResult: v.metadata?.isMergeResult,
        isBranch: false,
        isHead: true,
      }));
    } catch {
      return [];
    }
  }, []);
  
  return {
    isLoading,
    error,
    currentVersionId,
    hasVersions,
    createVersion,
    createInitialVersion,
    createBranch,
    mergeBranches,
    getHistory,
    getVersionBlocks,
    getChanges,
    setCurrentVersion,
    restoreVersion,
    getBranchHeads,
    save,
    load,
  };
}

export default useVersionManager;

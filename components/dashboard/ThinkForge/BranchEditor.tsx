'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  GitMerge,
  History,
  Clock,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Plus,
  Trash2,
  Eye,
  GitFork,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useVersionManager } from '@/app/dashboard/thinkforge/hooks/useVersionManager';
import type { BlockTree } from '@/lib/thinkforge/schemas/canonical';
import type { CIRDocument, CIRSection } from '@/lib/thinkforge/schemas/cir';

type BranchBlocks = BlockTree | CIRDocument | CIRSection[];

interface BranchEditorProps {
  sessionId: string | null;
  scriptId?: string | null;
  currentBlocks: BranchBlocks;
  onRestoreVersion: (blocks: BranchBlocks) => void;
  onClose: () => void;
}

type ViewMode = 'linear' | 'branched' | 'timeline';

export const BranchEditor: React.FC<BranchEditorProps> = ({
  sessionId,
  scriptId,
  currentBlocks,
  onRestoreVersion,
  onClose,
}) => {
  const versionManager = useVersionManager(sessionId, scriptId);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchDescription, setBranchDescription] = useState('');
  const [previewBlocks, setPreviewBlocks] = useState<BranchBlocks | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

  // Get history based on view mode
  const history = useMemo(() => {
    return versionManager.getHistory(viewMode);
  }, [versionManager, viewMode]);

  // Get branch heads
  const branchHeads = useMemo(() => {
    return versionManager.getBranchHeads();
  }, [versionManager]);

  // Format timestamp
  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handle version selection
  const handleSelectVersion = useCallback((versionId: string) => {
    setSelectedVersionId(versionId);
    const blocks = versionManager.getVersionBlocks(versionId);
    setPreviewBlocks(blocks);
  }, [versionManager]);

  // Handle version restore
  const handleRestoreVersion = useCallback(() => {
    if (!selectedVersionId) return;
    
    const blocks = versionManager.getVersionBlocks(selectedVersionId);
    if (blocks) {
      onRestoreVersion(blocks);
      versionManager.restoreVersion(selectedVersionId);
      setSelectedVersionId(null);
      setPreviewBlocks(null);
    }
  }, [selectedVersionId, versionManager, onRestoreVersion]);

  // Handle branch creation
  const handleCreateBranch = useCallback(() => {
    if (!selectedVersionId) return;
    
    setIsCreatingBranch(true);
    setBranchDescription('');
  }, [selectedVersionId]);

  // Confirm branch creation
  const confirmCreateBranch = useCallback(() => {
    if (!selectedVersionId || !currentBlocks) return;
    
    const newVersion = versionManager.createBranch(
      selectedVersionId,
      currentBlocks,
      branchDescription || undefined
    );
    
    if (newVersion) {
      setIsCreatingBranch(false);
      setBranchDescription('');
      setSelectedVersionId(null);
    }
  }, [selectedVersionId, currentBlocks, branchDescription, versionManager]);

  // Handle merge
  const handleMerge = useCallback((targetId: string) => {
    if (!versionManager.currentVersionId) return;
    setMergeTargetId(targetId);
    setIsMerging(true);
  }, [versionManager.currentVersionId]);

  // Confirm merge
  const confirmMerge = useCallback(() => {
    if (!versionManager.currentVersionId || !mergeTargetId) return;
    
    const result = versionManager.mergeBranches(
      versionManager.currentVersionId,
      mergeTargetId
    );
    
    if (result) {
      const mergedBlocks = versionManager.getVersionBlocks(result.version.versionId);
      if (mergedBlocks) {
        onRestoreVersion(mergedBlocks);
      }
    }
    
    setIsMerging(false);
    setMergeTargetId(null);
  }, [versionManager, mergeTargetId, onRestoreVersion]);

  // Create initial version if none exists
  const handleCreateInitialVersion = useCallback(() => {
    if (currentBlocks.length > 0) {
      versionManager.createInitialVersion(currentBlocks, 'Initial version');
    }
  }, [versionManager, currentBlocks]);

  if (versionManager.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Handle missing sessionId
  if (!sessionId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-zinc-100">Script History</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <History className="h-12 w-12 text-zinc-600 mb-4" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">No Session Active</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Start working on a script to enable version history.
          </p>
        </div>
      </div>
    );
  }

  // Handle errors
  if (versionManager.error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-zinc-100">Script History</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <History className="h-12 w-12 text-red-500/50 mb-4" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">Error Loading History</h3>
          <p className="text-sm text-red-400 mb-4">
            {versionManager.error}
          </p>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="border-zinc-700 text-zinc-300"
          >
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold text-zinc-100">Version History</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* No versions state */}
      {!versionManager.hasVersions && (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <History className="h-12 w-12 text-zinc-600 mb-4" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">No Version History</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Create your first version to start tracking changes
          </p>
          <Button
            onClick={handleCreateInitialVersion}
            className="bg-red-600 hover:bg-red-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Initial Version
          </Button>
        </div>
      )}

      {/* Main content */}
      {versionManager.hasVersions && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Version list */}
          <div className="w-1/2 border-r border-zinc-800 flex flex-col">
            {/* View mode tabs */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList className="w-full bg-zinc-900/50 p-1">
                <TabsTrigger value="timeline" className="flex-1 text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="linear" className="flex-1 text-xs">
                  <History className="h-3 w-3 mr-1" />
                  Linear
                </TabsTrigger>
                <TabsTrigger value="branched" className="flex-1 text-xs">
                  <GitFork className="h-3 w-3 mr-1" />
                  Branches
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Version list */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {history.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectVersion(item.id)}
                    className={`w-full p-3 rounded-lg text-left transition-colors ${
                      selectedVersionId === item.id
                        ? 'bg-red-600/20 border border-red-500/30'
                        : 'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent'
                    } ${
                      item.id === versionManager.currentVersionId
                        ? 'ring-1 ring-green-500/50'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-zinc-400">
                            v{item.version}
                          </span>
                          {item.isHead && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500/50 text-green-400">
                              HEAD
                            </Badge>
                          )}
                          {item.isBranch && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-500/50 text-blue-400">
                              <GitFork className="h-2 w-2 mr-1" />
                              Branch
                            </Badge>
                          )}
                          {item.isMergeResult && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-purple-500/50 text-purple-400">
                              <GitMerge className="h-2 w-2 mr-1" />
                              Merge
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-zinc-200 truncate">
                          {item.description || 'No description'}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {formatTimestamp(item.timestamp)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Preview panel */}
          <div className="w-1/2 flex flex-col">
            {selectedVersionId ? (
              <>
                <div className="p-4 border-b border-zinc-800">
                  <h3 className="text-sm font-medium text-zinc-300 mb-2">
                    Version Preview
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleRestoreVersion}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCreateBranch}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    >
                      <GitBranch className="h-3 w-3 mr-1" />
                      Branch
                    </Button>
                    {branchHeads.length > 1 && selectedVersionId !== versionManager.currentVersionId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMerge(selectedVersionId)}
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                      >
                        <GitMerge className="h-3 w-3 mr-1" />
                        Merge
                      </Button>
                    )}
                  </div>
                </div>
                
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {previewBlocks && previewBlocks.length > 0 ? (
                      <div className="space-y-2">
                        {previewBlocks.slice(0, 10).map((block, i) => (
                          <div
                            key={block.id || i}
                            className="p-2 bg-zinc-800/50 rounded text-xs text-zinc-400"
                          >
                            <span className="text-zinc-500">[{block.type}]</span>{' '}
                            {JSON.stringify(block.children || block.content || '').slice(0, 100)}...
                          </div>
                        ))}
                        {previewBlocks.length > 10 && (
                          <p className="text-xs text-zinc-500 text-center">
                            +{previewBlocks.length - 10} more blocks
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500 text-center">
                        No content to preview
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex items-center justify-center flex-1 text-zinc-500">
                <div className="text-center">
                  <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select a version to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create branch dialog */}
      <Dialog open={isCreatingBranch} onOpenChange={setIsCreatingBranch}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Create Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="branch-description" className="text-zinc-300">
                Description (optional)
              </Label>
              <Input
                id="branch-description"
                value={branchDescription}
                onChange={(e) => setBranchDescription(e.target.value)}
                placeholder="Describe this branch..."
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreatingBranch(false)}
              className="border-zinc-700 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmCreateBranch}
              className="bg-red-600 hover:bg-red-700"
            >
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge confirmation dialog */}
      <Dialog open={isMerging} onOpenChange={setIsMerging}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Merge Branches</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-zinc-400">
              This will merge the selected version into your current version.
              Any conflicts will be automatically resolved (preferring your changes).
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsMerging(false)}
              className="border-zinc-700 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmMerge}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <GitMerge className="h-4 w-4 mr-2" />
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error display */}
      {versionManager.error && (
        <div className="p-4 bg-red-900/20 border-t border-red-800">
          <p className="text-sm text-red-400">{versionManager.error}</p>
        </div>
      )}
    </div>
  );
};

export default BranchEditor;

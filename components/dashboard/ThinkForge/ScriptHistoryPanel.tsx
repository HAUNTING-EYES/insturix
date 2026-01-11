'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { History, Clock, RotateCcw, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useVersionManager } from '@/app/dashboard/thinkforge/hooks/useVersionManager';
import type { BlockTree } from '@/lib/thinkforge/schemas/canonical';
import type { CIRDocument, CIRSection } from '@/lib/thinkforge/schemas/cir';

type BranchBlocks = BlockTree | CIRDocument | CIRSection[];

interface ScriptHistoryPanelProps {
  sessionId: string | null;
  currentBlocks: BranchBlocks;
  onRestoreVersion: (blocks: BranchBlocks) => void;
  onClose: () => void;
}

export const ScriptHistoryPanel: React.FC<ScriptHistoryPanelProps> = ({
  sessionId,
  currentBlocks,
  onRestoreVersion,
  onClose,
}) => {
  const versionManager = useVersionManager(sessionId);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  // Get timeline history (all versions, sorted by time)
  const history = useMemo(() => {
    const timeline = versionManager.getHistory('timeline');
    // Reverse to show most recent first
    return [...timeline].reverse();
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

  // Handle version restore
  const handleRestoreVersion = useCallback((versionId: string) => {
    const blocks = versionManager.getVersionBlocks(versionId);
    if (blocks) {
      onRestoreVersion(blocks);
      versionManager.restoreVersion(versionId);
      onClose();
    }
  }, [versionManager, onRestoreVersion, onClose]);

  // Create initial version from current blocks if none exists
  useEffect(() => {
    if (!versionManager.isLoading && !versionManager.hasVersions && currentBlocks && Array.isArray(currentBlocks) && currentBlocks.length > 0) {
      // Auto-create initial version if we have content but no versions
      versionManager.createInitialVersion(currentBlocks, 'Initial version');
    }
  }, [versionManager.isLoading, versionManager.hasVersions, currentBlocks, versionManager]);

  if (versionManager.isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex flex-col h-full min-h-[400px]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-red-500" />
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
          <p className="text-sm text-zinc-500">
            Start working on a script to enable version history.
          </p>
        </div>
      </div>
    );
  }

  if (versionManager.error) {
    return (
      <div className="flex flex-col h-full min-h-[400px]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-red-500" />
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
          <p className="text-sm text-red-400">{versionManager.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-red-500" />
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

      {/* Version list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-12 w-12 text-zinc-600 mb-4" />
              <h3 className="text-lg font-medium text-zinc-300 mb-2">No Version History</h3>
              <p className="text-sm text-zinc-500">
                Versions will appear here as you save your script.
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-lg border transition-colors ${
                  item.id === versionManager.currentVersionId
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-mono text-zinc-400">
                        Version {item.version}
                      </span>
                      {item.id === versionManager.currentVersionId && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                          Current
                        </span>
                      )}
                      {item.isAutoSave && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-400 border border-zinc-600/50">
                          Auto-save
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-zinc-400 mb-2">{item.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Clock className="h-3.5 w-3.5" />
                      {formatTimestamp(item.timestamp)}
                    </div>
                  </div>
                  {item.id !== versionManager.currentVersionId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestoreVersion(item.id)}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

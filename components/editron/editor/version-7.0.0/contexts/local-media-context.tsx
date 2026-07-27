"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { LocalMediaFile } from "../types";
import { getUserId } from "../utils/user-id";
import {
  getUserMediaItems,
  deleteMediaItem as deleteFromIndexDB,
  clearUserMedia,
} from "../utils/indexdb";
import {
  uploadMediaFile,
  uploadMediaFiles,
  type UploadedMedia,
} from "../utils/media-upload";
import { bindAbortToPageLifecycle } from "../utils/request-lifecycle";

interface AddMediaFilesResult {
  uploadBatchId: string;
  uploaded: LocalMediaFile[];
  failed: Array<{ filename: string; error: string }>;
}

interface LocalMediaContextType {
  localMediaFiles: LocalMediaFile[];
  addMediaFile: (file: File) => Promise<LocalMediaFile | void>;
  addMediaFiles: (files: File[]) => Promise<AddMediaFilesResult>;
  removeMediaFile: (id: string) => Promise<void>;
  togglePinMediaFile: (id: string, pinned: boolean) => Promise<void>;
  clearMediaFiles: () => Promise<void>;
  isLoading: boolean;
}

const LocalMediaContext = createContext<LocalMediaContextType | undefined>(
  undefined
);

function toLocalMediaFile(mediaItem: UploadedMedia): LocalMediaFile {
  return {
    id: mediaItem.assetId,
    name: mediaItem.filename,
    type: mediaItem.type,
    path: mediaItem.url,
    assetId: mediaItem.assetId,
    size: mediaItem.size,
    lastModified: Date.now(),
    thumbnail: mediaItem.thumbnail || "",
    duration: mediaItem.duration,
    dimensions: mediaItem.dimensions,
  };
}

function mergeLocalMediaFiles(prev: LocalMediaFile[], incoming: LocalMediaFile[]): LocalMediaFile[] {
  const next = [...prev];
  for (const mediaFile of incoming) {
    const index = next.findIndex((item) => item.id === mediaFile.id);
    if (index >= 0) {
      next[index] = mediaFile;
    } else {
      next.push(mediaFile);
    }
  }
  return next;
}

/**
 * LocalMediaProvider Component
 *
 * Provides context for managing local media files uploaded by the user.
 * Handles:
 * - Storing and retrieving local media files from IndexedDB and server
 * - Adding new media files
 * - Removing media files
 * - Persisting media files between sessions
 */
export const LocalMediaProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [localMediaFiles, setLocalMediaFiles] = useState<LocalMediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userId] = useState(() => getUserId());

  // Load saved media files from server on component mount
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const detachPageLifecycle = bindAbortToPageLifecycle(controller);

    const loadMediaFiles = async () => {
      let nextCursor: string | null = null;
      let receivedPage = false;
      const seenCursors = new Set<string>();
      setIsLoading(true);

      try {
        do {
          const query = new URLSearchParams({ limit: "100" });
          if (nextCursor) query.set("cursor", nextCursor);
          const response = await fetch(`/api/services/editron/media/list?${query.toString()}`, {
            signal: controller.signal,
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data?.success || !Array.isArray(data.assets)) {
            throw new Error(data?.error || `Media list failed with HTTP ${response.status}`);
          }
          if (cancelled || controller.signal.aborted) return;

          setLocalMediaFiles((previous) =>
            receivedPage ? mergeLocalMediaFiles(previous, data.assets) : data.assets,
          );
          receivedPage = true;
          setIsLoading(false);

          const continuation = data.hasMore && typeof data.nextCursor === "string"
            ? data.nextCursor
            : null;
          if (data.hasMore && !continuation) {
            throw new Error("Media list reported more assets without a continuation cursor");
          }
          if (continuation && seenCursors.has(continuation)) {
            throw new Error("Media list returned a repeated continuation cursor");
          }
          if (continuation) seenCursors.add(continuation);
          nextCursor = continuation;
        } while (nextCursor && !cancelled);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        console.error("Error loading media files from server:", error);
        if (!cancelled && !receivedPage) setLocalMediaFiles([]);
      } finally {
        if (!cancelled && !controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadMediaFiles();
    return () => {
      cancelled = true;
      detachPageLifecycle();
      controller.abort();
    };
  }, [userId]);

  /**
   * Add a new media file to the collection
   */
  const addMediaFile = useCallback(
    async (file: File): Promise<LocalMediaFile | void> => {
      setIsLoading(true);
      try {
        // Upload file to GCS and get asset metadata
        const mediaItem = await uploadMediaFile(file);

        const newMediaFile = toLocalMediaFile(mediaItem);
        setLocalMediaFiles((prev) => mergeLocalMediaFiles(prev, [newMediaFile]));

        return newMediaFile;
      } catch (error) {
        console.error("Error adding media file:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const addMediaFiles = useCallback(async (files: File[]): Promise<AddMediaFilesResult> => {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) {
      return { uploadBatchId: "", uploaded: [], failed: [] };
    }

    setIsLoading(true);
    try {
      const result = await uploadMediaFiles(selectedFiles);
      const uploaded = result.uploaded.map(toLocalMediaFile);
      if (uploaded.length > 0) {
        setLocalMediaFiles((prev) => mergeLocalMediaFiles(prev, uploaded));
      }
      return { uploadBatchId: result.uploadBatchId, uploaded, failed: result.failed };
    } catch (error) {
      console.error("Error adding media files:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Remove a media file by ID
   */
  const removeMediaFile = useCallback(
    async (id: string): Promise<void> => {
      try {
        const fileToRemove = localMediaFiles.find((file) => file.id === id);

        if (fileToRemove) {
          // Delete from server (MongoDB + GCS)
          const response = await fetch(`/api/services/editron/media/delete?assetId=${id}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete media file');
          }

          // Update state
          setLocalMediaFiles((prev) => prev.filter((file) => file.id !== id));
        }
      } catch (error) {
        console.error("Error removing media file:", error);
        throw error;
      }
    },
    [localMediaFiles]
  );

  /**
   * Pin/unpin a media file (reference pool — protected from LRU eviction).
   * Optimistic; reverts on failure.
   */
  const togglePinMediaFile = useCallback(
    async (id: string, pinned: boolean): Promise<void> => {
      setLocalMediaFiles((prev) =>
        prev.map((f: any) => (f.id === id || f.assetId === id ? { ...f, pinned } : f)),
      );
      try {
        const res = await fetch("/api/services/editron/media/pin", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: id, pinned }),
        });
        if (!res.ok) throw new Error("Failed to update pin");
      } catch (error) {
        console.error("Error toggling pin:", error);
        setLocalMediaFiles((prev) =>
          prev.map((f: any) => (f.id === id || f.assetId === id ? { ...f, pinned: !pinned } : f)),
        );
      }
    },
    [],
  );

  /**
   * Clear all media files
   */
  const clearMediaFiles = useCallback(async (): Promise<void> => {
    try {
      // Delete all files from server
      for (const file of localMediaFiles) {
        try {
          await fetch(`/api/services/editron/media/delete?assetId=${file.id}`, {
            method: 'DELETE',
          });
        } catch (error) {
          console.error(`Error deleting file ${file.id}:`, error);
          // Continue with other deletions
        }
      }

      // Update state
      setLocalMediaFiles([]);
    } catch (error) {
      console.error("Error clearing media files:", error);
    }
  }, [localMediaFiles, userId]);

  const value = {
    localMediaFiles,
    addMediaFile,
    addMediaFiles,
    removeMediaFile,
    togglePinMediaFile,
    clearMediaFiles,
    isLoading,
  };

  return (
    <LocalMediaContext.Provider value={value}>
      {children}
    </LocalMediaContext.Provider>
  );
};

/**
 * Hook to use the local media context
 */
export const useLocalMedia = () => {
  const context = useContext(LocalMediaContext);
  if (context === undefined) {
    throw new Error("useLocalMedia must be used within a LocalMediaProvider");
  }
  return context;
};

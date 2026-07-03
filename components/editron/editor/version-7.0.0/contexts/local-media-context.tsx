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
import { uploadMediaFile, deleteMediaFile } from "../utils/media-upload";

interface LocalMediaContextType {
  localMediaFiles: LocalMediaFile[];
  addMediaFile: (file: File) => Promise<LocalMediaFile | void>;
  removeMediaFile: (id: string) => Promise<void>;
  togglePinMediaFile: (id: string, pinned: boolean) => Promise<void>;
  clearMediaFiles: () => Promise<void>;
  isLoading: boolean;
}

const LocalMediaContext = createContext<LocalMediaContextType | undefined>(
  undefined
);

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
    const loadMediaFiles = async () => {
      try {
        setIsLoading(true);
        
        // Fetch from server (MongoDB)
        const response = await fetch('/api/services/editron/media/list');
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.assets) {
            setLocalMediaFiles(data.assets);
          } else {
            console.error('Failed to load media files from server:', data.error);
            setLocalMediaFiles([]);
          }
        } else {
          console.error('Failed to load media files from server');
          setLocalMediaFiles([]);
        }
      } catch (error) {
        console.error("Error loading media files from server:", error);
        setLocalMediaFiles([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadMediaFiles();
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

        // Convert to LocalMediaFile format
        const newMediaFile: LocalMediaFile = {
          id: mediaItem.assetId, // Use assetId as the unique identifier
          name: mediaItem.filename,
          type: mediaItem.type,
          path: mediaItem.url, // Signed URL for display
          assetId: mediaItem.assetId, // Store assetId for reference
          size: mediaItem.size,
          lastModified: Date.now(),
          thumbnail: mediaItem.thumbnail || "",
          duration: mediaItem.duration,
          dimensions: mediaItem.dimensions, // Add dimensions for aspect ratio
        };

        // Update state with the new media file
        setLocalMediaFiles((prev) => {
          // Check if file with same ID already exists
          const exists = prev.some((item) => item.id === newMediaFile.id);
          if (exists) {
            // Replace existing file
            return prev.map((item) =>
              item.id === newMediaFile.id ? newMediaFile : item
            );
          }
          // Add new file
          return [...prev, newMediaFile];
        });

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

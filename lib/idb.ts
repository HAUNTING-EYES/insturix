// IndexedDB utilities using the idb library
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface ClickatronDB extends DBSchema {
  sessions: {
    key: string;
    value: {
      id: string;
      data: any;
      timestamp: number;
    };
  };
  images: {
    key: string;
    value: {
      id: string;
      blob: Blob;
      metadata: {
        name: string;
        type: string;
        size: number;
        timestamp: number;
      };
    };
  };
}

class IDBManager {
  private static instance: IDBManager;
  private db: IDBPDatabase<ClickatronDB> | null = null;
  private readonly DB_NAME = 'clickatron_db';
  private readonly DB_VERSION = 1;

  private constructor() {}

  static getInstance(): IDBManager {
    if (!IDBManager.instance) {
      IDBManager.instance = new IDBManager();
    }
    return IDBManager.instance;
  }

  private async getDB(): Promise<IDBPDatabase<ClickatronDB>> {
    if (!this.db) {
      this.db = await openDB<ClickatronDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // Create sessions store
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'id' });
          }
          
          // Create images store
          if (!db.objectStoreNames.contains('images')) {
            db.createObjectStore('images', { keyPath: 'id' });
          }
        },
      });
    }
    return this.db;
  }

  // Session management
  async saveSession(sessionId: string, data: any): Promise<void> {
    const db = await this.getDB();
    
    try {
      // Use JSON serialization to ensure data is completely serializable
      const jsonString = JSON.stringify(data, (key, value) => {
        // Skip function properties and React components
        if (typeof value === 'function') {
          return undefined;
        }
        // Handle Date objects
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });
      
      // Parse it back to get a clean object
      const serializableData = JSON.parse(jsonString);
      
      await db.put('sessions', {
        id: sessionId,
        data: serializableData,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to serialize session data:', error);
      console.log('Problematic data:', data);
      throw new Error('Session data contains non-serializable content');
    }
  }

  async getSession(sessionId: string): Promise<any | null> {
    const db = await this.getDB();
    const result = await db.get('sessions', sessionId);
    return result?.data || null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('sessions', sessionId);
  }

  // Image management
  async saveImage(imageId: string, blob: Blob, metadata: { name: string; type: string }): Promise<void> {
    const db = await this.getDB();
    await db.put('images', {
      id: imageId,
      blob,
      metadata: {
        ...metadata,
        size: blob.size,
        timestamp: Date.now(),
      },
    });
  }

  async getImage(imageId: string): Promise<Blob | null> {
    const db = await this.getDB();
    const result = await db.get('images', imageId);
    return result?.blob || null;
  }

  async deleteImage(imageId: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('images', imageId);
  }

  // Utility methods
  async getAllSessions(): Promise<Array<{ id: string; data: any; timestamp: number }>> {
    const db = await this.getDB();
    return await db.getAll('sessions');
  }

  async clearOldSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const db = await this.getDB();
    const cutoff = Date.now() - maxAge;
    const sessions = await db.getAll('sessions');
    
    for (const session of sessions) {
      if (session.timestamp < cutoff) {
        await db.delete('sessions', session.id);
      }
    }
  }
}

export const idbManager = IDBManager.getInstance();
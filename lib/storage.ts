// Storage utility for handling large files with IndexedDB fallback
export class StorageManager {
  private static DB_NAME = 'clickatron2_storage';
  private static DB_VERSION = 1;
  private static STORE_NAME = 'sessions';

  private static async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  static async setItem(key: string, data: any): Promise<void> {
    const serialized = JSON.stringify(data);
    
    // Try sessionStorage first for smaller data
    if (serialized.length < 4 * 1024 * 1024) { // 4MB limit
      try {
        sessionStorage.setItem(key, serialized);
        return;
      } catch (error) {
        console.warn('SessionStorage failed, falling back to IndexedDB:', error);
      }
    }

    // Fallback to IndexedDB for larger data
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      await new Promise<void>((resolve, reject) => {
        const request = store.put({ id: key, data: serialized });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      
      db.close();
    } catch (error) {
      console.error('IndexedDB storage failed:', error);
      throw new Error('Storage quota exceeded. Please try with a smaller image.');
    }
  }

  static async getItem(key: string): Promise<any> {
    // Try sessionStorage first
    try {
      const item = sessionStorage.getItem(key);
      if (item) {
        return JSON.parse(item);
      }
    } catch (error) {
      console.warn('SessionStorage read failed:', error);
    }

    // Fallback to IndexedDB
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const result = await new Promise<any>((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      db.close();
      return result ? JSON.parse(result.data) : null;
    } catch (error) {
      console.error('IndexedDB read failed:', error);
      return null;
    }
  }

  static async removeItem(key: string): Promise<void> {
    // Remove from sessionStorage
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn('SessionStorage removal failed:', error);
    }

    // Remove from IndexedDB
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      
      db.close();
    } catch (error) {
      console.warn('IndexedDB removal failed:', error);
    }
  }
}
/**
 * Multipart Upload Client (V2 - Responsive)
 * 
 * Features:
 * - Byte-level progress tracking via XHR
 * - Detailed console logging for "is it working" visibility
 * - Parallel execution with status updates
 */

const CHUNK_SIZE = 10 * 1024 * 1024; 
const MAX_CONCURRENT = 4;
const MAX_RETRIES = 3;

export interface MultipartProgress {
  loaded: number;
  total: number;
  progress: number; 
  speed: number; 
  remaining: number;
  partsCompleted: number;
  partsTotal: number;
  message: string; // New: For UI feedback
}

export interface MultipartResult {
  storageKey: string;
  publicUrl: string;
  storage: "r2";
  contentType: string;
}

interface CompletedPart {
  partNumber: number;
  etag: string;
}

// ─── Internal API Helpers ────────────────────────────────────────

async function initMultipart(filename: string, contentType: string) {
  console.log(`[R2] Initializing upload for: ${filename}`);
  const res = await fetch("/api/services/alyzitron/r2/multipart/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType }),
  });
  if (!res.ok) throw new Error("Failed to init upload");
  return res.json();
}

async function signPart(uploadId: string, key: string, partNumber: number): Promise<string> {
  const res = await fetch("/api/services/alyzitron/r2/multipart/sign-part", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, key, partNumber }),
  });
  const { url } = await res.json();
  return url;
}

// ─── The Core: Responsive Chunk Upload ───────────────────────────

function uploadChunk(
  url: string,
  chunk: Blob,
  partNumber: number,
  signal: AbortSignal,
  onProgress: (bytes: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        resolve(etag?.replace(/"/g, "") || "");
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network Error"));
    xhr.onabort = () => reject(new Error("Aborted"));

    const abortHandler = () => xhr.abort();
    signal.addEventListener("abort", abortHandler);

    xhr.send(chunk);
  });
}

// ─── Main Logic ──────────────────────────────────────────────────

export async function multipartUpload(
  file: File,
  onProgress?: (progress: MultipartProgress) => void,
  signal?: AbortSignal
): Promise<MultipartResult> {
  const totalParts = Math.ceil(file.size / CHUNK_SIZE);
  const startTime = Date.now();
  const { uploadId, key } = await initMultipart(file.name, file.type);
  
  // Track how many bytes EACH part has currently sent
  const partProgress = new Array(totalParts).fill(0);
  let completedCount = 0;

  const emit = (msg: string) => {
    const loaded = partProgress.reduce((a, b) => a + b, 0);
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = elapsed > 0 ? loaded / elapsed : 0;
    
    onProgress?.({
      loaded,
      total: file.size,
      progress: Math.min(loaded / file.size, 0.99), // Keep at 99% until "Complete" call finishes
      speed,
      remaining: speed > 0 ? (file.size - loaded) / speed : 0,
      partsCompleted: completedCount,
      partsTotal: totalParts,
      message: msg
    });
  };

  const uploadPartWithRetry = async (partNumber: number, chunk: Blob): Promise<CompletedPart> => {
    let lastErr;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const url = await signPart(uploadId, key, partNumber);
        console.log(`[R2] Part ${partNumber}/${totalParts}: Starting attempt ${i + 1}`);
        
        const etag = await uploadChunk(url, chunk, partNumber, signal || new AbortController().signal, (bytes) => {
          partProgress[partNumber - 1] = bytes;
          emit(`Uploading part ${partNumber}/${totalParts}...`);
        });

        console.log(`[R2] Part ${partNumber} ✅ OK`);
        completedCount++;
        return { partNumber, etag };
      } catch (err) {
        console.warn(`[R2] Part ${partNumber} ⚠️ Attempt ${i+1} failed:`, err);
        lastErr = err;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
    throw lastErr;
  };

  // ─── Parallel Queue ───
  const tasks = Array.from({ length: totalParts }, (_, i) => {
    const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    return () => uploadPartWithRetry(i + 1, chunk);
  });

  // Concurrency helper
  const results: CompletedPart[] = [];
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, totalParts) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) results.push(await task());
    }
  });

  await Promise.all(workers);

  // ─── Finalize ───
  console.log(`[R2] All parts uploaded. Finalizing...`);
  emit("Finishing up...");
  
  const res = await fetch("/api/services/alyzitron/r2/multipart/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, key, parts: results, filename: file.name, fileSize: file.size, contentType: file.type }),
  });

  const data = await res.json();
  console.log(`[R2] Upload Success! Public URL: ${data.publicUrl}`);
  
  // Final 100% emit
  onProgress?.({
    loaded: file.size,
    total: file.size,
    progress: 1,
    speed: 0,
    remaining: 0,
    partsCompleted: totalParts,
    partsTotal: totalParts,
    message: "Upload Complete"
  });

  return data;
}

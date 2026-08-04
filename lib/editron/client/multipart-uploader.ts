/**
 * MultipartUploader
 *
 * Client-side chunked upload engine for large files via R2 S3 multipart.
 * Parts are sized dynamically from the file size (5 MiB – 5 GiB, capped at
 * 10,000 parts) so files up to R2's 5 TiB limit are supported. Uploads
 * concurrently (3 max), retries failed parts with exponential backoff.
 *
 * Durable resume: every completed part's ETag is recorded server-side, so a
 * browser refresh/tab-close picks the upload back up and only re-uploads the
 * missing parts (never the whole file).
 *
 * Supports: pause, resume, abort, progress callbacks, durable across reload.
 */

import type { UploadProgress, CompletedPart } from './upload-types';
import { resolveMultipartPlan, isValidPartSize } from '@/lib/editron/services/r2-upload-limits';

// ─── Config ──────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENCY = 3;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

// ─── Types ───────────────────────────────────────────────────────

export interface MultipartUploaderOptions {
  file: File;
  assetId: string;
  partSize?: number;
  maxConcurrency?: number;
  onProgress?: (progress: UploadProgress) => void;
  onPartComplete?: (part: CompletedPart) => void;
  onComplete?: (parts: CompletedPart[]) => void;
  onError?: (error: Error) => void;
}

interface PartTask {
  partNumber: number;
  start: number;
  end: number;
  retries: number;
}

type UploaderState = 'idle' | 'uploading' | 'paused' | 'completed' | 'aborted' | 'error';

// ─── Class ───────────────────────────────────────────────────────

export class MultipartUploader {
  private file: File;
  private assetId: string;
  private partSize: number;
  private maxConcurrency: number;
  private onProgress?: (progress: UploadProgress) => void;
  private onPartComplete?: (part: CompletedPart) => void;
  private onComplete?: (parts: CompletedPart[]) => void;
  private onError?: (error: Error) => void;

  private state: UploaderState = 'idle';
  private uploadId: string | null = null;
  private r2Key: string | null = null;
  private completedParts: CompletedPart[] = [];
  private pendingParts: PartTask[] = [];
  private activeParts = 0;
  private bytesUploaded = 0;
  private startTime = 0;
  private abortControllers: Map<number, AbortController> = new Map();
  private boundBeforeUnload: ((e: BeforeUnloadEvent) => void) | null = null;

  constructor(options: MultipartUploaderOptions) {
    this.file = options.file;
    this.assetId = options.assetId;
    // Dynamic part size by default (R2-aware). A caller-provided partSize is honored
    // only if it is within R2's legal [5 MiB, 5 GiB] range.
    this.partSize = (options.partSize && isValidPartSize(options.partSize))
      ? options.partSize
      : resolveMultipartPlan(options.file.size).partSize;
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.onProgress = options.onProgress;
    this.onPartComplete = options.onPartComplete;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  // ─── Public API ──────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state !== 'idle') return;

    this.state = 'uploading';
    this.startTime = Date.now();
    this.bytesUploaded = 0;
    this.completedParts = [];

    this.registerBeforeUnload();

    try {
      const plan = resolveMultipartPlan(this.file.size);

      // 0. Resume an interrupted upload for the same file (refresh / tab-close).
      const resumed = await this.tryResume(plan);

      if (!resumed) {
        // 1. Init multipart on server (persist partSize for a later resume).
        const initRes = await fetch('/api/services/editron/media/upload/multipart/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetId: this.assetId,
            filename: this.file.name,
            contentType: this.file.type,
            totalSize: this.file.size,
            totalParts: plan.totalParts,
            partSize: plan.partSize,
          }),
        });

        if (!initRes.ok) {
          const data = await initRes.json().catch(() => ({}));
          throw new Error(data.error || `Init failed (HTTP ${initRes.status})`);
        }

        const { uploadId, r2Key } = await initRes.json();
        this.uploadId = uploadId;
        this.r2Key = r2Key;
        this.partSize = plan.partSize;

        // 2. Reject 0-byte files — no parts to upload
        if (this.file.size === 0) {
          throw new Error('Cannot upload empty file (0 bytes)');
        }
      }

      // 3. Build part list, skipping parts already uploaded in a resumed session.
      const totalParts = this.partSize > 0 ? Math.ceil(this.file.size / this.partSize) : plan.totalParts;
      const donePartNumbers = new Set(this.completedParts.map((p) => p.PartNumber));
      this.pendingParts = [];
      for (let i = 0; i < totalParts; i++) {
        if (donePartNumbers.has(i + 1)) continue;
        this.pendingParts.push({
          partNumber: i + 1,
          start: i * this.partSize,
          end: Math.min((i + 1) * this.partSize, this.file.size),
          retries: 0,
        });
      }

      if (resumed) {
        // Seed progress from already-uploaded bytes so the bar doesn't restart at 0.
        this.bytesUploaded = Math.min(this.file.size, this.completedParts.length * this.partSize);
      }

      // 4. Start concurrent uploads
      this.drainQueue();
    } catch (err: any) {
      this.handleFatalError(err);
    }
  }

  pause(): void {
    if (this.state !== 'uploading') return;
    this.state = 'paused';
    // Cancel in-flight requests — parts will be re-queued on resume
    for (const [partNum, controller] of this.abortControllers) {
      controller.abort();
      // Re-add to pending for resume
      const existing = this.pendingParts.find(p => p.partNumber === partNum);
      if (!existing) {
        const start = (partNum - 1) * this.partSize;
        this.pendingParts.unshift({
          partNumber: partNum,
          start,
          end: Math.min(start + this.partSize, this.file.size),
          retries: 0,
        });
      }
    }
    this.abortControllers.clear();
    this.activeParts = 0;
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'uploading';
    this.drainQueue();
  }

  async abort(): Promise<void> {
    this.state = 'aborted';
    // Cancel in-flight
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.unregisterBeforeUnload();

    // Tell server to abort the multipart upload
    if (this.uploadId && this.r2Key) {
      try {
        await fetch('/api/services/editron/media/upload/multipart/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetId: this.assetId,
            uploadId: this.uploadId,
            r2Key: this.r2Key,
            abort: true,
          }),
        });
      } catch (err: unknown) { console.warn('[Uploader] abort cleanup failed — cron will clean up stale uploads:', err instanceof Error ? err.message : err); }
    }
  }

  getUploadId(): string | null { return this.uploadId; }
  getR2Key(): string | null { return this.r2Key; }
  getCompletedParts(): CompletedPart[] { return [...this.completedParts]; }
  getState(): UploaderState { return this.state; }

  // ─── Resume ────────────────────────────────────────────────────

  /**
   * Look up an in-progress upload for this asset. When one exists for the same
   * file (same total size + same resolved part size), reuse it: adopt the
   * server-persisted part ETags so only missing parts are re-uploaded.
   */
  private async tryResume(plan: { partSize: number }): Promise<boolean> {
    try {
      const res = await fetch(
        `/api/services/editron/media/upload/multipart/status?assetId=${encodeURIComponent(this.assetId)}`,
      );
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || data.status !== 'in-progress') return false;
      if (!data.uploadId || !data.r2Key) return false;
      if (Number(data.partSize) !== plan.partSize) return false;
      if (Number(data.totalSize) !== this.file.size) return false;

      const serverParts = Array.isArray(data.completedParts) ? data.completedParts : [];
      const valid: CompletedPart[] = serverParts
        .filter((p: { PartNumber?: unknown; ETag?: unknown }) => (
          p && typeof p === 'object'
          && Number.isInteger(p?.PartNumber)
          && typeof p?.ETag === 'string'
          && (p?.ETag as string).length > 0
        ))
        .map((p: { PartNumber: number; ETag: string }) => ({ PartNumber: p.PartNumber, ETag: p.ETag }));

      this.uploadId = data.uploadId;
      this.r2Key = data.r2Key;
      this.partSize = plan.partSize;
      this.completedParts = valid;
      return true;
    } catch (err) {
      console.warn(
        '[Uploader] Resume lookup failed, starting fresh:',
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }

  /**
   * Persist a completed part's ETag server-side so a later refresh/tab-close can
   * resume without re-uploading this part. Best-effort: a failed record only
   * means this part may be re-uploaded on a future resume (bytes stay on R2).
   */
  private async recordPart(partNumber: number, etag: string): Promise<void> {
    if (!this.uploadId || !this.r2Key) return;
    try {
      const res = await fetch('/api/services/editron/media/upload/multipart/part', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: this.assetId,
          uploadId: this.uploadId,
          r2Key: this.r2Key,
          partNumber,
          etag,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Part record failed (HTTP ${res.status})`);
      }
    } catch (err) {
      console.warn(
        '[Uploader] Failed to persist part ETag server-side (resume may re-upload this part):',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ─── Internal ────────────────────────────────────────────────

  private drainQueue(): void {
    while (
      this.state === 'uploading' &&
      this.activeParts < this.maxConcurrency &&
      this.pendingParts.length > 0
    ) {
      const task = this.pendingParts.shift()!;
      this.activeParts++;
      this.uploadPart(task);
    }
  }

  private async uploadPart(task: PartTask): Promise<void> {
    try {
      if (this.state !== 'uploading') {
        this.activeParts--;
        return;
      }

      // Get presigned URL for this part
      const urlRes = await fetch('/api/services/editron/media/upload/multipart/part-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: this.assetId,
          uploadId: this.uploadId,
          r2Key: this.r2Key,
          partNumber: task.partNumber,
        }),
      });

      if (!urlRes.ok) {
        throw new Error(`Failed to get part URL (HTTP ${urlRes.status})`);
      }

      const { url } = await urlRes.json();

      // Upload the chunk
      const chunk = this.file.slice(task.start, task.end);
      const controller = new AbortController();
      this.abortControllers.set(task.partNumber, controller);

      const putRes = await fetch(url, {
        method: 'PUT',
        body: chunk,
        signal: controller.signal,
      });

      this.abortControllers.delete(task.partNumber);

      if (!putRes.ok) {
        throw new Error(`Part ${task.partNumber} upload failed (HTTP ${putRes.status})`);
      }

      // REQUIRES: R2 CORS must include ExposeHeaders: ['ETag']
      // Without it, browser hides the ETag and CompleteMultipartUpload will fail.
      const etag = putRes.headers.get('ETag');
      if (!etag) {
        throw new Error(
          `Part ${task.partNumber}: ETag missing from R2 response. ` +
          'Configure R2 CORS: ExposeHeaders must include "ETag".'
        );
      }

      // Record completed part — deduplicate in case a retry races with the original
      const part: CompletedPart = { ETag: etag, PartNumber: task.partNumber };
      const alreadyDone = this.completedParts.some(p => p.PartNumber === task.partNumber);
      if (alreadyDone) {
        this.activeParts--;
        this.drainQueue();
        return;
      }
      this.completedParts.push(part);
      this.bytesUploaded += (task.end - task.start);
      this.onPartComplete?.(part);
      this.emitProgress();

      // Persist the ETag server-side for durable resume (best-effort).
      await this.recordPart(task.partNumber, etag);

      this.activeParts--;

      // Check if all done
      const totalParts = Math.ceil(this.file.size / this.partSize);
      if (this.completedParts.length === totalParts) {
        await this.finalize();
      } else {
        this.drainQueue();
      }
    } catch (err: any) {
      this.abortControllers.delete(task.partNumber);
      this.activeParts--;

      if (this.state === 'aborted' || this.state === 'paused') return;
      if (err.name === 'AbortError') return;

      // Retry with exponential backoff
      if (task.retries < MAX_RETRIES) {
        task.retries++;
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, task.retries - 1);
        console.warn(`[Uploader] Part ${task.partNumber} failed, retry ${task.retries}/${MAX_RETRIES} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        if (this.state === 'uploading') {
          this.pendingParts.unshift(task);
          this.drainQueue();
        }
      } else {
        this.handleFatalError(new Error(`Part ${task.partNumber} failed after ${MAX_RETRIES} retries: ${err.message}`));
      }
    }
  }

  private async finalize(): Promise<void> {
    try {
      const res = await fetch('/api/services/editron/media/upload/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: this.assetId,
          uploadId: this.uploadId,
          r2Key: this.r2Key,
          parts: this.completedParts.sort((a, b) => a.PartNumber - b.PartNumber),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Complete failed (HTTP ${res.status})`);
      }

      this.state = 'completed';
      this.unregisterBeforeUnload();
      this.onComplete?.(this.completedParts);
    } catch (err: any) {
      this.handleFatalError(err);
    }
  }

  private emitProgress(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const bytesPerSecond = elapsed > 0 ? this.bytesUploaded / elapsed : 0;
    const remaining = this.file.size - this.bytesUploaded;
    const estimatedSecondsRemaining = bytesPerSecond > 0 ? remaining / bytesPerSecond : 0;

    this.onProgress?.({
      loaded: this.bytesUploaded,
      total: this.file.size,
      percent: Math.round((this.bytesUploaded / this.file.size) * 100),
      bytesPerSecond,
      estimatedSecondsRemaining,
    });
  }

  private handleFatalError(err: Error): void {
    this.state = 'error';
    this.unregisterBeforeUnload();
    console.error('[Uploader] Fatal error:', err.message);
    this.onError?.(err);
  }

  private registerBeforeUnload(): void {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    this.boundBeforeUnload = (e: BeforeUnloadEvent) => {
      if (this.state === 'uploading' || this.state === 'paused') {
        e.preventDefault();
        // Intentionally NOT aborting on unload: the R2 multipart upload and its
        // server-persisted part ETags stay in-progress, so the next session (or a
        // refresh of this tab) resumes by uploading only the missing parts. R2's
        // 7-day incomplete-upload lifecycle cleans up uploads that never resume.
      }
    };
    window.addEventListener('beforeunload', this.boundBeforeUnload);
  }

  private unregisterBeforeUnload(): void {
    if (this.boundBeforeUnload && typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.boundBeforeUnload = null;
    }
  }
}

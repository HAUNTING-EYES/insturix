'use client';

/**
 * useFootageAutoEdit — inline footage → auto-edit for the New Project flow.
 *
 * A faithful extraction of ProjectDashboard's proven `handleAutoEdit` (compress → presign → PUT →
 * register → auto-edit → background full-quality upload → poll status → open the project), minus the
 * AutoEditDialog options step and the detailed upload reducer. It runs with default auto-edit options
 * and exposes a single progress string, which is all the console-style flow needs.
 *
 * ProjectDashboard keeps its own copy for now (the /dashboard/editron/upload fallback); this can be
 * DRY'd later by pointing that path at this hook too.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/editron/use-toast';
import { getUserFriendlyErrorMessage } from '@/lib/editron/utils/error-handling';
import { shouldCompress, compressToProxy, getVideoDuration } from '@/lib/editron/client/video-compressor';
import { MultipartUploader } from '@/lib/editron/client/multipart-uploader';
import { getActiveBrandIdFromStorage } from '@/components/dashboard/ActiveBrand/ActiveBrandProvider';

export interface FootageAutoEditState {
  running: boolean;
  progress: string;
  error: string | null;
  start: (file: File) => void;
}

const POLL_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued for processing…',
  analyzing: 'AI is analyzing your video…',
  transcribing: 'Transcribing speech…',
  cleaning: 'Removing silence and fillers…',
  computing_params: 'Computing editing parameters…',
  analyzing_deep: 'Deep visual + audio analysis…',
  analysis_complete: 'Analysis complete, preparing edit…',
  directing_queued: 'Queued for editing…',
  directing: 'Applying edits, transitions, captions…',
  editing: 'Applying edits, transitions, captions…',
  needs_review: 'Edit complete, review needed…',
};

export function useFootageAutoEdit(): FootageAutoEditState {
  const router = useRouter();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (file: File) => {
    setRunning(true);
    setError(null);
    try {
      const wantsProxy = shouldCompress(file);
      let uploadFile = file;
      let useProxy = false;
      let videoDuration = 0;

      if (wantsProxy) {
        setProgress('Analyzing video…');
        const result = await compressToProxy(file, () => {});
        videoDuration = result.durationSeconds;
        if (result.compressed) {
          uploadFile = result.file;
          useProxy = true;
        }
      } else {
        videoDuration = await getVideoDuration(file);
      }

      setProgress(`Uploading ${useProxy ? 'preview' : file.name} (${Math.round(uploadFile.size / 1024 / 1024)}MB)…`);
      const urlRes = await fetch('/api/services/editron/media/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadFile.name, contentType: uploadFile.type }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({ error: 'Failed to get upload URL' }));
        throw new Error(err.error || 'Failed to get upload URL');
      }
      const { uploadUrl, assetId, readUrl } = await urlRes.json();

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadFile.type },
        body: uploadFile,
      });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

      setProgress('Registering asset…');
      const mediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
      const regRes = await fetch('/api/services/editron/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId, gcsPath: null, readUrl,
          readUrlExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          filename: file.name, contentType: file.type, size: file.size, type: mediaType,
          ...(useProxy && { isProxy: true }),
          ...(videoDuration > 0 && { duration: String(videoDuration) }),
        }),
      });
      if (!regRes.ok) {
        const err = await regRes.json().catch(() => ({ error: 'Registration failed' }));
        throw new Error(err.error || 'Asset registration failed');
      }

      setProgress('AI is analyzing and editing your video…');
      const editRes = await fetch('/api/services/editron/auto-edit/from-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId,
          title: file.name.replace(/\.[^.]+$/, ''),
          brandId: getActiveBrandIdFromStorage(),
        }),
      });
      if (!editRes.ok) {
        const err = await editRes.json();
        throw new Error(err.error || 'Auto-edit failed');
      }
      const { projectId } = await editRes.json();

      // Background full-quality upload if we uploaded a proxy (fire-and-forget; cron auto-heals on failure).
      if (useProxy) {
        const uploader = new MultipartUploader({
          file,
          assetId,
          onProgress: () => {},
          onPartComplete: () => {},
          onComplete: async () => {
            const r2Key = uploader.getR2Key();
            try {
              const swapRes = await fetch('/api/services/editron/media/upload/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  assetId,
                  originalUrl: `${window.location.origin}/api/services/editron/assets/url/${r2Key || assetId}`,
                  originalR2Key: r2Key,
                }),
              });
              if (swapRes.ok) toast({ title: 'Full quality ready', description: 'Original video uploaded successfully.' });
            } catch {
              console.warn('[NewProjectFlow] Swap failed — cron will auto-heal');
            }
          },
          onError: (err) => console.error('[NewProjectFlow] Background upload failed:', err),
        });
        uploader.start();
      }

      setProgress('AI is analyzing your video…');
      const maxPolls = 60;
      for (let i = 0; i < maxPolls; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const statusRes = await fetch(`/api/services/editron/projects/${projectId}`);
          if (statusRes.ok) {
            const proj = await statusRes.json();
            const status = proj.project?.autoEditStatus || proj.autoEditStatus;
            if (status === 'complete') {
              toast({ title: 'Video edited!', description: 'Opening in editor…' });
              router.push(`/dashboard/editron/project/${projectId}`);
              return;
            }
            if (status === 'needs_review') {
              toast({ title: 'Edit needs review', description: proj.project?.autoEditWarning || proj.autoEditWarning || 'AI edit completed, but the quality check needs review.' });
              router.push(`/dashboard/editron/project/${projectId}`);
              return;
            }
            if (status === 'failed') throw new Error(proj.project?.autoEditError || 'AI editing failed');
            setProgress(POLL_STATUS_LABELS[status] || `Processing (${status})…`);
          }
        } catch (pollErr) {
          if ((pollErr as Error).message?.includes('failed')) throw pollErr;
        }
      }
      toast({ title: 'Processing taking longer than expected', description: 'Opening project — editing may still be in progress.' });
      router.push(`/dashboard/editron/project/${projectId}`);
    } catch (e) {
      const msg = getUserFriendlyErrorMessage(e);
      setError(msg);
      setRunning(false);
      setProgress('');
      toast({ variant: 'destructive', title: 'Auto-edit failed', description: msg });
    }
  }, [router, toast]);

  const start = useCallback((file: File) => { void run(file); }, [run]);

  return { running, progress, error, start };
}

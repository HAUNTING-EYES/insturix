'use client';

import { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useGSAP } from '@gsap/react';
import { gsap } from '@/lib/animation/gsap-config';
import { DURATIONS, STAGGER } from '@/lib/animation/presets';
import { formatDistanceToNow } from 'date-fns';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/editron/use-toast';
import { getUserFriendlyErrorMessage } from '@/lib/editron/utils/error-handling';
import { AutoEditDialog, type AutoEditOptions } from '@/components/editron/project/auto-edit-dialog';
import { buildAutoEditFromAssetPayload } from '@/components/editron/project/auto-edit-request';
import { UploadProgressBar } from '@/components/editron/project/upload-progress-bar';
import { uploadReducer, INITIAL_UPLOAD_STATE } from '@/lib/editron/client/upload-types';
import { shouldCompress, compressToProxy, getVideoDuration } from '@/lib/editron/client/video-compressor';
import { MultipartUploader } from '@/lib/editron/client/multipart-uploader';
import { getActiveBrandIdFromStorage } from '@/components/dashboard/ActiveBrand/ActiveBrandProvider';

interface Project {
  projectId: string;
  name: string;
  thumbnail?: string;
  updatedAt: string;
  durationInFrames: number;
  aspectRatio: string;
}

/* ── Stage detection from autoEditProgress string ── */
function getStageFromProgress(progress: string): number {
  if (!progress) return -1;
  const p = progress.toLowerCase();
  if (p.includes('upload') || p.includes('analyzing video')) return 0;
  if (p.includes('register')) return 1;
  if (p.includes('transcrib')) return 2;
  if (p.includes('clean') || p.includes('silence')) return 3;
  if (p.includes('review')) return 5;
  if (p.includes('edit') || p.includes('transition') || p.includes('caption')) return 4;
  if (p.includes('complete') || p.includes('opening')) return 5;
  return 0;
}

/* ── Oscilloscope constants ── */
const STAGE_COLORS: [number, number, number][] = [
  [224, 82, 82],    // 0 UPLOAD:      red
  [212, 118, 78],   // 1 REGISTER:    red-orange
  [212, 166, 82],   // 2 TRANSCRIBE:  gold
  [196, 180, 78],   // 3 CLEAN:       yellow-gold
  [142, 203, 94],   // 4 EDIT:        lime
  [94, 201, 126],   // 5 COMPLETE:    green
];
const IDLE_COLOR: [number, number, number] = [69, 67, 64];

const STAGE_AMPS = [
  [16, 9, 6, 3.5, 2],
  [14, 7, 4, 2, 0.8],
  [11, 5, 2.5, 0.8, 0],
  [8, 3, 1, 0, 0],
  [5, 1.5, 0, 0, 0],
  [3, 0.5, 0, 0, 0],
];
const IDLE_AMPS = [0.7, 0.2, 0, 0, 0];

const STAGE_SPEEDS = [3.2, 2.7, 2.1, 1.5, 1.0, 0.6];
const IDLE_SPEED = 0.25;

const H_FREQ = [2.0, 3.17, 5.43, 8.71, 13.29];
const H_PHASE_MULT = [1.0, 1.31, 0.73, 1.67, 2.09];
const N_PTS = 280;

function oscLerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export default function ProjectDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();

  // ── Existing state (PRESERVED) ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [autoEditing, setAutoEditing] = useState(false);
  const [autoEditProgress, setAutoEditProgress] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadState, dispatchUpload] = useReducer(uploadReducer, INITIAL_UPLOAD_STATE);

  // ── New state ──
  const [dragOver, setDragOver] = useState(false);

  // ── Refs ──
  const oscCanvasRef = useRef<HTMLCanvasElement>(null);
  const tcRef = useRef<HTMLSpanElement>(null);
  const vuAIRef = useRef<HTMLDivElement>(null);
  const vuGPURef = useRef<HTMLDivElement>(null);
  const oscLabelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // ── GSAP entrance (Phase 2: replaces CSS @keyframes efStaggerIn) ──
  // OLD: CSS animation with manual animationDelay per element
  // NEW: GSAP fromTo with shared presets, auto-cleanup via useGSAP
  // IMPORTANT: uses fromTo (not from) because CSS sets opacity:0 — from() would animate 0→0
  useGSAP(() => {
    gsap.fromTo('.ef-stagger',
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: DURATIONS.atmosphere, ease: 'expo.out', stagger: { each: STAGGER.wide.each, from: 'start' } }
    );
  }, { scope: pageRef });

  // ── Load projects (PRESERVED) ──
  useEffect(() => {
    if (user) {
      loadProjects();
    }
  }, [user]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/services/editron/projects/list');

      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      } else {
        console.error('Failed to load projects');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: getUserFriendlyErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter a project name',
      });
      return;
    }

    try {
      setCreating(true);
      const response = await fetch('/api/services/editron/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newProjectName,
          brandId: getActiveBrandIdFromStorage(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: 'Project created successfully',
        });

        // Navigate to the new project
        router.push(`/dashboard/editron/project/${data.projectId}`);
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create project');
      }
    } catch (error: any) {
      console.error('Error creating project:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: getUserFriendlyErrorMessage(error),
      });
    } finally {
      setCreating(false);
    }
  };

  // Dialog callback: user confirmed file + options -> run the upload + auto-edit flow
  const handleAutoEditConfirm = useCallback((file: File, options: AutoEditOptions) => {
    setPendingFile(null);
    handleAutoEdit(file, options);
  }, []);

  const handleAutoEdit = async (file: File, options: AutoEditOptions = {}) => {
    try {
      setAutoEditing(true);
      dispatchUpload({ type: 'RESET' });

      const wantsProxy = shouldCompress(file);
      let uploadFile = file;
      let useProxy = false;
      let videoDuration = 0;

      // Step 1: Compress to proxy if large file
      if (wantsProxy) {
        setAutoEditProgress('Analyzing video...');
        dispatchUpload({ type: 'START_COMPRESS' });
        const result = await compressToProxy(file, (ratio) => {
          dispatchUpload({
            type: 'PROXY_PROGRESS',
            progress: { loaded: ratio * file.size, total: file.size, percent: Math.round(ratio * 100), bytesPerSecond: 0, estimatedSecondsRemaining: 0 },
          });
        });
        videoDuration = result.durationSeconds;
        if (result.compressed) {
          uploadFile = result.file;
          useProxy = true;
          dispatchUpload({ type: 'COMPRESS_DONE' });
        } else {
          // Compression failed or skipped (video too long for client-side) — upload original directly
          dispatchUpload({ type: 'COMPRESS_DONE' });
        }
      } else {
        videoDuration = await getVideoDuration(file);
      }

      // Step 2: Upload proxy (or original if small) via presigned URL
      setAutoEditProgress(`Uploading ${useProxy ? 'preview' : file.name} (${Math.round(uploadFile.size / 1024 / 1024)}MB)...`);
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
      if (!putRes.ok) {
        throw new Error(`Upload failed: ${putRes.status}`);
      }

      // Step 3: Register asset
      setAutoEditProgress('Registering asset...');
      const mediaType = file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'audio' : 'image';
      const regRes = await fetch('/api/services/editron/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId, gcsPath: null, readUrl,
          readUrlExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          filename: file.name, contentType: file.type, size: file.size, type: mediaType,
          sourceMediaRightsAttestation: options.sourceMediaRightsAttestation,
          ...(useProxy && { isProxy: true }),
          ...(videoDuration > 0 && { duration: String(videoDuration) }),
        }),
      });
      if (!regRes.ok) {
        const err = await regRes.json().catch(() => ({ error: 'Registration failed' }));
        throw new Error(err.error || 'Asset registration failed');
      }

      // Step 4: Trigger auto-edit
      setAutoEditProgress('AI is analyzing and editing your video...');
      const editRes = await fetch('/api/services/editron/auto-edit/from-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAutoEditFromAssetPayload({
          assetId,
          title: file.name.replace(/\.[^.]+$/, ''),
          brandId: getActiveBrandIdFromStorage(),
          options,
        })),
      });
      if (!editRes.ok) {
        const err = await editRes.json();
        throw new Error(err.error || 'Auto-edit failed');
      }

      const { projectId } = await editRes.json();

      // Step 5: Start background original upload if using proxy
      if (useProxy) {
        dispatchUpload({ type: 'START_ORIGINAL_UPLOAD', uploadId: '', r2Key: '', assetId });
        const uploader = new MultipartUploader({
          file,
          assetId,
          onProgress: (progress) => dispatchUpload({ type: 'ORIGINAL_PROGRESS', progress }),
          onPartComplete: (part) => dispatchUpload({ type: 'PART_COMPLETED', part }),
          onComplete: async () => {
            dispatchUpload({ type: 'ORIGINAL_DONE' });
            // Swap proxy -> original
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
              if (swapRes.ok) {
                dispatchUpload({ type: 'SWAP_DONE' });
                toast({ title: 'Full quality ready', description: 'Original video uploaded successfully.' });
              }
            } catch {
              console.warn('[Dashboard] Swap failed — cron will auto-heal');
            }
          },
          onError: (err) => {
            dispatchUpload({ type: 'ERROR', error: err.message });
            console.error('[Dashboard] Background upload failed:', err);
          },
        });
        uploader.start();
      }

      // Step 6: Poll autoEditStatus until complete
      setAutoEditProgress('AI is analyzing your video...');
      const maxPolls = 60;
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const statusRes = await fetch(`/api/services/editron/projects/${projectId}`);
          if (statusRes.ok) {
            const proj = await statusRes.json();
            const status = proj.project?.autoEditStatus || proj.autoEditStatus;
            if (status === 'complete') {
              toast({ title: 'Video edited!', description: 'Opening in editor...' });
              router.push(`/dashboard/editron/project/${projectId}`);
              return;
            }
            if (status === 'needs_review') {
              const warning = proj.project?.autoEditWarning || proj.autoEditWarning || 'AI edit completed, but the quality check needs review.';
              toast({ title: 'Edit needs review', description: warning });
              router.push(`/dashboard/editron/project/${projectId}`);
              return;
            }
            if (status === 'failed') {
              throw new Error(proj.project?.autoEditError || 'AI editing failed');
            }
            const progressMap: Record<string, string> = {
              queued: 'Queued for processing...',
              analyzing: 'AI is analyzing your video...',
              transcribing: 'Transcribing speech...',
              cleaning: 'Removing silence and fillers...',
              computing_params: 'Computing editing parameters...',
              analyzing_deep: 'Deep visual + audio analysis...',
              analysis_complete: 'Analysis complete, preparing edit...',
              directing_queued: 'Queued for editing...',
              directing: 'Applying edits, transitions, captions...',
              editing: 'Applying edits, transitions, captions...',
              needs_review: 'Edit complete, review needed...',
            };
            setAutoEditProgress(progressMap[status] || `Processing (${status})...`);
          }
        } catch (pollErr) {
          if ((pollErr as Error).message?.includes('failed')) throw pollErr;
        }
      }
      toast({ title: 'Processing taking longer than expected', description: 'Opening project — editing may still be in progress.' });
      router.push(`/dashboard/editron/project/${projectId}`);
    } catch (error) {
      console.error('Auto-edit error:', error);
      dispatchUpload({ type: 'ERROR', error: getUserFriendlyErrorMessage(error) });
      toast({
        variant: 'destructive',
        title: 'Auto-edit failed',
        description: getUserFriendlyErrorMessage(error),
      });
    } finally {
      setAutoEditing(false);
      setAutoEditProgress('');
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      const response = await fetch(`/api/services/editron/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Project deleted successfully',
        });
        loadProjects(); // Reload the list
      } else {
        throw new Error('Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: getUserFriendlyErrorMessage(error),
      });
    } finally {
      setDeleteProjectId(null);
    }
  };

  const openProject = (projectId: string) => {
    router.push(`/dashboard/editron/project/${projectId}`);
  };

  // ── Timecode effect ──
  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const f = frame % 30;
      const s = Math.floor(frame / 30) % 60;
      const m = Math.floor(frame / 1800) % 60;
      const h = Math.floor(frame / 108000);
      if (tcRef.current) {
        tcRef.current.textContent = `TC ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
      }
    }, 33);
    return () => clearInterval(interval);
  }, []);

  // ── VU Meter animation ──
  useEffect(() => {
    const interval = setInterval(() => {
      const aiBase = autoEditing ? 55 + Math.random() * 25 : 15 + Math.random() * 5;
      const gpuBase = autoEditing ? 35 + Math.random() * 20 : 12 + Math.random() * 5;
      if (vuAIRef.current) vuAIRef.current.style.height = `${aiBase}%`;
      if (vuGPURef.current) vuGPURef.current.style.height = `${gpuBase}%`;
    }, 800);
    return () => clearInterval(interval);
  }, [autoEditing]);

  // ── Oscilloscope canvas effect ──
  useEffect(() => {
    const canvas = oscCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    let currentSpeed = IDLE_SPEED;
    let targetSpeed = IDLE_SPEED;
    const hAmps = [...IDLE_AMPS];
    const hTargets = [...IDLE_AMPS];
    let curR = IDLE_COLOR[0], curG = IDLE_COLOR[1], curB = IDLE_COLOR[2];
    let tarR = IDLE_COLOR[0], tarG = IDLE_COLOR[1], tarB = IDLE_COLOR[2];
    let curAlpha = 0.35, tarAlpha = 0.35;
    let curGlow = 0, tarGlow = 0;
    let lastFrame = performance.now();
    let animId: number;

    function resizeCanvas() {
      const rect = canvas!.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(56 * dpr);
      canvas!.style.width = rect.width + 'px';
      canvas!.style.height = '56px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function render() {
      const now = performance.now();
      let dt = (now - lastFrame) / 1000;
      if (dt > 0.1) dt = 0.016;
      lastFrame = now;

      // Determine stage from current autoEditProgress
      const stageIdx = getStageFromProgress(
        (oscLabelRef.current?.dataset.progress) || ''
      );

      // Update targets
      if (stageIdx < 0) {
        for (let h = 0; h < 5; h++) hTargets[h] = IDLE_AMPS[h];
        targetSpeed = IDLE_SPEED;
        tarR = IDLE_COLOR[0]; tarG = IDLE_COLOR[1]; tarB = IDLE_COLOR[2];
        tarAlpha = 0.35;
        tarGlow = 0;
      } else {
        for (let h = 0; h < 5; h++) hTargets[h] = STAGE_AMPS[stageIdx][h];
        targetSpeed = STAGE_SPEEDS[stageIdx];
        const c = STAGE_COLORS[stageIdx];
        tarR = c[0]; tarG = c[1]; tarB = c[2];
        tarAlpha = 0.95;
        tarGlow = 0.3;
      }

      // Advance phase
      currentSpeed = oscLerp(currentSpeed, targetSpeed, 0.025);
      phase += currentSpeed * dt;

      // Lerp amplitudes
      for (let h = 0; h < 5; h++) {
        hAmps[h] = oscLerp(hAmps[h], hTargets[h], 0.035);
      }

      // Lerp color
      curR = oscLerp(curR, tarR, 0.06);
      curG = oscLerp(curG, tarG, 0.06);
      curB = oscLerp(curB, tarB, 0.06);
      curAlpha = oscLerp(curAlpha, tarAlpha, 0.06);
      curGlow = oscLerp(curGlow, tarGlow, 0.06);

      const W = parseFloat(canvas!.style.width) || canvas!.parentElement!.getBoundingClientRect().width;
      const H = 56;
      const cY = H / 2;

      // Build waveform
      const coords: { x: number; y: number }[] = [];
      const TWO_PI = Math.PI * 2;

      for (let i = 0; i < N_PTS; i++) {
        const nx = i / (N_PTS - 1);
        let y = 0;
        for (let h = 0; h < 5; h++) {
          if (hAmps[h] < 0.01) continue;
          y += hAmps[h] * Math.sin(TWO_PI * nx * H_FREQ[h] + phase * H_PHASE_MULT[h]);
        }
        coords.push({ x: nx * W, y: cY - y });
      }

      // Clear
      ctx!.clearRect(0, 0, W, H);

      // Baseline
      ctx!.beginPath();
      ctx!.strokeStyle = 'rgba(69,67,64,0.04)';
      ctx!.lineWidth = 1;
      ctx!.moveTo(0, cY);
      ctx!.lineTo(W, cY);
      ctx!.stroke();

      // Draw wave
      const r = Math.round(curR);
      const g = Math.round(curG);
      const b = Math.round(curB);
      const col = `rgba(${r},${g},${b},${curAlpha.toFixed(3)})`;

      if (curGlow > 0.01) {
        ctx!.shadowColor = `rgba(${r},${g},${b},${curGlow.toFixed(3)})`;
        ctx!.shadowBlur = 12;
      } else {
        ctx!.shadowColor = 'transparent';
        ctx!.shadowBlur = 0;
      }

      ctx!.strokeStyle = col;
      ctx!.lineWidth = 1.8;
      ctx!.lineCap = 'round';
      ctx!.lineJoin = 'round';
      ctx!.beginPath();
      ctx!.moveTo(coords[0].x, coords[0].y);

      for (let i = 0; i < N_PTS - 1; i++) {
        const xm = (coords[i].x + coords[i + 1].x) * 0.5;
        const ym = (coords[i].y + coords[i + 1].y) * 0.5;
        ctx!.quadraticCurveTo(coords[i].x, coords[i].y, xm, ym);
      }
      ctx!.lineTo(coords[N_PTS - 1].x, coords[N_PTS - 1].y);
      ctx!.stroke();

      ctx!.shadowColor = 'transparent';
      ctx!.shadowBlur = 0;

      animId = requestAnimationFrame(render);
    }

    const startTimer = setTimeout(() => { render(); }, 200);

    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // ── Update oscilloscope label data-attribute when progress changes ──
  useEffect(() => {
    if (oscLabelRef.current) {
      oscLabelRef.current.dataset.progress = autoEditProgress;
    }
  }, [autoEditProgress]);

  // ── Oscilloscope stage label text + color ──
  const stageIdx = getStageFromProgress(autoEditProgress);
  const STAGE_LABELS = ['Uploading...', 'Registering...', 'Transcribing...', 'Cleaning...', 'Editing...', 'Delivering...'];
  const oscLabelText = autoEditing
    ? (stageIdx >= 0 ? STAGE_LABELS[stageIdx] : autoEditProgress || 'Processing...')
    : 'Ready';
  const oscLabelColor = autoEditing && stageIdx >= 0
    ? `rgb(${STAGE_COLORS[stageIdx][0]},${STAGE_COLORS[stageIdx][1]},${STAGE_COLORS[stageIdx][2]})`
    : 'var(--ef-faint)';

  // ── Format duration from frames ──
  function formatDuration(frames: number): string {
    const totalSec = Math.floor(frames / 30);
    if (totalSec < 60) return `${totalSec}s`;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
  }

  // ── Background oscilloscope SVG path ──
  const bgOscPath = (() => {
    let d = 'M0,150';
    for (let x = 1; x <= 3840; x += 4) {
      const y = 150 + Math.sin(x * 0.003) * 75 + Math.sin(x * 0.007) * 35;
      d += ` L${x},${y.toFixed(1)}`;
    }
    return d;
  })();

  return (
    <div ref={pageRef} style={{ minHeight: '100vh', background: 'var(--ef-bg)', color: 'var(--ef-text)', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", overflowX: 'hidden', position: 'relative' }}>
      <style>{`
        /* ── TOKENS ── */
        :root {
          --ef-bg: #0B0B0A;
          --ef-surface: #0F0F0E;
          --ef-raised: #131312;
          --ef-well: #1B1A18;
          --ef-border: #1C1B19;
          --ef-borderL: #282724;
          --ef-text: #ECE9E1;
          --ef-soft: #B5B2A8;
          --ef-muted: #7A776E;
          --ef-dim: #5F5E5A;
          --ef-faint: #454340;
          --ef-gold: #D4A652;
          --ef-goldDark: #C49840;
          --ef-goldGlow: rgba(212,166,82,0.12);
          --ef-green: #5EC97E;
          --ef-mono: 'JetBrains Mono', 'SF Mono', monospace;
          --ef-sans: 'Plus Jakarta Sans', system-ui, sans-serif;
          --ef-ease: cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* ── STAGGER LOAD ── */
        /* OLD: CSS @keyframes efStaggerIn with per-element animationDelay */
        /* NEW: GSAP fromTo handles reveal. CSS only sets initial hidden state. */
        .ef-stagger { opacity: 0; }

        /* ── PULSE ── */
        @keyframes efPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

        /* ── BLINK ── */
        @keyframes efBlink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

        /* ── SCANLINE DRIFT ── */
        @keyframes efScanDrift { 0% { transform: translateY(0); } 100% { transform: translateY(62px); } }

        /* ── CRT POWER-ON ── */
        @keyframes efCrtOn {
          0% { transform: scaleX(0); height: 2px; top: 50%; opacity: 1; }
          60% { transform: scaleX(1); height: 2px; top: 50%; opacity: 1; }
          100% { transform: scaleX(1); height: 100%; top: 0; opacity: 0; }
        }

        /* ── SMPTE FADE IN ── */
        @keyframes efSmpteFadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }

        /* ── STATIC NOISE ── */
        @keyframes efStaticShift {
          0% { background-position: 0 0; }
          33% { background-position: -40px -20px; }
          66% { background-position: 20px -60px; }
          100% { background-position: -10px 30px; }
        }

        /* ── SCROLL UP (teleprompter) ── */
        @keyframes efScrollUp { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }

        /* ── BG OSC SCROLL ── */
        @keyframes efBgOscScroll {
          0% { transform: translateY(-50%) translateX(0); }
          100% { transform: translateY(-50%) translateX(-50%); }
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 1199px) {
          .ef-hero-row { flex-direction: column !important; align-items: center !important; }
          .ef-vu-meters { flex-direction: row !important; padding-top: 0 !important; order: -1; margin-bottom: 12px; gap: 12px !important; }
          .ef-vu-bar { height: 80px !important; width: 6px !important; }
          .ef-script-monitor { max-width: 100% !important; }
        }
        @media (max-width: 767px) {
          .ef-hero-row { gap: 20px !important; }
          .ef-hero-monitor { max-width: 100% !important; }
          .ef-monitor-screen { height: 280px !important; }
          .ef-script-screen { height: 180px !important; }
          .ef-floor { padding: 24px 16px 24px !important; }
        }
      `}</style>

      {/* ── BACKGROUND OSCILLOSCOPE ── */}
      <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <svg viewBox="0 0 3840 300" preserveAspectRatio="none" style={{ position: 'absolute', top: '50%', left: 0, transform: 'translateY(-50%)', width: '200%', height: 300, animation: 'efBgOscScroll 20s linear infinite' }}>
          <path d={bgOscPath} fill="none" stroke="var(--ef-faint)" strokeWidth={1.5} style={{ opacity: 0.03 }} />
        </svg>
      </div>

      {/* ── ROOM HEADER ── */}
      <header className="ef-stagger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 28px', background: 'var(--ef-surface)', borderBottom: '1px solid var(--ef-border)', position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: 'var(--ef-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ef-gold)' }}>Edit Floor</div>
        <span ref={tcRef} style={{ fontFamily: 'var(--ef-mono)', fontSize: 11, color: 'var(--ef-dim)' }}>TC 00:00:00:00</span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontFamily: 'var(--ef-mono)', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ef-dim)' }}>
          <span>Signal <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginLeft: 4, verticalAlign: 'middle', background: 'var(--ef-green)', animation: 'efPulse 2s ease-in-out infinite' }} /></span>
          <span>Rec <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginLeft: 4, verticalAlign: 'middle', background: '#E05252', animation: 'efPulse 2s ease-in-out infinite .3s' }} /></span>
        </div>
      </header>

      <main className="ef-floor" style={{ maxWidth: 1320, margin: '0 auto', padding: '40px 28px 32px', position: 'relative', zIndex: 1 }}>
        {/* ── HERO ROW ── */}
        <div className="ef-hero-row" style={{ display: 'flex', gap: 28, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>

          {/* ── VU METERS ── */}
          <div className="ef-stagger ef-vu-meters" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', paddingTop: 40 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ fontFamily: 'var(--ef-mono)', fontSize: 7, color: 'var(--ef-faint)', textTransform: 'uppercase' }}>AI</div>
                <div className="ef-vu-bar" style={{ width: 8, height: 120, borderRadius: 2, background: 'var(--ef-well)', position: 'relative', overflow: 'hidden' }}>
                  <div ref={vuAIRef} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 2, background: 'linear-gradient(to top, var(--ef-green) 0%, var(--ef-green) 60%, var(--ef-gold) 60%, var(--ef-gold) 80%, #E05252 80%, #E05252 100%)', height: '0%', transition: 'height .5s ease' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ fontFamily: 'var(--ef-mono)', fontSize: 7, color: 'var(--ef-faint)', textTransform: 'uppercase' }}>GPU</div>
                <div className="ef-vu-bar" style={{ width: 8, height: 120, borderRadius: 2, background: 'var(--ef-well)', position: 'relative', overflow: 'hidden' }}>
                  <div ref={vuGPURef} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 2, background: 'linear-gradient(to top, var(--ef-green) 0%, var(--ef-green) 60%, var(--ef-gold) 60%, var(--ef-gold) 80%, #E05252 80%, #E05252 100%)', height: '0%', transition: 'height .5s ease' }} />
                </div>
              </div>
            </div>
            <div style={{ fontFamily: 'var(--ef-mono)', fontSize: 7, color: 'var(--ef-faint)', textTransform: 'uppercase', marginTop: 6 }}>System</div>
          </div>

          {/* ── HERO MONITOR (upload zone) ── */}
          <div className="ef-stagger ef-hero-monitor" style={{ maxWidth: 780, width: '100%', flexShrink: 0 }}>
            <div style={{ border: '3px solid var(--ef-borderL)', borderRadius: 4, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.03), inset 0 -1px 0 rgba(0,0,0,.4), 0 0 60px rgba(212,166,82,.04)', overflow: 'hidden', background: '#000' }}>
              <div
                className="ef-monitor-screen"
                onClick={() => { if (!autoEditing) fileInputRef.current?.click(); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && !autoEditing) setPendingFile(file);
                }}
                style={{ position: 'relative', height: 400, cursor: autoEditing ? 'default' : 'pointer', overflow: 'hidden', userSelect: 'none', borderColor: dragOver ? 'var(--ef-green)' : undefined }}
              >
                {/* CRT Power-on line */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: '#fff', zIndex: 10, transform: 'scaleX(0)', animation: 'efCrtOn .6s var(--ef-ease) .2s forwards', pointerEvents: 'none' }} onAnimationEnd={(e) => { (e.target as HTMLDivElement).style.display = 'none'; }} />

                {/* SMPTE Color Bars */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', transition: 'opacity .4s var(--ef-ease)', opacity: dragOver ? 0 : 1, animation: 'efSmpteFadeIn .3s var(--ef-ease) .8s both' }}>
                  <div style={{ flex: 3, display: 'flex' }}>
                    <div style={{ flex: 1, background: '#C0C0C0' }} />
                    <div style={{ flex: 1, background: '#C0C000' }} />
                    <div style={{ flex: 1, background: '#00C0C0' }} />
                    <div style={{ flex: 1, background: '#00C000' }} />
                    <div style={{ flex: 1, background: '#C000C0' }} />
                    <div style={{ flex: 1, background: '#C00000' }} />
                    <div style={{ flex: 1, background: '#0000C0' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex' }}>
                    <div style={{ flex: 1, background: '#0000C0' }} />
                    <div style={{ flex: 1, background: '#131313' }} />
                    <div style={{ flex: 1, background: '#C000C0' }} />
                    <div style={{ flex: 1, background: '#131313' }} />
                    <div style={{ flex: 1, background: '#00C0C0' }} />
                    <div style={{ flex: 1, background: '#131313' }} />
                    <div style={{ flex: 1, background: '#C0C0C0' }} />
                  </div>
                </div>

                {/* Static noise (drag state) */}
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 1,
                  opacity: dragOver ? 1 : 0, transition: 'opacity .3s var(--ef-ease)',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.3'/%3E%3C/svg%3E")`,
                  backgroundSize: '200px 200px',
                  animation: 'efStaticShift .1s steps(3) infinite',
                }} />

                {/* Scanlines */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,.15) 2px, rgba(0,0,0,.15) 3px)', zIndex: 2 }} />

                {/* Scanline drift */}
                <div style={{ position: 'absolute', inset: '-4px 0', pointerEvents: 'none', zIndex: 3, background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 60px, rgba(255,255,255,.015) 60px, rgba(255,255,255,.015) 62px)', animation: 'efScanDrift 8s linear infinite' }} />

                {/* CRT curvature */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4, background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,.35) 100%)' }} />

                {/* NO SIGNAL / auto-editing text */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none', opacity: dragOver ? 0 : 1, transition: 'opacity .3s var(--ef-ease)' }}>
                  {autoEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, height: 20, border: '2px solid var(--ef-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'efSpin .8s linear infinite' }} />
                      <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 12, color: 'var(--ef-gold)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{autoEditProgress || 'Processing...'}</span>
                    </div>
                  ) : (
                    <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 12, color: 'rgba(255,255,255,.55)', letterSpacing: '.08em', textTransform: 'uppercase', animation: 'efBlink 1s steps(1) infinite' }}>No Signal</span>
                  )}
                </div>

                {/* Drag feedback */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, zIndex: 6, opacity: dragOver ? 1 : 0, transition: 'opacity .3s var(--ef-ease)', pointerEvents: 'none' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5EC97E" strokeWidth="1.5" strokeLinecap="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                  <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 13, color: 'var(--ef-green)', letterSpacing: '.06em', textTransform: 'uppercase' }}>Signal Detected</span>
                </div>

                {/* Green border glow on drag */}
                {dragOver && (
                  <div style={{ position: 'absolute', inset: -3, border: '2px solid var(--ef-green)', borderRadius: 4, zIndex: 8, boxShadow: '0 0 30px rgba(94,201,126,.25), inset 0 0 30px rgba(94,201,126,.08)', pointerEvents: 'none' }} />
                )}
              </div>

              {/* Status bar below screen */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 12px', background: 'var(--ef-surface)', borderTop: '1px solid var(--ef-border)' }}>
                <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, color: 'var(--ef-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>CH1</span>
                <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, color: 'var(--ef-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Drop Footage or Browse</span>
                <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, color: 'var(--ef-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>SDI-1</span>
              </div>
            </div>

            {/* Hero info below monitor */}
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <div style={{ fontSize: 13, color: 'var(--ef-soft)', fontWeight: 500, marginBottom: 6 }}>Edit My Video</div>
              <div style={{ display: 'inline-block', fontFamily: 'var(--ef-mono)', fontSize: 8, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ef-gold)', border: '1px solid var(--ef-gold)', borderRadius: 3, padding: '2px 7px', marginBottom: 6 }}>Mode 2</div>
              <div style={{ fontSize: 11, color: 'var(--ef-dim)' }}>AI edits your footage automatically</div>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPendingFile(file);
                e.target.value = '';
              }}
              disabled={autoEditing}
            />
          </div>

          {/* ── SCRIPT MONITOR ── */}
          <div className="ef-stagger ef-script-monitor" style={{ maxWidth: 340, width: '100%', flexShrink: 0 }}>
            <div style={{ border: '2px solid var(--ef-border)', borderRadius: 4, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.02), 0 0 40px rgba(181,178,168,.02)', overflow: 'hidden', background: '#000' }}>
              <div className="ef-script-screen" style={{ position: 'relative', height: 260, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '20px 16px', animation: 'efScrollUp 30s linear infinite' }}>
                  {['INT. STUDIO - DAY', ' ', 'A sleek product sits on a matte black', 'surface. Soft key light from the left.', ' ', 'NARRATOR (V.O.)', 'What if everything you knew about', 'editing was about to change?', ' ', 'CUT TO:', ' ', 'EXT. CITYSCAPE - GOLDEN HOUR', ' ', 'Drone shot. The city breathes below.', 'Traffic pulses like a heartbeat.', ' ', 'NARRATOR (V.O.)', 'Every frame tells a story. Every cut', 'is a decision. Let AI handle the craft', 'so you can focus on the art.', ' ', 'FADE TO BLACK.'].map((line, i) => (
                    <p key={`a${i}`} style={{ fontFamily: 'var(--ef-mono)', fontSize: 10, lineHeight: 1.8, color: i % 2 === 0 ? 'var(--ef-dim)' : 'var(--ef-faint)', marginBottom: 4 }}>{line}</p>
                  ))}
                  {/* Duplicate for seamless loop */}
                  {['INT. STUDIO - DAY', ' ', 'A sleek product sits on a matte black', 'surface. Soft key light from the left.', ' ', 'NARRATOR (V.O.)', 'What if everything you knew about', 'editing was about to change?', ' ', 'CUT TO:', ' ', 'EXT. CITYSCAPE - GOLDEN HOUR', ' ', 'Drone shot. The city breathes below.', 'Traffic pulses like a heartbeat.', ' ', 'NARRATOR (V.O.)', 'Every frame tells a story. Every cut', 'is a decision. Let AI handle the craft', 'so you can focus on the art.', ' ', 'FADE TO BLACK.'].map((line, i) => (
                    <p key={`b${i}`} style={{ fontFamily: 'var(--ef-mono)', fontSize: 10, lineHeight: 1.8, color: i % 2 === 0 ? 'var(--ef-dim)' : 'var(--ef-faint)', marginBottom: 4 }}>{line}</p>
                  ))}
                </div>
                {/* Scanlines */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,.12) 2px, rgba(0,0,0,.12) 3px)' }} />
                {/* CRT curve */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.4) 100%)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px', background: 'var(--ef-surface)', borderTop: '1px solid var(--ef-border)' }}>
                <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, color: 'var(--ef-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Script</span>
                <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, color: 'var(--ef-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Teleprompter</span>
                <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, color: 'var(--ef-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>CH2</span>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--ef-soft)', fontWeight: 500 }}>From Script</span>
                <span style={{ display: 'inline-block', fontFamily: 'var(--ef-mono)', fontSize: 8, fontWeight: 500, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ef-dim)', border: '1px solid var(--ef-faint)', borderRadius: 3, padding: '2px 7px' }}>Mode 1</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  type="text"
                  placeholder="Project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createProject(); }}
                  disabled={creating}
                  style={{ flex: 1, background: 'var(--ef-well)', border: '1px solid var(--ef-border)', borderRadius: 4, padding: '8px 12px', fontFamily: 'var(--ef-sans)', fontSize: 12, color: 'var(--ef-text)', outline: 'none', transition: 'border-color .3s var(--ef-ease)' }}
                />
                <button
                  onClick={createProject}
                  disabled={creating}
                  style={{ background: 'transparent', border: '1px solid var(--ef-border)', borderRadius: 4, padding: '8px 18px', fontFamily: 'var(--ef-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: creating ? 'var(--ef-faint)' : 'var(--ef-soft)', cursor: creating ? 'default' : 'pointer', transition: 'all .3s var(--ef-ease)' }}
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── OSCILLOSCOPE PROCESSING STRIP ── */}
        <section className="ef-stagger" style={{ marginTop: 36 }}>
          <div style={{ border: '1px solid var(--ef-border)', borderRadius: 4, background: 'var(--ef-surface)', overflow: 'hidden', padding: '8px 12px' }}>
            <canvas ref={oscCanvasRef} height={56} style={{ display: 'block', width: '100%', height: 56 }} />
            <div
              ref={oscLabelRef}
              data-progress={autoEditProgress}
              style={{ textAlign: 'center', padding: '8px 0 6px', fontFamily: 'var(--ef-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: oscLabelColor, transition: 'color .6s var(--ef-ease)', minHeight: 28 }}
            >
              {oscLabelText}
            </div>
          </div>
        </section>

        {/* ── Upload progress bar (conditional) ── */}
        {uploadState.status !== 'idle' && uploadState.status !== 'complete' && (
          <div style={{ marginTop: 16 }}>
            <UploadProgressBar state={uploadState} />
          </div>
        )}

        {/* ── PROJECTS ── */}
        <section className="ef-stagger" style={{ marginTop: 48 }}>
          <div style={{ fontFamily: 'var(--ef-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ef-dim)', marginBottom: 18 }}>Projects</div>

          {loading ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, paddingBottom: 12 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ width: 240, minWidth: 240, flexShrink: 0, background: 'var(--ef-raised)', border: '1px solid var(--ef-border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: 140, background: 'var(--ef-bg)', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 1px, rgba(0,0,0,.08) 1px, rgba(0,0,0,.08) 2px)' }} />
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ height: 14, background: 'var(--ef-well)', borderRadius: 2, marginBottom: 8, width: '70%' }} />
                    <div style={{ height: 10, background: 'var(--ef-well)', borderRadius: 2, width: '40%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', border: '1px solid var(--ef-border)', borderRadius: 4, background: 'var(--ef-surface)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--ef-faint)" strokeWidth="1.5" strokeLinecap="round" style={{ margin: '0 auto 16px' }}><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ef-soft)', marginBottom: 4 }}>No projects yet</div>
              <div style={{ fontSize: 11, color: 'var(--ef-dim)' }}>Upload footage above or create from script</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, paddingBottom: 12 }}>
              {projects.map((project) => (
                <div
                  key={project.projectId}
                  onClick={() => openProject(project.projectId)}
                  style={{ width: 240, minWidth: 240, flexShrink: 0, background: 'var(--ef-raised)', border: '1px solid var(--ef-border)', borderRadius: 4, overflow: 'hidden', cursor: 'pointer', transition: 'all .4s var(--ef-ease)', position: 'relative' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(212,166,82,.3)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(0,0,0,.3), 0 0 24px var(--ef-goldGlow)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--ef-border)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  {/* Screen area */}
                  <div style={{ position: 'relative', height: 140, overflow: 'hidden', background: '#050505' }}>
                    {project.thumbnail ? (
                      <img src={project.thumbnail} alt={project.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1008 0%, #2a1a0c 30%, #1c1208 60%, #0d0904 100%)' }} />
                    )}
                    {/* Tally light */}
                    <div style={{ position: 'absolute', top: 8, right: 8, width: 5, height: 5, borderRadius: '50%', background: 'var(--ef-green)', zIndex: 2 }} />
                    {/* Mini scanlines */}
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 1px, rgba(0,0,0,.08) 1px, rgba(0,0,0,.08) 2px)' }} />
                  </div>

                  {/* Info */}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ef-text)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 10, color: 'var(--ef-dim)' }}>{formatDuration(project.durationInFrames)}</span>
                      <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 10, color: 'var(--ef-dim)' }}>{project.aspectRatio}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, color: 'var(--ef-faint)', marginTop: 4 }}>
                      {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteProjectId(project.projectId);
                    }}
                    style={{ position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: 3, border: '1px solid var(--ef-border)', background: 'rgba(11,11,10,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: 0.4, transition: 'opacity .3s var(--ef-ease)', zIndex: 3, color: 'var(--ef-dim)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#E05252'; (e.currentTarget as HTMLButtonElement).style.color = '#E05252'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.4'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ef-border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ef-dim)'; }}
                    aria-label={`Delete ${project.name}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ── ROOM FOOTER ── */}
      <footer className="ef-stagger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', marginTop: 48, borderTop: '1px solid var(--ef-border)', position: 'relative', zIndex: 1 }}>
        <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ef-faint)' }}>Insturix Edit Floor</span>
        <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ef-dim)' }}>{projects.length} Projects</span>
        <span style={{ fontFamily: 'var(--ef-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ef-faint)' }}>v3.1</span>
      </footer>

      {/* ── Spinner keyframe (for auto-edit loading) ── */}
      <style>{`@keyframes efSpin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Delete Confirmation Dialog (UNCHANGED) ── */}
      <AlertDialog open={deleteProjectId !== null} onOpenChange={() => setDeleteProjectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the project
              and all associated data including checkpoints and chat history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProjectId && deleteProject(deleteProjectId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Mode 2 Options Dialog (UNCHANGED) ── */}
      <AutoEditDialog
        file={pendingFile}
        onConfirm={handleAutoEditConfirm}
        onCancel={() => setPendingFile(null)}
      />
    </div>
  );
}

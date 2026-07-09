'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AutoEditProcessing } from '@/components/editron/project/auto-edit/auto-edit-processing';
import {
  statusToStageIndex,
  stagePercent,
  isTerminalStatus,
} from '@/components/editron/project/auto-edit/auto-edit-stages';

/* Full-screen auto-edit processing route. Polls the project's coarse
   autoEditStatus and drives the AutoEditProcessing screen from it, then
   opens the editor when the edit is ready.

   // TODO(backend): the status is coarse (`directing` covers cut/punch/
   caption/music/transition/graphics). When the director emits per-stage
   { stage, percent, logLine }, feed those here instead of statusToStageIndex. */

export default function AutoEditProcessingPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;
  const router = useRouter();

  const [status, setStatus] = useState<string | null>(null);
  const [filename, setFilename] = useState('your video');
  const [done, setDone] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    if (!projectId) return;
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (stopped.current) return;
      try {
        const res = await fetch(`/api/services/editron/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          const proj = data.project ?? data;
          if (proj?.title) setFilename(proj.title);
          const s: string | null = proj?.autoEditStatus ?? null;
          if (s) setStatus(s);
          if (s && isTerminalStatus(s)) {
            setDone(true);
            stopped.current = true;
            timer = setTimeout(() => router.push(`/dashboard/editron/project/${projectId}`), 1400);
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      timer = setTimeout(poll, 4000);
    };

    poll();
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [projectId, router]);

  const stageIndex = statusToStageIndex(status);
  const percent = stagePercent(stageIndex, done);
  const openEditor = () => projectId && router.push(`/dashboard/editron/project/${projectId}`);

  return (
    <AutoEditProcessing
      filename={filename}
      stageIndex={stageIndex}
      percent={percent}
      done={done}
      logLines={[]}
      onSkip={openEditor}
      onOpenEditor={openEditor}
    />
  );
}

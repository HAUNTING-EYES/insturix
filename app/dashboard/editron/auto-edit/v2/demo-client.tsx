'use client';

import { useEffect, useRef, useState } from 'react';
import { AutoEditProcessing } from '@/components/editron/project/auto-edit/auto-edit-processing';
import { AUTO_EDIT_STAGES, TOTAL_STAGES, stagePercent } from '@/components/editron/project/auto-edit/auto-edit-stages';

/* Auto-edit processing screen — /v2 PREVIEW.
   Demo-drives AutoEditProcessing through the 8 stages so the design + motion
   are visible without a live auto-edit run. In the real flow this component is
   driven by useFootageAutoEdit's state (stage/percent/done) instead of this
   timer. The per-stage editorial lines below are illustrative demo copy — the
   real screen shows lines the pipeline emits (// TODO(backend)). */

const DEMO_LINE: Record<string, string> = {
  analyze: 'Read 1:02 — five scenes, 142 words.',
  cut: 'Trimmed 11 seconds of dead air.',
  punch: 'Punched in on three key moments.',
  caption: 'Captioned every word, timed to speech.',
  music: 'Laid a calm bed, ducked under the voice.',
  transition: 'Dissolved the four hard cuts.',
  graphics: 'Added a lower third and a stat.',
  finish: 'Levelled the sound, matched the colour.',
};
const DONE_LINE = 'Ready — a 48-second cut.';
const TICK_MS = 1300;

export default function AutoEditDemoClient() {
  const [stageIndex, setStageIndex] = useState(0);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (done) return;
    timer.current = setInterval(() => {
      setStageIndex((i) => {
        if (i >= TOTAL_STAGES - 1) { setDone(true); return i; }
        return i + 1;
      });
    }, TICK_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [done]);

  const reached = AUTO_EDIT_STAGES.slice(0, stageIndex + 1);
  const logLines = done
    ? [DEMO_LINE.finish, DONE_LINE]
    : reached.slice(-2).map((s) => DEMO_LINE[s.id]);

  const replay = () => { setStageIndex(0); setDone(false); };

  return (
    <AutoEditProcessing
      filename="vlogbrothers_720p.mp4"
      stageIndex={stageIndex}
      percent={stagePercent(stageIndex, done)}
      done={done}
      logLines={logLines}
      onSkip={() => setDone(true)}
      onReplay={replay}
      onOpenEditor={() => { /* preview only */ }}
    />
  );
}

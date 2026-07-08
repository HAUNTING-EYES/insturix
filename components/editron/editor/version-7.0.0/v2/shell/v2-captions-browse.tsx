'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Mono, Btn, textareaClass } from '@/components/primitives';
import { useEditorContext } from '../../contexts/editor-context';
import { useTimelinePositioning } from '../../hooks/use-timeline-positioning';
import { CaptionOverlay, OverlayType, Caption, CaptionWord } from '../../types';
import { defaultCaptionStyles, defaultDisplayConfig } from '../../components/overlays/captions/default-caption-styles';
import { groupWordsIntoCaptions } from '@/lib/editron/utils/caption-utils';
import { AutoCaptionButton } from '../../components/overlays/captions/auto-caption-button';

/* ═══ Editron editor v2 · Captions (browse-only) ═════════════════════
   v2-native re-skin of the real CaptionsPanel's BROWSE half — auto-caption,
   upload a script/words file, or type a script and generate. Reuses the real
   AutoCaptionButton and the exact generateCaptions / handleFileUpload
   add-paths (createNewTopLayer + groupWordsIntoCaptions → addOverlay).
   Caption styling/editing happens in the right props panel. */

interface WordData { word: string; start: number; end: number; confidence: number }
interface WordsFileData { words: WordData[] }

export function V2CaptionsBrowse() {
  const [script, setScript] = useState('');
  const { addOverlay, overlays, getAspectRatioDimensions, setOverlays } = useEditorContext();
  const dims = getAspectRatioDimensions();
  const { createNewTopLayer } = useTimelinePositioning();

  // Add-path copied verbatim from captions-panel.tsx generateCaptions.
  const generateCaptions = () => {
    const sentences = script.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    let currentStartTime = 0;
    const msPerWord = (60 * 1000) / 160;
    const processedCaptions: Caption[] = sentences.map((sentence) => {
      const words = sentence.split(/\s+/);
      const sentenceStartTime = currentStartTime;
      const processedWords = words.map((word, index) => ({
        word,
        startMs: sentenceStartTime + index * msPerWord,
        endMs: sentenceStartTime + (index + 1) * msPerWord,
        confidence: 0.99,
      }));
      const caption: Caption = {
        text: sentence, startMs: sentenceStartTime, endMs: sentenceStartTime + words.length * msPerWord,
        timestampMs: null, confidence: 0.99, words: processedWords,
      };
      currentStartTime = caption.endMs + 500;
      return caption;
    });
    const calculatedDurationInFrames = Math.ceil((currentStartTime / 1000) * 30);
    const position = createNewTopLayer(overlays, setOverlays);
    const newCaptionOverlay: CaptionOverlay = {
      id: Date.now(), type: OverlayType.CAPTION, from: position.from, durationInFrames: calculatedDurationInFrames,
      captions: processedCaptions,
      left: dims.width * 0.1, top: dims.height * 0.75, width: dims.width * 0.8, height: dims.height * 0.2,
      rotation: 0, isDragging: false, row: position.row,
      styles: defaultCaptionStyles, displayConfig: defaultDisplayConfig, position: 'bottom',
    };
    addOverlay(newCaptionOverlay);
    setScript('');
  };

  // Add-path copied verbatim from captions-panel.tsx handleFileUpload.
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target?.result as string) as WordsFileData;
        const captionWords: CaptionWord[] = jsonData.words.map((w) => ({
          word: w.word, startMs: w.start * 1000, endMs: w.end * 1000, confidence: w.confidence,
        }));
        const processedCaptions = groupWordsIntoCaptions(captionWords, {
          wordsPerGroup: defaultDisplayConfig.wordsPerGroup, groupByPunctuation: true,
        });
        const totalDurationMs = processedCaptions[processedCaptions.length - 1].endMs;
        const calculatedDurationInFrames = Math.ceil((totalDurationMs / 1000) * 30);
        const position = createNewTopLayer(overlays, setOverlays);
        const newCaptionOverlay: CaptionOverlay = {
          id: Date.now(), type: OverlayType.CAPTION, from: position.from, durationInFrames: calculatedDurationInFrames,
          captions: processedCaptions,
          left: dims.width * 0.1, top: dims.height * 0.75, width: dims.width * 0.8, height: dims.height * 0.2,
          rotation: 0, isDragging: false, row: position.row,
          styles: defaultCaptionStyles, displayConfig: defaultDisplayConfig, position: 'bottom',
        };
        addOverlay(newCaptionOverlay);
      } catch {
        const text = e.target?.result;
        if (typeof text === 'string') setScript(text);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-2.5">
      <Mono size="8" className="text-ds-secondary">Auto-caption from video</Mono>
      <AutoCaptionButton />

      <div className="my-1 h-px bg-ds-subtle" />

      <Mono size="8" className="text-ds-secondary">From a script</Mono>
      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-button border border-dashed border-ds-emphasis bg-surface-deeper py-2.5 text-[11.5px] font-bold text-ds-secondary transition-colors hover:bg-surface-well">
        <Upload size={14} /> Upload script / words file
        <input type="file" accept=".txt,.srt,.vtt,.json" className="hidden" onChange={handleFileUpload} />
      </label>
      <div className="flex flex-col gap-2">
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={5}
          placeholder="Paste or type your script — sentences become caption groups."
          className={textareaClass}
        />
        <Btn variant="primary" size="sm" onClick={generateCaptions} disabled={!script.trim()} className="self-end">
          Create captions
        </Btn>
      </div>
    </div>
  );
}

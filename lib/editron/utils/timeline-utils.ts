import { Project } from '../services/project-service';
import { Overlay, OverlayType } from '@/components/editron/editor/version-7.0.0/types';

export interface TimelineViewOptions {
  granularity: 'coarse' | 'detailed';
  timeWindow?: { fromFrame: number; toFrame: number };
  trackTypes?: ('text' | 'image' | 'audio' | 'video')[];
}

export function generateTimelineView(project: Project, options: TimelineViewOptions): { ascii: string; summary: string } {
  const fps = project.fps || 30;
  const durationInFrames = project.durationInFrames || 0;
  
  const startFrame = options.timeWindow?.fromFrame || 0;
  const endFrame = options.timeWindow?.toFrame || durationInFrames;
  const rangeDuration = endFrame - startFrame;

  // Helper: map editor overlay type to filter key
  type FilterableTrackType = 'text' | 'image' | 'audio' | 'video';
  const mapOverlayTypeToFilterKey = (t: OverlayType): FilterableTrackType | null => {
    switch (t) {
      case OverlayType.TEXT:
        return 'text';
      case OverlayType.IMAGE:
        return 'image';
      case OverlayType.VIDEO:
        return 'video';
      case OverlayType.SOUND:
        return 'audio';
      default:
        return null; // non-visual tracks for this view (shape, caption, etc.)
    }
  };

  // Filter overlays using correct time properties and optional type filter
  let overlays = project.overlays.filter((o) => {
    const start = o.from;
    const duration = o.durationInFrames;
    if (start + duration < startFrame) return false;
    if (start > endFrame) return false;

    if (options.trackTypes) {
      const key = mapOverlayTypeToFilterKey(o.type);
      if (!key || !options.trackTypes.includes(key)) return false;
    }
    return true;
  });

  // Sort by start time then layer (z-index is usually implicit in array order or explicit layer field)
  // Assuming array order for now, but let's sort by start time for the visual
  overlays.sort((a, b) => a.from - b.from);

  // Determine scale
  // Coarse: 1 char = 1 sec (30 frames)
  // Detailed: 1 char = 0.1 sec (3 frames)
  const framesPerChar = options.granularity === 'coarse' ? fps : Math.ceil(fps / 10);
  const totalChars = Math.ceil(rangeDuration / framesPerChar);
  
  // Build header
  let header = '';
  let ruler = '';
  for (let i = 0; i <= totalChars; i += 10) {
    const frame = startFrame + i * framesPerChar;
    const seconds = Math.round(frame / fps);
    const label = `${seconds}s`;
    header += label.padEnd(10, ' ');
    ruler += '|'.padEnd(10, '-');
  }

  // Build tracks
  // We need to group overlays into visual rows to avoid overlaps in the ASCII art if possible, 
  // or just list them. The prompt example implies a "Row" system.
  // Let's try to pack them into rows.
  const rows: Overlay[][] = [];
  
  for (const overlay of overlays) {
    let placed = false;
    for (const row of rows) {
      const lastInRow = row[row.length - 1];
      if (lastInRow.from + lastInRow.durationInFrames < overlay.from) {
        row.push(overlay);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([overlay]);
    }
  }

  let ascii = `Frames (${fps}fps, ${startFrame}–${endFrame}):\n\n`;
  ascii += header + '\n';
  ascii += ruler + '\n';

  rows.forEach((row, rowIndex) => {
    let line = ' '.repeat(totalChars + 20); // Buffer
    let lineChars = line.split('');
    
    // Clear buffer to spaces
    for(let k=0; k<lineChars.length; k++) lineChars[k] = ' ';

    for (const item of row) {
      const itemStartRel = Math.max(0, item.from - startFrame);
      const itemEndRel = Math.min(rangeDuration, (item.from + item.durationInFrames) - startFrame);
      
      const startChar = Math.floor(itemStartRel / framesPerChar);
      const endChar = Math.floor(itemEndRel / framesPerChar);
      const width = Math.max(1, endChar - startChar);

      // Draw bar
      for (let i = startChar; i < startChar + width; i++) {
        if (i < lineChars.length) lineChars[i] = '=';
      }
      // Draw brackets
      if (startChar < lineChars.length) lineChars[startChar] = '[';
      if (startChar + width - 1 < lineChars.length) lineChars[startChar + width - 1] = ']';
      
      // Just overwrite with label for now, simple approach
      // Better: `[==text-1==]` style
      const content = item.type === 'text'
        ? (('content' in item && typeof (item as any).content === 'string') ? (item as any).content : 'Text')
        : (item.type as string);
      const displayLabel = `[${content.substring(0, 10)}]`;
      
      for (let i = 0; i < displayLabel.length; i++) {
         if (startChar + i < lineChars.length) {
            lineChars[startChar + i] = displayLabel[i];
         }
      }
    }
    ascii += lineChars.join('').trimEnd() + ` (Row ${rowIndex})\n`;
  });

  const summary = `Found ${overlays.length} elements across ${rows.length} visual rows. Duration: ${(durationInFrames/fps).toFixed(1)}s.`;

  return { ascii, summary };
}

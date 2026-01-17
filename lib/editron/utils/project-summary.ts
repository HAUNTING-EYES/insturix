/**
 * Project Summary Generator
 * 
 * Creates a human-readable summary of the project state
 * for injection into the LLM context. This eliminates the need
 * for the agent to call read_project_file for basic awareness.
 */

import { OverlayType } from '../core/physics';

interface OverlaySummary {
  id: number;
  type: string;
  row: number;
  startFrame: number;
  endFrame: number;
  startTime: string;  // Human-readable (e.g., "00:05")
  endTime: string;
  label: string;      // Content preview (e.g., "Welcome..." for text)
}

interface TrackSummary {
  row: number;
  overlays: OverlaySummary[];
}

export interface ProjectSummary {
  projectName: string;
  canvas: {
    width: number;
    height: number;
    aspectRatio: string;
  };
  duration: {
    frames: number;
    seconds: number;
    formatted: string;  // e.g., "00:30"
  };
  fps: number;
  overlayCount: number;
  tracks: TrackSummary[];
  textContent: string;  // ASCII timeline view
}

/**
 * Convert frames to formatted time string (MM:SS)
 */
function framesToTime(frames: number, fps: number): string {
  const seconds = Math.floor(frames / fps);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Get a short label for an overlay (for display)
 */
function getOverlayLabel(overlay: any): string {
  switch (overlay.type) {
    case 'text':
      const text = overlay.content || '';
      return text.length > 20 ? text.substring(0, 20) + '...' : text;
    case 'video':
      return `Video (${overlay.assetId?.substring(0, 8) || 'no-id'}...)`;
    case 'image':
      return `Image (${overlay.assetId?.substring(0, 8) || 'no-id'}...)`;
    case 'sound':
      return `Audio (${overlay.assetId?.substring(0, 8) || 'no-id'}...)`;
    case 'shape':
      return `Shape: ${overlay.content || 'rectangle'}`;
    case 'sticker':
      return `Sticker: ${overlay.category || 'Default'}`;
    case 'caption':
      return 'Captions';
    default:
      return overlay.type;
  }
}

/**
 * Generate a human-readable project summary
 */
export function generateProjectSummary(project: any): ProjectSummary {
  const fps = project.fps || 30;
  
  // Calculate canvas dimensions
  let width = project.playerDimensions?.width || 1920;
  let height = project.playerDimensions?.height || 1080;
  const aspectRatio = project.aspectRatio || '16:9';
  
  if (!project.playerDimensions) {
    if (aspectRatio === "9:16") { width = 1080; height = 1920; }
    else if (aspectRatio === "4:5") { width = 1080; height = 1350; }
    else if (aspectRatio === "1:1") { width = 1080; height = 1080; }
  }
  
  // Calculate duration
  const overlays = project.overlays || [];
  let durationFrames = project.durationInFrames || 0;
  
  if (durationFrames === 0 && overlays.length > 0) {
    durationFrames = Math.max(...overlays.map((o: any) => (o.from || 0) + (o.durationInFrames || 0)));
  }
  if (durationFrames === 0) durationFrames = 300;
  
  // Group overlays by row
  const rowMap = new Map<number, any[]>();
  for (const overlay of overlays) {
    const row = overlay.row ?? 0;
    if (!rowMap.has(row)) {
      rowMap.set(row, []);
    }
    rowMap.get(row)!.push(overlay);
  }
  
  // Build track summaries
  const tracks: TrackSummary[] = [];
  const sortedRows = Array.from(rowMap.keys()).sort((a, b) => a - b);
  
  for (const row of sortedRows) {
    const rowOverlays = rowMap.get(row)!;
    // Sort by start time
    rowOverlays.sort((a, b) => a.from - b.from);
    
    const overlaySummaries: OverlaySummary[] = rowOverlays.map(o => ({
      id: o.id,
      type: o.type,
      row: o.row,
      startFrame: o.from,
      endFrame: o.from + o.durationInFrames,
      startTime: framesToTime(o.from, fps),
      endTime: framesToTime(o.from + o.durationInFrames, fps),
      label: getOverlayLabel(o)
    }));
    
    tracks.push({ row, overlays: overlaySummaries });
  }
  
  // Generate ASCII timeline
  const textContent = generateAsciiTimeline(tracks, durationFrames, fps);
  
  return {
    projectName: project.name || 'Untitled',
    canvas: { width, height, aspectRatio },
    duration: {
      frames: durationFrames,
      seconds: Math.floor(durationFrames / fps),
      formatted: framesToTime(durationFrames, fps)
    },
    fps,
    overlayCount: overlays.length,
    tracks,
    textContent
  };
}

/**
 * Generate an ASCII representation of the timeline
 */
function generateAsciiTimeline(tracks: TrackSummary[], totalFrames: number, fps: number): string {
  if (tracks.length === 0) {
    return 'Timeline is empty. No overlays have been added yet.';
  }
  
  const lines: string[] = [];
  lines.push(`Timeline (${framesToTime(totalFrames, fps)} total, ${fps}fps)`);
  lines.push('─'.repeat(60));
  
  for (const track of tracks) {
    lines.push(`Row ${track.row}:`);
    for (const overlay of track.overlays) {
      const typeIcon = getTypeIcon(overlay.type);
      lines.push(`  ${typeIcon} [ID:${overlay.id}] ${overlay.startTime}-${overlay.endTime}: "${overlay.label}"`);
    }
  }
  
  lines.push('─'.repeat(60));
  return lines.join('\n');
}

/**
 * Get an emoji icon for overlay type
 */
function getTypeIcon(type: string): string {
  switch (type) {
    case 'text': return '📝';
    case 'video': return '🎥';
    case 'image': return '🖼️';
    case 'sound': return '🔊';
    case 'shape': return '⬛';
    case 'sticker': return '⭐';
    case 'caption': return '💬';
    default: return '📦';
  }
}

/**
 * Format the summary as a string for injection into the system prompt
 */
export function formatSummaryForPrompt(summary: ProjectSummary): string {
  return `
**Current Project State:**
- Project: "${summary.projectName}"
- Canvas: ${summary.canvas.width}x${summary.canvas.height} (${summary.canvas.aspectRatio})
- Duration: ${summary.duration.formatted} (${summary.duration.frames} frames @ ${summary.fps}fps)
- Overlays: ${summary.overlayCount} items

${summary.textContent}

**Available IDs:** ${summary.tracks.flatMap(t => t.overlays.map(o => o.id)).join(', ') || 'None'}
`.trim();
}

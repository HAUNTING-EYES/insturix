/**
 * Client-side Shadow Logger — fires interaction events to the backend
 * for the "Hot" memory tier. All calls are non-blocking fire-and-forget.
 */

export type ShadowEventType =
  | 'content_deleted'
  | 'hook_rejected'
  | 'style_corrected'
  | 'regeneration_requested'
  | 'feedback_given';

interface ShadowLogParams {
  projectId: string;
  type: ShadowEventType;
  sessionId?: string;
  artifactId?: string;
  versionId?: string;
  payload?: Record<string, any>;
}

const ENDPOINT = '/api/services/thinkforge/events/shadow-log';

let queue: ShadowLogParams[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY = 800;

function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0);
  for (const entry of batch) {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: entry.projectId,
        sessionId: entry.sessionId,
        artifactId: entry.artifactId,
        versionId: entry.versionId,
        type: entry.type,
        payload: entry.payload ?? {},
      }),
    }).catch(() => {
      // Silently discard — telemetry must never break the UI
    });
  }
}

/**
 * Enqueue a shadow log event. Events are flushed after a short debounce
 * so rapid deletions/edits don't spawn a request per keystroke.
 */
export function logShadowEvent(params: ShadowLogParams) {
  queue.push(params);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_DELAY);
}

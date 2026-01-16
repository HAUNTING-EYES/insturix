export type EventRecord = {
  id: number;
  sessionId: string;
  threadId?: string;
  event: string;
  data: any;
  ts: number;
};

const MAX_EVENTS_PER_SESSION = 1000;
let nextEventId = 1;
const sessionEvents = new Map<string, EventRecord[]>();

export function appendEvent(sessionId: string, event: string, data: any, threadId?: string): EventRecord {
  const id = nextEventId++;
  const record: EventRecord = {
    id,
    sessionId,
    threadId,
    event,
    data,
    ts: Date.now(),
  };

  const list = sessionEvents.get(sessionId) || [];
  list.push(record);
  if (list.length > MAX_EVENTS_PER_SESSION) {
    list.splice(0, list.length - MAX_EVENTS_PER_SESSION);
  }
  sessionEvents.set(sessionId, list);

  return record;
}

export function getEventsSince(sessionId: string, sinceId: number, threadId?: string): EventRecord[] {
  const list = sessionEvents.get(sessionId) || [];
  return list.filter((e) => e.id > sinceId && (!threadId || e.threadId === threadId));
}

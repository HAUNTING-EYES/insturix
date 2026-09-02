import mongoose from "mongoose";

/**
 * The Vibe spine (migration plan §3, §9): one persisted Project per goal and
 * its append-only conversation event log. Same MongoDB cluster/db as the
 * engines (MONGODB_DB_NAME). Sequencing is a per-project atomic counter so
 * concurrent serverless instances can never interleave events out of order.
 *
 * Availability rule: the spine must never kill a turn. appendTurnEvent logs
 * persistence failures and returns null — the SSE stream keeps flowing; the
 * event is recoverable from the engine receipt when one exists (Phase 2
 * operations close that hole properly).
 */

export type SpineProject = {
  projectId: string;
  organizationId: string | null;
  brandId: string | null;
  acceptedBrandRevision: string | null; // Brand Vault stamp — context loader fills it (Phase 2)
  title: string;
  phase: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SpineEvent = {
  seq: number;
  projectId: string;
  turnId: string | null;
  actor: "user" | "agent" | "system";
  kind: string; // "user" for user messages, otherwise the SSE event type
  payload: unknown;
  createdAt?: string | null;
};

const ProjectSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: null, index: true },
    brandId: { type: String, default: null },
    acceptedBrandRevision: { type: String, default: null },
    title: { type: String, required: true },
    phase: { type: String, default: "planning" },
  },
  { collection: "vibe_projects", timestamps: true },
);

const EventSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true },
    seq: { type: Number, required: true },
    turnId: { type: String, default: null },
    actor: { type: String, required: true },
    kind: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { collection: "vibe_conversation_events", timestamps: { createdAt: true, updatedAt: false } },
);
EventSchema.index({ projectId: 1, seq: 1 }, { unique: true });

const SeqSchema = new mongoose.Schema({ projectId: { type: String, required: true }, seq: { type: Number, default: 0 } }, { collection: "vibe_conversation_seq" });

const ProjectModel = mongoose.models.VibeProject ?? mongoose.model("VibeProject", ProjectSchema);
const EventModel = mongoose.models.VibeConversationEvent ?? mongoose.model("VibeConversationEvent", EventSchema);
const SeqModel = mongoose.models.VibeConversationSeq ?? mongoose.model("VibeConversationSeq", SeqSchema);

/* cached connection, clickatron-mongo pattern under our own global key */
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const globalCache = globalThis as unknown as { studioSpine?: Cache };
const cache: Cache = globalCache.studioSpine ?? { conn: null, promise: null };
globalCache.studioSpine = cache;

export async function connectSpine(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) throw new Error("spine: MONGODB_URI / MONGODB_DB_NAME not configured");
  if (!cache.promise) cache.promise = mongoose.connect(uri, { bufferCommands: false, dbName });
  cache.conn = await cache.promise;
  return cache.conn;
}

/** "live" / "del_live" are the pre-spine placeholders — everything else (TF
 * session ids, Editron project ids, proj_*) is a real, persistable identity. */
export function spineProjectIdOrNull(deliverableId: string | null | undefined): string | null {
  if (!deliverableId) return null;
  if (deliverableId === "live" || deliverableId === "del_live") return null;
  return deliverableId;
}

type ProjectLean = {
  _id: unknown;
  organizationId?: string | null;
  brandId?: string | null;
  acceptedBrandRevision?: string | null;
  title?: string;
  phase?: string;
};

function toSpineProject(doc: ProjectLean): SpineProject {
  return {
    projectId: String(doc._id),
    organizationId: doc.organizationId ?? null,
    brandId: doc.brandId ?? null,
    acceptedBrandRevision: doc.acceptedBrandRevision ?? null,
    title: doc.title ?? "Studio draft",
    phase: doc.phase ?? "planning",
  };
}

export async function getOrCreateProject(input: {
  projectId: string | null;
  organizationId: string | null;
  brandId: string | null;
  title: string;
}): Promise<SpineProject> {
  const projectId = input.projectId ?? `proj_${crypto.randomUUID()}`;
  const doc = (await ProjectModel.findByIdAndUpdate(
    projectId,
    { $setOnInsert: { organizationId: input.organizationId, brandId: input.brandId, title: input.title, phase: "planning" } },
    { upsert: true, new: true },
  ).lean()) as unknown as ProjectLean;
  return toSpineProject(doc);
}

export async function getProject(projectId: string): Promise<SpineProject | null> {
  const doc = (await ProjectModel.findById(projectId).lean()) as unknown as ProjectLean | null;
  if (!doc) return null;
  return toSpineProject(doc);
}

/** Transient-failure armor (same pattern the MatrAIx runner proved over a
 *  550-cell run): 2 retries with backoff. Atlas blips are usually sub-second,
 *  and an unsaved event is a hole in the project's story — absorb the blip.
 *  Only a sustained outage defeats this; the turn-start gate in the turns
 *  route then refuses to run unrecorded work rather than losing it. */
const SPINE_RETRY_BACKOFF_MS = [2000, 8000];

/** Appends one event with the next per-project sequence number. Atomic
 *  counter + insert, retried on transient errors; a sustained failure is
 *  logged and returned as null — the caller decides (turn-start: refuse;
 *  mid-turn: keep the running work alive, reconcile from Phase 2 receipts). */
export async function appendTurnEvent(
  projectId: string,
  event: { turnId: string | null; actor: SpineEvent["actor"]; kind: string; payload: unknown },
): Promise<SpineEvent | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= SPINE_RETRY_BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, SPINE_RETRY_BACKOFF_MS[attempt - 1]));
    try {
      const counter = (await SeqModel.findOneAndUpdate({ projectId }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean()) as unknown as { seq?: number } | null;
      const seq = counter?.seq ?? 1;
      const doc = await EventModel.create({ projectId, seq, turnId: event.turnId, actor: event.actor, kind: event.kind, payload: event.payload });
      return { seq, projectId, turnId: event.turnId, actor: event.actor, kind: event.kind, payload: event.payload, createdAt: doc.createdAt ? doc.createdAt.toISOString() : null };
    } catch (error) {
      lastError = error;
    }
  }
  console.error(`[spine] appendTurnEvent failed for ${projectId} (${event.kind}) after ${SPINE_RETRY_BACKOFF_MS.length + 1} attempts`, lastError);
  return null;
}

export async function listEvents(projectId: string, afterSeq: number, limit = 2000): Promise<SpineEvent[]> {
  const docs = await EventModel.find({ projectId, seq: { $gt: afterSeq } }).sort({ seq: 1 }).limit(limit).lean();
  return docs.map((d) => ({
    seq: d.seq as number,
    projectId,
    turnId: (d.turnId as string | null) ?? null,
    actor: d.actor as SpineEvent["actor"],
    kind: d.kind as string,
    payload: d.payload,
    createdAt: d.createdAt ? new Date(d.createdAt as unknown as string).toISOString() : null,
  }));
}

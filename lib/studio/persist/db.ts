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
  /** audit P0: personal (org-null) projects have an owner — the caller of
   *  record. Org projects authorize by organizationId alone. Legacy rows
   *  created before this field have null and keep their old semantics
   *  until backfilled (scripts/migrate-spine-owners). */
  ownerUserId: string | null;
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
    ownerUserId: { type: String, default: null, index: true },
    brandId: { type: String, default: null },
    acceptedBrandRevision: { type: String, default: null },
    title: { type: String, required: true },
    phase: { type: String, default: "planning" },
    tfImportedAt: { type: Date, default: null }, // set once ThinkForge history is imported (§10)
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

/** One Operation per logical turn (plan §3 idempotency): the SAME operationId
 *  can never start the same job twice — an in-flight claim is rejected, a
 *  done claim is rejected, an await-confirmation claim resumes on the answer,
 *  and an errored claim may retry. */
export type OperationState = "running" | "awaiting_confirmation" | "done" | "error";

const OperationSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // operationId
    projectId: { type: String, required: true, index: true },
    command: { type: String, required: true },
    state: { type: String, required: true },
    turnIds: { type: [String], default: [] },
    error: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { collection: "vibe_operations", timestamps: { createdAt: "startedAt", updatedAt: true } },
);

const ProjectModel = mongoose.models.VibeProject ?? mongoose.model("VibeProject", ProjectSchema);
const EventModel = mongoose.models.VibeConversationEvent ?? mongoose.model("VibeConversationEvent", EventSchema);
const SeqModel = mongoose.models.VibeConversationSeq ?? mongoose.model("VibeConversationSeq", SeqSchema);
const OperationModel = mongoose.models.VibeOperation ?? mongoose.model("VibeOperation", OperationSchema);
export { ProjectModel, OperationModel }; // status.ts computes labels from real records (plan §6)

/** Durable outbox (plan §3 recovery): events that failed to reach the spine
 *  log mid-turn land here instead of vanishing. Reads drain them back into
 *  the log in order — the user's work finishes landing on the next load. */
const OutboxSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true },
    turnId: { type: String, default: null },
    actor: { type: String, required: true },
    kind: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    attempts: { type: Number, default: 0 },
  },
  { collection: "vibe_outbox", timestamps: true },
);
const OutboxModel = mongoose.models.VibeOutbox ?? mongoose.model("VibeOutbox", OutboxSchema);

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
  ownerUserId?: string | null;
  title?: string;
  phase?: string;
};

function toSpineProject(doc: ProjectLean): SpineProject {
  return {
    projectId: String(doc._id),
    organizationId: doc.organizationId ?? null,
    brandId: doc.brandId ?? null,
    acceptedBrandRevision: doc.acceptedBrandRevision ?? null,
    ownerUserId: doc.ownerUserId ?? null,
    title: doc.title ?? "Studio draft",
    phase: doc.phase ?? "planning",
  };
}

export async function getOrCreateProject(input: {
  projectId: string | null;
  organizationId: string | null;
  brandId: string | null;
  title: string;
  /** exact accepted Brand Vault record — plan §17 Phase 4 first bullet:
   *  the project pins the brand truth it was created against */
  acceptedBrandRevision?: string | null;
  /** audit P0: stamped on insert — the org-null ownership anchor */
  ownerUserId?: string | null;
}): Promise<SpineProject> {
  await connectSpine();
  const projectId = input.projectId ?? `proj_${crypto.randomUUID()}`;
  const stamp = input.brandId && input.acceptedBrandRevision ? input.acceptedBrandRevision : null;
  /* $setOnInsert keeps creation idempotent; a NEWER accepted revision on a
   * later turn refreshes the stamp only when the caller actually re-verified
   * it against the vault (routes pass the record they just authorized) */
  const setOnInsert: Record<string, unknown> = { organizationId: input.organizationId, brandId: input.brandId, title: input.title, phase: "planning", ownerUserId: input.ownerUserId ?? null };
  /* $set (not $setOnInsert) for the stamp: Mongo forbids the same path in
   * both operators, and $set applies on insert AND update — so creation
   * stamps it and a later re-verified revision refreshes it */
  const update: Record<string, unknown> = { $setOnInsert: setOnInsert };
  if (stamp) update.$set = { acceptedBrandRevision: stamp };
  const doc = (await ProjectModel.findByIdAndUpdate(projectId, update, { upsert: true, new: true }).lean()) as unknown as ProjectLean;
  return toSpineProject(doc);
}

export async function getProject(projectId: string): Promise<SpineProject | null> {
  await connectSpine();
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

/** Mid-turn failure path: park the event durably instead of losing it. If the
 *  outbox write also fails (total outage) this returns false — nothing more
 *  can be persisted anywhere, and the caller says so honestly. */
export async function enqueueOutbox(
  projectId: string,
  event: { turnId: string | null; actor: SpineEvent["actor"]; kind: string; payload: unknown },
): Promise<boolean> {
  try {
    await OutboxModel.create({ projectId, turnId: event.turnId, actor: event.actor, kind: event.kind, payload: event.payload });
    return true;
  } catch (error) {
    console.error(`[spine] outbox enqueue failed for ${projectId} (${event.kind}) — event lost`, error);
    return false;
  }
}

/** Drain a project's outbox into the spine log, oldest first. Runs before
 *  every events read, so a reload is what finishes landing interrupted work.
 *  Stops at the first entry that still won't append (order beats completeness
 *  — a later event must never land before an earlier one) and increments its
 *  attempt count for observability. */
export async function drainOutbox(projectId: string): Promise<number> {
  await connectSpine();
  let drained = 0;
  const stuck = await OutboxModel.find({ projectId }).sort({ createdAt: 1, _id: 1 }).limit(200).lean();
  for (const entry of stuck as unknown as Array<{ _id: unknown; turnId: string | null; actor: SpineEvent["actor"]; kind: string; payload: unknown }>) {
    const appended = await appendTurnEvent(projectId, { turnId: entry.turnId, actor: entry.actor, kind: entry.kind, payload: entry.payload });
    if (!appended) {
      await OutboxModel.updateOne({ _id: entry._id }, { $inc: { attempts: 1 } }).catch(() => undefined);
      break;
    }
    await OutboxModel.deleteOne({ _id: entry._id }).catch(() => undefined);
    drained += 1;
  }
  return drained;
}

/** One-shot import claim (§10 conversation migration): exactly one caller
 *  wins the right to import a session's ThinkForge history — concurrent
 *  requests (turns route + events route racing) cannot duplicate it. */export async function claimTfImport(projectId: string): Promise<boolean> {
  await connectSpine();
  const doc = await ProjectModel.findOneAndUpdate({ _id: projectId, tfImportedAt: null }, { $set: { tfImportedAt: new Date() } }, { new: true }).lean();
  return Boolean(doc);
}

/** Release the claim when the import produced nothing (all writes failed) so
 *  a later attempt can retry instead of a permanently-empty history. */
export async function releaseTfImportClaim(projectId: string): Promise<void> {
  await connectSpine();
  await ProjectModel.updateOne({ _id: projectId }, { $set: { tfImportedAt: null } });
}

export type OperationClaim =
  | { ok: true; resumed: boolean }
  | { ok: false; reason: "in_flight" | "already_done"; state: OperationState };

/** Atomically claim the operationId for this project. Transitions allowed:
 *  new → running · await-confirmation (with the confirm answer) → running ·
 *  error → running (retry). Running and done claims are refused — the same
 *  request can never charge or publish twice. */
export async function claimOperation(projectId: string, operationId: string, command: string, isConfirmResume: boolean): Promise<OperationClaim> {
  await connectSpine();
  const existing = (await OperationModel.findById(operationId).lean()) as unknown as { state?: OperationState; projectId?: string } | null;
  if (existing && existing.projectId !== projectId) {
    return { ok: false, reason: "in_flight", state: existing.state ?? "running" }; // ids are global — a cross-project reuse is refused, not restarted
  }
  if (!existing) {
    await OperationModel.create({ _id: operationId, projectId, command, state: "running" });
    return { ok: true, resumed: false };
  }
  const state = existing.state ?? "running";
  if (state === "running") return { ok: false, reason: "in_flight", state };
  if (state === "done") return { ok: false, reason: "already_done", state };
  const resumed = await OperationModel.findByIdAndUpdate(operationId, { $set: { state: "running", error: null } }, { new: true }).lean();
  if (!resumed) return { ok: false, reason: "in_flight", state };
  void isConfirmResume; // both await-confirmation and error resume through the same transition
  return { ok: true, resumed: true };
}

export async function markOperation(operationId: string, state: OperationState, detail?: { turnId?: string; error?: string }): Promise<void> {
  const set: Record<string, unknown> = { state };
  if (state === "done" || state === "error") set.finishedAt = new Date();
  if (detail?.error !== undefined) set.error = detail.error;
  const update: Record<string, unknown> = { $set: set };
  if (detail?.turnId) update.$addToSet = { turnIds: detail.turnId };
  await connectSpine();
  await OperationModel.findByIdAndUpdate(operationId, update).catch((error) => console.error(`[spine] markOperation(${operationId}, ${state}) failed`, error));
}

export async function listEvents(projectId: string, afterSeq: number, limit = 2000): Promise<SpineEvent[]> {
  await connectSpine();
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

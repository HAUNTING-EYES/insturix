import type { BrandSignalProfile } from './brand-signal-profile';
import {
  acceptBrandSignalProfileDraft,
  bindBrandSignalDraftToAcceptedRevision,
  brandSignalDraftMatchesAcceptedRevision,
  createBrandSignalProfileDraft,
  rejectBrandSignalProfileDraft,
  supersedeBrandSignalProfileRecord,
  type BrandSignalLifecycleOptions,
  type BrandSignalProfileIssue,
  type BrandSignalProfileRecord,
  type BrandSignalProfileStatus,
} from './brand-signal-lifecycle';

export type BrandSignalProfileRepositoryEventType =
  | 'draft_saved'
  | 'draft_accept_failed'
  | 'draft_accepted'
  | 'draft_rejected'
  | 'record_superseded';

export interface BrandSignalProfileRepositoryEvent {
  id: string;
  type: BrandSignalProfileRepositoryEventType;
  recordId: string;
  brandId?: string;
  userId?: string;
  orgId?: string;
  actorId?: string;
  createdAt: string;
  issues?: BrandSignalProfileIssue[];
  reason?: string;
}

export interface BrandSignalProfileListFilter {
  brandId?: string;
  userId?: string;
  orgId?: string | null;
  status?: BrandSignalProfileStatus;
}

export interface BrandSignalProfileRepositorySnapshot {
  records: BrandSignalProfileRecord[];
  events: BrandSignalProfileRepositoryEvent[];
}

export type BrandSignalProfileRepositoryResult =
  | { ok: true; record: BrandSignalProfileRecord; superseded: BrandSignalProfileRecord[] }
  | { ok: false; code: 'not_found' | 'not_draft' | 'validation_failed' | 'conflict'; issues: BrandSignalProfileIssue[] };

export class InMemoryBrandSignalProfileRepository {
  private readonly records = new Map<string, BrandSignalProfileRecord>();
  private readonly events: BrandSignalProfileRepositoryEvent[] = [];

  constructor(snapshot?: Partial<BrandSignalProfileRepositorySnapshot>) {
    for (const record of snapshot?.records ?? []) {
      this.records.set(record.id, cloneRecord(record));
    }
    this.events = (snapshot?.events ?? []).map(cloneEvent);
  }

  saveDraft(profile: BrandSignalProfile, options: BrandSignalLifecycleOptions = {}): BrandSignalProfileRecord {
    const draft = createBrandSignalProfileDraft(profile, options);
    return this.saveRecord(draft, options);
  }

  saveRecord(record: BrandSignalProfileRecord, options: BrandSignalLifecycleOptions = {}): BrandSignalProfileRecord {
    const existing = this.records.get(record.id);
    const next = record.status === 'draft'
      ? existing?.status === 'draft' && existing.baseAcceptedRevision !== undefined
        ? { ...record, baseAcceptedRevision: existing.baseAcceptedRevision }
        : bindBrandSignalDraftToAcceptedRevision(record, this.currentAcceptedFor(record))
      : record;
    this.records.set(next.id, cloneRecord(next));
    this.appendEvent(next.status === 'draft' ? 'draft_saved' : 'record_superseded', next, options);
    return cloneRecord(next);
  }

  getRecord(id: string): BrandSignalProfileRecord | null {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : null;
  }

  listRecords(filter: BrandSignalProfileListFilter = {}): BrandSignalProfileRecord[] {
    return [...this.records.values()]
      .filter((record) => matchesFilter(record, filter))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(cloneRecord);
  }

  getLatestAcceptedProfile(filter: Omit<BrandSignalProfileListFilter, 'status'>): BrandSignalProfile | null {
    return this.listRecords({ ...filter, status: 'accepted' })[0]?.profile ?? null;
  }

  getLatestAcceptedRecord(filter: Omit<BrandSignalProfileListFilter, 'status'>): BrandSignalProfileRecord | null {
    return this.listRecords({ ...filter, status: 'accepted' })[0] ?? null;
  }

  acceptDraft(id: string, options: BrandSignalLifecycleOptions = {}): BrandSignalProfileRepositoryResult {
    const draft = this.records.get(id);
    if (!draft) return failure('not_found', 'record', `Brand signal profile record "${id}" was not found.`);
    if (draft.status !== 'draft') {
      return failure('not_draft', 'status', `Only draft profiles can be accepted. Current status: ${draft.status}.`);
    }
    if (!brandSignalDraftMatchesAcceptedRevision(draft, this.currentAcceptedFor(draft))) {
      const result = failure(
        'conflict',
        'baseAcceptedRevision',
        'The accepted brand profile changed after this draft was created. Refresh and create a new draft from the current accepted revision.',
      );
      this.appendEvent('draft_accept_failed', draft, options, { issues: result.ok ? [] : result.issues });
      return result;
    }

    const accepted = acceptBrandSignalProfileDraft(draft, options);
    if (!accepted.ok) {
      this.appendEvent('draft_accept_failed', draft, options, { issues: accepted.issues });
      return { ok: false, code: 'validation_failed', issues: accepted.issues };
    }

    const superseded = this.supersedeExistingAccepted(accepted.record, options);
    this.records.set(accepted.record.id, cloneRecord(accepted.record));
    this.appendEvent('draft_accepted', accepted.record, options);
    return { ok: true, record: cloneRecord(accepted.record), superseded: superseded.map(cloneRecord) };
  }

  rejectDraft(id: string, reason: string, options: BrandSignalLifecycleOptions = {}): BrandSignalProfileRepositoryResult {
    const draft = this.records.get(id);
    if (!draft) return failure('not_found', 'record', `Brand signal profile record "${id}" was not found.`);
    if (draft.status !== 'draft') {
      return failure('not_draft', 'status', `Only draft profiles can be rejected. Current status: ${draft.status}.`);
    }

    const rejected = rejectBrandSignalProfileDraft(draft, reason, options);
    this.records.set(rejected.id, cloneRecord(rejected));
    this.appendEvent('draft_rejected', rejected, options, { reason });
    return { ok: true, record: cloneRecord(rejected), superseded: [] };
  }

  supersedeRecord(id: string, options: BrandSignalLifecycleOptions = {}): BrandSignalProfileRepositoryResult {
    const record = this.records.get(id);
    if (!record) return failure('not_found', 'record', `Brand signal profile record "${id}" was not found.`);

    const superseded = supersedeBrandSignalProfileRecord(record, options);
    this.records.set(superseded.id, cloneRecord(superseded));
    this.appendEvent('record_superseded', superseded, options);
    return { ok: true, record: cloneRecord(superseded), superseded: [cloneRecord(superseded)] };
  }

  listEvents(recordId?: string): BrandSignalProfileRepositoryEvent[] {
    return this.events
      .filter((event) => !recordId || event.recordId === recordId)
      .map(cloneEvent);
  }

  snapshot(): BrandSignalProfileRepositorySnapshot {
    return {
      records: [...this.records.values()].map(cloneRecord),
      events: this.events.map(cloneEvent),
    };
  }

  private supersedeExistingAccepted(
    accepted: BrandSignalProfileRecord,
    options: BrandSignalLifecycleOptions,
  ): BrandSignalProfileRecord[] {
    const superseded: BrandSignalProfileRecord[] = [];
    for (const record of this.records.values()) {
      if (record.id === accepted.id || record.status !== 'accepted') continue;
      if (!sharesAcceptedScope(record, accepted)) continue;
      const next = supersedeBrandSignalProfileRecord(record, options);
      this.records.set(next.id, cloneRecord(next));
      this.appendEvent('record_superseded', next, options);
      superseded.push(next);
    }
    return superseded;
  }

  private currentAcceptedFor(record: BrandSignalProfileRecord): BrandSignalProfileRecord | null {
    return [...this.records.values()]
      .filter((candidate) => candidate.status === 'accepted' && sharesAcceptedScope(candidate, record))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  }

  private appendEvent(
    type: BrandSignalProfileRepositoryEventType,
    record: BrandSignalProfileRecord,
    options: BrandSignalLifecycleOptions,
    extra: Pick<BrandSignalProfileRepositoryEvent, 'issues' | 'reason'> = {},
  ): void {
    const createdAt = options.now ?? new Date().toISOString();
    this.events.push({
      id: `brand_signal_event_${this.events.length + 1}`,
      type,
      recordId: record.id,
      brandId: record.profile.brandId,
      userId: record.profile.userId,
      orgId: record.profile.orgId,
      actorId: options.actorId,
      createdAt,
      ...extra,
    });
  }
}

function sharesAcceptedScope(left: BrandSignalProfileRecord, right: BrandSignalProfileRecord): boolean {
  if (left.profile.brandId !== right.profile.brandId) return false;
  const leftOrgId = left.profile.orgId?.trim();
  const rightOrgId = right.profile.orgId?.trim();
  if (leftOrgId || rightOrgId) return Boolean(leftOrgId) && leftOrgId === rightOrgId;
  return left.profile.userId === right.profile.userId;
}

export function createInMemoryBrandSignalProfileRepository(
  snapshot?: Partial<BrandSignalProfileRepositorySnapshot>,
): InMemoryBrandSignalProfileRepository {
  return new InMemoryBrandSignalProfileRepository(snapshot);
}

function matchesFilter(record: BrandSignalProfileRecord, filter: BrandSignalProfileListFilter): boolean {
  if (filter.brandId && record.profile.brandId !== filter.brandId) return false;
  if (filter.userId && record.profile.userId !== filter.userId) return false;
  if (filter.orgId !== undefined && record.profile.orgId !== (filter.orgId ?? undefined)) return false;
  if (filter.status && record.status !== filter.status) return false;
  return true;
}

function failure(
  code: Exclude<BrandSignalProfileRepositoryResult, { ok: true }>['code'],
  path: string,
  message: string,
): BrandSignalProfileRepositoryResult {
  return { ok: false, code, issues: [{ severity: 'error', code: 'review_required', path, message }] };
}

function cloneRecord(record: BrandSignalProfileRecord): BrandSignalProfileRecord {
  return JSON.parse(JSON.stringify(record)) as BrandSignalProfileRecord;
}

function cloneEvent(event: BrandSignalProfileRepositoryEvent): BrandSignalProfileRepositoryEvent {
  return JSON.parse(JSON.stringify(event)) as BrandSignalProfileRepositoryEvent;
}

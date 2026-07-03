import type { AvatarProfile } from './avatar-profile';
import {
  acceptAvatarProfileDraft,
  createAvatarProfileDraft,
  rejectAvatarProfileDraft,
  supersedeAvatarProfileRecord,
  type AvatarLifecycleOptions,
  type AvatarProfileIssue,
  type AvatarProfileRecord,
} from './avatar-lifecycle';
import type { AvatarProfileStatus } from './avatar-profile';

export type AvatarProfileRepositoryEventType =
  | 'draft_saved'
  | 'draft_accept_failed'
  | 'draft_accepted'
  | 'draft_rejected'
  | 'record_superseded';

export interface AvatarProfileRepositoryEvent {
  id: string;
  type: AvatarProfileRepositoryEventType;
  recordId: string;
  avatarId: string;
  brandId?: string | null;
  userId: string;
  orgId?: string | null;
  actorId?: string;
  createdAt: string;
  issues?: AvatarProfileIssue[];
  reason?: string;
}

export interface AvatarProfileListFilter {
  avatarId?: string;
  brandId?: string | null;
  userId?: string;
  orgId?: string | null;
  status?: AvatarProfileStatus;
}

export interface AvatarProfileRepositorySnapshot {
  records: AvatarProfileRecord[];
  events: AvatarProfileRepositoryEvent[];
}

export type AvatarProfileRepositoryFailureCode = 'not_found' | 'not_draft' | 'validation_failed';

export type AvatarProfileRepositoryResult =
  | { ok: true; record: AvatarProfileRecord; superseded: AvatarProfileRecord[] }
  | { ok: false; code: AvatarProfileRepositoryFailureCode; issues: AvatarProfileIssue[] };

export class InMemoryAvatarProfileRepository {
  private readonly records = new Map<string, AvatarProfileRecord>();
  private readonly events: AvatarProfileRepositoryEvent[] = [];

  constructor(snapshot?: Partial<AvatarProfileRepositorySnapshot>) {
    for (const record of snapshot?.records ?? []) {
      this.records.set(record.id, cloneRecord(record));
    }
    this.events = (snapshot?.events ?? []).map(cloneEvent);
  }

  saveDraft(profile: AvatarProfile, options: AvatarLifecycleOptions = {}): AvatarProfileRecord {
    const draft = createAvatarProfileDraft(profile, options);
    this.records.set(draft.id, cloneRecord(draft));
    this.appendEvent('draft_saved', draft, options);
    return cloneRecord(draft);
  }

  saveRecord(record: AvatarProfileRecord, options: AvatarLifecycleOptions = {}): AvatarProfileRecord {
    this.records.set(record.id, cloneRecord(record));
    this.appendEvent(record.status === 'draft' ? 'draft_saved' : 'record_superseded', record, options);
    return cloneRecord(record);
  }

  getRecord(id: string): AvatarProfileRecord | null {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : null;
  }

  listRecords(filter: AvatarProfileListFilter = {}): AvatarProfileRecord[] {
    return [...this.records.values()]
      .filter((record) => matchesFilter(record, filter))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(cloneRecord);
  }

  getLatestAcceptedProfile(filter: Omit<AvatarProfileListFilter, 'status'>): AvatarProfile | null {
    return this.listRecords({ ...filter, status: 'accepted' })[0]?.profile ?? null;
  }

  getLatestAcceptedRecord(filter: Omit<AvatarProfileListFilter, 'status'>): AvatarProfileRecord | null {
    return this.listRecords({ ...filter, status: 'accepted' })[0] ?? null;
  }

  acceptDraft(id: string, options: AvatarLifecycleOptions = {}): AvatarProfileRepositoryResult {
    const draft = this.records.get(id);
    if (!draft) return failure('not_found', 'record', `Avatar profile record "${id}" was not found.`);
    if (draft.status !== 'draft') {
      return failure('not_draft', 'status', `Only draft avatar profiles can be accepted. Current status: ${draft.status}.`);
    }

    const accepted = acceptAvatarProfileDraft(draft, options);
    if (!accepted.ok) {
      this.appendEvent('draft_accept_failed', draft, options, { issues: accepted.issues });
      return { ok: false, code: 'validation_failed', issues: accepted.issues };
    }

    const superseded = this.supersedeExistingAccepted(accepted.record, options);
    this.records.set(accepted.record.id, cloneRecord(accepted.record));
    this.appendEvent('draft_accepted', accepted.record, options);
    return { ok: true, record: cloneRecord(accepted.record), superseded: superseded.map(cloneRecord) };
  }

  rejectDraft(id: string, reason: string, options: AvatarLifecycleOptions = {}): AvatarProfileRepositoryResult {
    const draft = this.records.get(id);
    if (!draft) return failure('not_found', 'record', `Avatar profile record "${id}" was not found.`);
    if (draft.status !== 'draft') {
      return failure('not_draft', 'status', `Only draft avatar profiles can be rejected. Current status: ${draft.status}.`);
    }

    const rejected = rejectAvatarProfileDraft(draft, reason, options);
    this.records.set(rejected.id, cloneRecord(rejected));
    this.appendEvent('draft_rejected', rejected, options, { reason });
    return { ok: true, record: cloneRecord(rejected), superseded: [] };
  }

  supersedeRecord(id: string, options: AvatarLifecycleOptions = {}): AvatarProfileRepositoryResult {
    const record = this.records.get(id);
    if (!record) return failure('not_found', 'record', `Avatar profile record "${id}" was not found.`);

    const superseded = supersedeAvatarProfileRecord(record, options);
    this.records.set(superseded.id, cloneRecord(superseded));
    this.appendEvent('record_superseded', superseded, options);
    return { ok: true, record: cloneRecord(superseded), superseded: [cloneRecord(superseded)] };
  }

  listEvents(recordId?: string): AvatarProfileRepositoryEvent[] {
    return this.events
      .filter((event) => !recordId || event.recordId === recordId)
      .map(cloneEvent);
  }

  snapshot(): AvatarProfileRepositorySnapshot {
    return {
      records: [...this.records.values()].map(cloneRecord),
      events: this.events.map(cloneEvent),
    };
  }

  private supersedeExistingAccepted(
    accepted: AvatarProfileRecord,
    options: AvatarLifecycleOptions,
  ): AvatarProfileRecord[] {
    const superseded: AvatarProfileRecord[] = [];
    for (const record of this.records.values()) {
      if (record.id === accepted.id || record.status !== 'accepted') continue;
      if (
        record.profile.avatarId !== accepted.profile.avatarId ||
        record.profile.userId !== accepted.profile.userId ||
        scopeValue(record.profile.orgId) !== scopeValue(accepted.profile.orgId)
      ) {
        continue;
      }
      const next = supersedeAvatarProfileRecord(record, options);
      this.records.set(next.id, cloneRecord(next));
      this.appendEvent('record_superseded', next, options);
      superseded.push(next);
    }
    return superseded;
  }

  private appendEvent(
    type: AvatarProfileRepositoryEventType,
    record: AvatarProfileRecord,
    options: AvatarLifecycleOptions,
    extra: Pick<AvatarProfileRepositoryEvent, 'issues' | 'reason'> = {},
  ): void {
    const createdAt = options.now ?? new Date().toISOString();
    this.events.push({
      id: `avatar_profile_event_${this.events.length + 1}`,
      type,
      recordId: record.id,
      avatarId: record.profile.avatarId,
      brandId: record.profile.brandId ?? null,
      userId: record.profile.userId,
      orgId: record.profile.orgId ?? null,
      actorId: options.actorId,
      createdAt,
      ...extra,
    });
  }
}

export function createInMemoryAvatarProfileRepository(
  snapshot?: Partial<AvatarProfileRepositorySnapshot>,
): InMemoryAvatarProfileRepository {
  return new InMemoryAvatarProfileRepository(snapshot);
}

function matchesFilter(record: AvatarProfileRecord, filter: AvatarProfileListFilter): boolean {
  if (filter.avatarId && record.profile.avatarId !== filter.avatarId) return false;
  if (filter.userId && record.profile.userId !== filter.userId) return false;
  if (filter.orgId !== undefined && scopeValue(record.profile.orgId) !== scopeValue(filter.orgId)) return false;
  if (filter.brandId !== undefined && scopeValue(record.profile.brandId) !== scopeValue(filter.brandId)) return false;
  if (filter.status && record.status !== filter.status) return false;
  return true;
}

function failure(
  code: AvatarProfileRepositoryFailureCode,
  path: string,
  message: string,
): AvatarProfileRepositoryResult {
  return { ok: false, code, issues: [{ severity: 'error', code: 'review_required', path, message }] };
}

function scopeValue(value: string | null | undefined): string | null {
  return value ?? null;
}

function cloneRecord(record: AvatarProfileRecord): AvatarProfileRecord {
  return JSON.parse(JSON.stringify(record)) as AvatarProfileRecord;
}

function cloneEvent(event: AvatarProfileRepositoryEvent): AvatarProfileRepositoryEvent {
  return JSON.parse(JSON.stringify(event)) as AvatarProfileRepositoryEvent;
}

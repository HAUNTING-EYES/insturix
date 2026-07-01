import { describe, expect, it } from 'vitest';
import type { IndexDescription } from 'mongodb';
import {
  createAvatarVaultMongoProfileStore,
  type AvatarVaultMongoCollection,
  type AvatarVaultMongoCollections,
  type AvatarVaultMongoCursor,
  type AvatarVaultMongoEventDocument,
  type AvatarVaultMongoProfileDocument,
} from '../../lib/avatar/avatar-mongo-store';
import {
  createAvatarProfileDraftFromRequest,
  getAvatarProfile,
  reviewAvatarProfileDraft,
} from '../../lib/avatar/avatar-vault-api';
import { createInMemoryAvatarProfileRepository } from '../../lib/avatar/avatar-repository';
import { createAvatarProfileDraft } from '../../lib/avatar/avatar-lifecycle';
import type { AvatarProfile } from '../../lib/avatar/avatar-profile';

const NOW = '2026-07-01T01:00:00.000Z';

describe('Avatar Vault API', () => {
  it('creates no-brand drafts only when brand scope is explicit', async () => {
    const store = createInMemoryAvatarProfileRepository();
    const created = await createAvatarProfileDraftFromRequest(
      {
        userId: 'user_api',
        orgId: null,
        actorId: 'user_api',
        body: {
          bindBrand: false,
          recordId: 'draft_api_personal',
          profile: avatar({ userId: 'ignored_user', brandId: 'ignored_brand' }),
        },
      },
      { store, now: () => NOW },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error('Expected draft creation to succeed.');
    expect(created.body.record.profile.userId).toBe('user_api');
    expect(created.body.record.profile.brandId).toBeNull();

    const accepted = await reviewAvatarProfileDraft(
      {
        userId: 'user_api',
        orgId: null,
        recordId: 'draft_api_personal',
        body: { action: 'accept' },
      },
      { store, now: () => '2026-07-01T01:05:00.000Z' },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.ok).toBe(true);
  });

  it('requires a brand id when bindBrand is true', async () => {
    const result = await createAvatarProfileDraftFromRequest(
      {
        userId: 'user_api',
        orgId: null,
        body: {
          bindBrand: true,
          profile: avatar(),
        },
      },
      { store: createInMemoryAvatarProfileRepository(), now: () => NOW },
    );

    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error('Expected brand scope failure.');
    expect(result.body.error.code).toBe('brand_required');
  });

  it('returns validation detail when review acceptance fails', async () => {
    const store = createInMemoryAvatarProfileRepository();
    const created = await createAvatarProfileDraftFromRequest(
      {
        userId: 'user_api',
        orgId: null,
        actorId: 'user_api',
        body: {
          bindBrand: false,
          recordId: 'draft_api_no_consent',
          profile: avatar({ rights: { consentConfirmed: false, likenessOwner: 'self', commercialUseAllowed: true } }),
        },
      },
      { store, now: () => NOW },
    );
    expect(created.status).toBe(201);

    const result = await reviewAvatarProfileDraft(
      {
        userId: 'user_api',
        orgId: null,
        recordId: 'draft_api_no_consent',
        body: { action: 'accept' },
      },
      { store, now: () => '2026-07-01T01:05:00.000Z' },
    );

    expect(result.status).toBe(422);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error('Expected review validation failure.');
    expect(result.body.error.message).toContain('Likeness and voice consent must be confirmed before acceptance.');
  });
  it('rejects virtual person drafts without a full-body reference', async () => {
    const result = await createAvatarProfileDraftFromRequest(
      {
        userId: 'user_api',
        orgId: null,
        body: {
          bindBrand: false,
          profile: avatar({ sourceType: 'virtual_person_profile' }),
        },
      },
      { store: createInMemoryAvatarProfileRepository(), now: () => NOW },
    );

    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error('Expected full-body reference failure.');
    expect(result.body.error.code).toBe('invalid_body');
  });

  it('rejects cross-user reads before returning profile data', async () => {
    const store = createInMemoryAvatarProfileRepository();
    store.saveRecord(createAvatarProfileDraft(avatar({ userId: 'owner_user' }), { id: 'draft_private', now: NOW }));

    const result = await getAvatarProfile(
      { userId: 'other_user', orgId: null, recordId: 'draft_private' },
      { store },
    );

    expect(result.status).toBe(403);
    expect(result.body.ok).toBe(false);
  });
});

describe('Avatar Vault Mongo profile store', () => {
  it('persists records, events, accepted lookup, and supersession', async () => {
    const collections = createMemoryCollections();
    const store = createAvatarVaultMongoProfileStore({ collections });

    await store.saveRecord(createAvatarProfileDraft(avatar({ displayName: 'Avatar V1' }), { id: 'draft_v1', now: NOW }));
    const first = await store.acceptDraft('draft_v1', { now: '2026-07-01T01:05:00.000Z' });
    if (!first.ok) throw new Error('Expected first accept to succeed.');

    await store.saveRecord(createAvatarProfileDraft(avatar({ displayName: 'Avatar V2', brandId: 'brand_new' }), {
      id: 'draft_v2',
      now: '2026-07-01T01:10:00.000Z',
    }));
    const second = await store.acceptDraft('draft_v2', { now: '2026-07-01T01:15:00.000Z' });

    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('Expected second accept to succeed.');
    expect(second.superseded.map((record) => record.id)).toEqual(['draft_v1']);
    expect((await store.getRecord('draft_v1'))?.status).toBe('superseded');
    expect((await store.getLatestAcceptedRecord({ userId: 'user_avatar', orgId: null }))?.id).toBe('draft_v2');
    expect((await store.listEvents()).map((event) => event.type)).toEqual(
      expect.arrayContaining(['draft_saved', 'draft_accepted', 'record_superseded']),
    );
    expect(collections.profiles.indexes.flat()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'avatar_user_org_status_updatedAt' })]),
    );
  });
});

function avatar(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
  const base: AvatarProfile = {
    version: 1,
    avatarId: 'avatar_primary',
    userId: 'user_avatar',
    orgId: null,
    brandId: null,
    displayName: 'Primary Presenter',
    status: 'draft',
    sourceType: 'uploaded_portrait',
    portrait: {
      assetId: 'asset_portrait',
      imageUrl: 'https://cdn.example.test/avatar/portrait.png',
      faceDetected: true,
    },
    voice: {
      sourceType: 'uploaded_voice_sample',
      sampleAssetId: 'asset_voice_sample',
      language: 'en',
    },
    persona: {},
    rights: {
      consentConfirmed: true,
      likenessOwner: 'self',
      commercialUseAllowed: true,
    },
    evidence: [
      {
        id: 'e_consent',
        signalPath: 'rights.consentConfirmed',
        sourceType: 'manual_user_entry',
        confidence: 1,
        observedAt: NOW,
        extractor: 'avatar-vault-api.test',
        consentRequired: true,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
  return {
    ...base,
    ...overrides,
    portrait: { ...base.portrait, ...(overrides.portrait ?? {}) },
    voice: { ...base.voice, ...(overrides.voice ?? {}) },
    persona: { ...base.persona, ...(overrides.persona ?? {}) },
    rights: { ...base.rights, ...(overrides.rights ?? {}) },
    evidence: overrides.evidence ?? base.evidence,
  };
}

function createMemoryCollections(): {
  profiles: MemoryMongoCollection<AvatarVaultMongoProfileDocument>;
  events: MemoryMongoCollection<AvatarVaultMongoEventDocument>;
} & AvatarVaultMongoCollections {
  return {
    profiles: new MemoryMongoCollection<AvatarVaultMongoProfileDocument>(),
    events: new MemoryMongoCollection<AvatarVaultMongoEventDocument>(),
  };
}

class MemoryMongoCollection<TDocument extends { _id: string }> implements AvatarVaultMongoCollection<TDocument> {
  readonly indexes: IndexDescription[][] = [];
  private readonly docs = new Map<string, TDocument>();

  async createIndexes(indexes: IndexDescription[]): Promise<void> {
    this.indexes.push(indexes);
  }

  async findOne(filter: Record<string, unknown>): Promise<TDocument | null> {
    return this.values().find((doc) => matchesFilter(doc as Record<string, unknown>, filter)) ?? null;
  }

  find(filter: Record<string, unknown>): AvatarVaultMongoCursor<TDocument> {
    return new MemoryMongoCursor(this.values().filter((doc) => matchesFilter(doc as Record<string, unknown>, filter)));
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: { $set?: Partial<TDocument>; $setOnInsert?: Partial<TDocument> },
    options: { upsert?: boolean } = {},
  ): Promise<void> {
    const existing = this.values().find((doc) => matchesFilter(doc as Record<string, unknown>, filter));
    const id = typeof filter._id === 'string' ? filter._id : update.$set?._id ?? update.$setOnInsert?._id;
    if (!existing && !options.upsert) return;
    if (!id) throw new Error('MemoryMongoCollection updateOne requires an _id.');

    if (existing) {
      this.docs.set(existing._id, clone({ ...existing, ...update.$set }));
      return;
    }

    this.docs.set(id, clone({ _id: id, ...update.$setOnInsert, ...update.$set } as TDocument));
  }

  values(): TDocument[] {
    return [...this.docs.values()].map(clone);
  }
}

class MemoryMongoCursor<TDocument> implements AvatarVaultMongoCursor<TDocument> {
  constructor(private docs: TDocument[]) {}

  sort(sort: Record<string, 1 | -1>): AvatarVaultMongoCursor<TDocument> {
    const [entry] = Object.entries(sort);
    if (!entry) return this;
    const [key, direction] = entry;
    this.docs = [...this.docs].sort((a, b) => {
      const left = String((a as Record<string, unknown>)[key] ?? '');
      const right = String((b as Record<string, unknown>)[key] ?? '');
      const order = left.localeCompare(right);
      return direction === 1 ? order : -order;
    });
    return this;
  }

  limit(limit: number): AvatarVaultMongoCursor<TDocument> {
    this.docs = this.docs.slice(0, limit);
    return this;
  }

  async toArray(): Promise<TDocument[]> {
    return this.docs.map(clone);
  }
}

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => matchesFilterValue(doc[key], value));
}

function matchesFilterValue(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual == null;
  return actual === expected;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

import { describe, expect, it } from 'vitest';
import {
  createBrandVaultMongoRefineryStore,
  type BrandVaultMongoCollection,
  type BrandVaultMongoCollections,
  type BrandVaultMongoEventDocument,
  type BrandVaultMongoJobDocument,
  type BrandVaultMongoProfileDocument,
  type BrandVaultMongoCursor,
} from '../../lib/shared/brand-vault-mongo-store';
import {
  createBrandVaultRefineryJobFromWebsite,
  getBrandVaultRefineryJob,
  reviewBrandVaultSignalProfileDraft,
} from '../../lib/shared/brand-vault-refinery-api';

const HTML = `
<!doctype html>
<html>
  <head>
    <title>Persistly - Brand systems for operators</title>
    <meta name="description" content="Persistly helps agency teams turn client websites into trusted brand systems.">
    <meta property="og:site_name" content="Persistly">
    <meta name="theme-color" content="#183047">
    <style>
      :root { --brand: #183047; --accent: #36d399; --paper: #ffffff; }
      body { color: #183047; background: #ffffff; font-family: "Inter", sans-serif; }
      button { background: #36d399; }
    </style>
  </head>
  <body>
    <h1>Build client brand systems fast</h1>
    <button>Start setup</button>
    <blockquote>Trusted by production teams.</blockquote>
  </body>
</html>
`;

describe('Brand Vault Mongo refinery store', () => {
  it('persists drafts, job snapshots, review updates, events, and accepted-profile supersession', async () => {
    const collections = createMemoryCollections();
    const store = createBrandVaultMongoRefineryStore({ collections });

    const first = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_mongo', body: { websiteUrl: 'persistly.example', brandId: 'brand_mongo' } },
      { store, clock: () => '2026-06-10T05:00:00.000Z', fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!first.body.ok) throw new Error(first.body.error.message);

    const loaded = await getBrandVaultRefineryJob(
      { userId: 'user_mongo', jobId: first.body.job.id },
      { store },
    );
    expect(loaded.status).toBe(200);
    expect(loaded.body.ok).toBe(true);
    if (!loaded.body.ok) throw new Error(loaded.body.error.message);
    expect(loaded.body.record?.id).toBe(first.body.record.id);

    const accepted = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_mongo',
        recordId: first.body.record.id,
        body: { action: 'accept' },
        now: '2026-06-10T05:05:00.000Z',
      },
      { store },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.ok).toBe(true);
    if (!accepted.body.ok) throw new Error(accepted.body.error.message);
    expect(accepted.body.record.status).toBe('accepted');
    expect(accepted.body.job?.status).toBe('accepted');

    const second = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_mongo', body: { websiteUrl: 'persistly.example', brandId: 'brand_mongo' } },
      { store, clock: () => '2026-06-10T05:10:00.000Z', fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!second.body.ok) throw new Error(second.body.error.message);

    const acceptedSecond = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_mongo',
        recordId: second.body.record.id,
        body: { action: 'accept' },
        now: '2026-06-10T05:15:00.000Z',
      },
      { store },
    );
    expect(acceptedSecond.body.ok).toBe(true);
    if (!acceptedSecond.body.ok) throw new Error(acceptedSecond.body.error.message);
    expect(acceptedSecond.body.superseded.map((record) => record.id)).toEqual([first.body.record.id]);

    const latest = await store.getLatestAcceptedProfile({ brandId: 'brand_mongo', userId: 'user_mongo' });
    expect(latest?.identity.brandName.value).toBe('Persistly');

    expect(collections.profiles.indexes.length).toBeGreaterThan(0);
    expect(collections.jobs.indexes.length).toBeGreaterThan(0);
    expect(collections.events.indexes.length).toBeGreaterThan(0);
    expect(collections.events.values().map((event) => event.type)).toEqual(
      expect.arrayContaining(['draft_saved', 'draft_accepted', 'record_superseded']),
    );
  });
});

function htmlResponse(): Response {
  return new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } });
}

function createMemoryCollections(): {
  profiles: MemoryMongoCollection<BrandVaultMongoProfileDocument>;
  events: MemoryMongoCollection<BrandVaultMongoEventDocument>;
  jobs: MemoryMongoCollection<BrandVaultMongoJobDocument>;
} & BrandVaultMongoCollections {
  return {
    profiles: new MemoryMongoCollection<BrandVaultMongoProfileDocument>(),
    events: new MemoryMongoCollection<BrandVaultMongoEventDocument>(),
    jobs: new MemoryMongoCollection<BrandVaultMongoJobDocument>(),
  };
}

class MemoryMongoCollection<TDocument extends { _id: string }> implements BrandVaultMongoCollection<TDocument> {
  readonly indexes: unknown[][] = [];
  private readonly docs = new Map<string, TDocument>();

  async createIndexes(indexes: unknown[]): Promise<void> {
    this.indexes.push(indexes);
  }

  async findOne(filter: Record<string, unknown>): Promise<TDocument | null> {
    return this.values().find((doc) => matchesFilter(doc, filter)) ?? null;
  }

  find(filter: Record<string, unknown>): BrandVaultMongoCursor<TDocument> {
    return new MemoryMongoCursor(this.values().filter((doc) => matchesFilter(doc, filter)));
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: { $set?: Partial<TDocument>; $setOnInsert?: Partial<TDocument> },
    options: { upsert?: boolean } = {},
  ): Promise<void> {
    const existing = this.values().find((doc) => matchesFilter(doc, filter));
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

class MemoryMongoCursor<TDocument> implements BrandVaultMongoCursor<TDocument> {
  constructor(private docs: TDocument[]) {}

  sort(sort: Record<string, 1 | -1>): BrandVaultMongoCursor<TDocument> {
    const [[key, direction]] = Object.entries(sort);
    this.docs = [...this.docs].sort((a, b) => {
      const left = String((a as Record<string, unknown>)[key] ?? '');
      const right = String((b as Record<string, unknown>)[key] ?? '');
      return direction * right.localeCompare(left);
    });
    return this;
  }

  limit(limit: number): BrandVaultMongoCursor<TDocument> {
    this.docs = this.docs.slice(0, limit);
    return this;
  }

  async toArray(): Promise<TDocument[]> {
    return this.docs.map(clone);
  }
}

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => doc[key] === value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

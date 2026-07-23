import type { Db } from 'mongodb';

import { describe, expect, it } from 'vitest';

import { cleanupDisposableChatBattleFixtureInDatabase } from '@/lib/editron/services/chat-edit-battle-fixture-cleanup';

const COLLECTIONS = {
  projects: 'projects',
  analyses: 'editron_asset_analyses',
  chats: 'chatSessions',
  checkpoints: 'checkpoints',
  deepAnalysisJobs: 'editron_chat_deep_analysis_jobs',
  dubbingJobs: 'editron_chat_dubbing_jobs',
  mgRenderJobs: 'editron_mg_render_jobs',
  uploadBatches: 'mediaUploadBatches',
  mediaAssets: 'mediaAssets',
};

function fakeDatabase(input: { fixtureExists: boolean; remainingFixtures?: number }) {
  const calls: Array<{ collection: string; operation: string; filter: unknown }> = [];
  const db = {
    collection(name: string) {
      return {
        async findOne(filter: unknown) {
          calls.push({ collection: name, operation: 'findOne', filter });
          return input.fixtureExists ? { _id: 'fixture' } : null;
        },
        async deleteMany(filter: unknown) {
          calls.push({ collection: name, operation: 'deleteMany', filter });
          return { deletedCount: 1 };
        },
        async deleteOne(filter: unknown) {
          calls.push({ collection: name, operation: 'deleteOne', filter });
          return { deletedCount: 1 };
        },
        async countDocuments(filter: unknown) {
          calls.push({ collection: name, operation: 'countDocuments', filter });
          return input.remainingFixtures ?? 0;
        },
      };
    },
  } as unknown as Pick<Db, 'collection'>;
  return { db, calls };
}

describe('chat battle fixture cleanup', () => {
  it('refuses any project outside the disposable fixture namespace', async () => {
    const { db, calls } = fakeDatabase({ fixtureExists: true });
    await expect(cleanupDisposableChatBattleFixtureInDatabase(db, 'proj_customer_123', COLLECTIONS))
      .rejects.toThrow('not a disposable chat-battle fixture');
    expect(calls).toEqual([]);
  });

  it('accepts the compact namespace used by the full live matrix', async () => {
    const { db } = fakeDatabase({ fixtureExists: true, remainingFixtures: 1 });
    const result = await cleanupDisposableChatBattleFixtureInDatabase(
      db,
      'proj_cb_7820260723054624_01',
      COLLECTIONS,
    );
    expect(result).toMatchObject({ skipped: false, deleted: { projects: 1 } });
  });

  it('does not delete dependent records unless Mongo confirms the disposable marker', async () => {
    const { db, calls } = fakeDatabase({ fixtureExists: false });
    const result = await cleanupDisposableChatBattleFixtureInDatabase(db, 'proj_chatbattle_missing', COLLECTIONS);
    expect(result).toMatchObject({ skipped: true, deleted: { projects: 0, analyses: 0 } });
    expect(calls.map((call) => call.operation)).toEqual(['findOne']);
  });

  it('deletes scoped aliases and removes legacy shared aliases only after the final fixture', async () => {
    const { db, calls } = fakeDatabase({ fixtureExists: true, remainingFixtures: 0 });
    const result = await cleanupDisposableChatBattleFixtureInDatabase(db, 'proj_chatbattle_run_1', COLLECTIONS);
    expect(result).toMatchObject({
      skipped: false,
      deleted: {
        projects: 1,
        analyses: 1,
        chats: 1,
        checkpoints: 1,
        deepAnalysisJobs: 1,
        dubbingJobs: 1,
        mgRenderJobs: 1,
        uploadBatches: 1,
        assetAliases: 2,
      },
    });
    const projectDeleteIndex = calls.findIndex((call) => call.collection === COLLECTIONS.projects && call.operation === 'deleteOne');
    const dependentDeleteIndexes = calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call.operation === 'deleteMany' && call.collection !== COLLECTIONS.mediaAssets)
      .map(({ index }) => index);
    expect(dependentDeleteIndexes.every((index) => index < projectDeleteIndex)).toBe(true);
    expect(calls).toContainEqual(expect.objectContaining({
      collection: COLLECTIONS.mediaAssets,
      operation: 'deleteMany',
    }));
  });

  it('deletes only the current fixture aliases while another disposable fixture exists', async () => {
    const { db, calls } = fakeDatabase({ fixtureExists: true, remainingFixtures: 1 });
    const result = await cleanupDisposableChatBattleFixtureInDatabase(db, 'proj_chatbattle_run_2', COLLECTIONS);
    expect(result.deleted.assetAliases).toBe(1);
    expect(calls.filter((call) => call.collection === COLLECTIONS.mediaAssets)).toEqual([
      expect.objectContaining({
        operation: 'deleteMany',
        filter: {
          'metadata.battleFixtureAlias': true,
          'metadata.battleFixtureProjectId': 'proj_chatbattle_run_2',
        },
      }),
    ]);
  });
});

import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  buildMigrationCasFilter,
  captureMigrationCasFields,
  createMigrationExecutionEvent,
  hashMigrationValue,
  resolveMigrationOperator,
  verifyMigrationExecutionChain,
  type ThinkForgeMigrationExecutionEventV1,
} from '@/lib/thinkforge/migrations/execution-report-v1';

const IDENTITY = {
  runId: 'tfmig_test_run_001',
  migrationName: 'thinkforge_document_contracts',
  migrationVersion: 1,
  mode: 'apply' as const,
  database: 'thinkforge_test',
  operator: 'operator@example.com',
  git: {
    commitSha: 'a'.repeat(40),
    treeSha: 'b'.repeat(40),
    branch: 'infrastructure-improvs-+Editron',
    dirty: false,
  },
};

function event(input: {
  sequence: number;
  state: ThinkForgeMigrationExecutionEventV1['state'];
  previousEventHash: string | null;
  details?: ThinkForgeMigrationExecutionEventV1['details'];
}) {
  return createMigrationExecutionEvent({
    ...IDENTITY,
    sequence: input.sequence,
    state: input.state,
    occurredAt: `2026-08-17T00:00:0${input.sequence}.000Z`,
    previousEventHash: input.previousEventHash,
    details: input.details,
  });
}

describe('ThinkForge migration execution evidence', () => {
  it('hashes canonical evidence deterministically', () => {
    const left = {
      nested: { z: 2, a: 1 },
      at: new Date('2026-08-17T00:00:00.000Z'),
      id: new ObjectId('64b64c6f2f1f1f1f1f1f1f1f'),
    };
    const right = {
      id: new ObjectId('64b64c6f2f1f1f1f1f1f1f1f'),
      at: new Date('2026-08-17T00:00:00.000Z'),
      nested: { a: 1, z: 2 },
    };

    expect(hashMigrationValue(left)).toBe(hashMigrationValue(right));
    expect(event({ sequence: 0, state: 'started', previousEventHash: null }))
      .toEqual(event({ sequence: 0, state: 'started', previousEventHash: null }));
  });

  it('verifies the complete hash chain and detects tampering or reordering', () => {
    const started = event({ sequence: 0, state: 'started', previousEventHash: null });
    const planned = event({
      sequence: 1,
      state: 'planned',
      previousEventHash: started.eventHash,
      details: {
        counts: { scanned: 4, quarantined: 1 },
        hashes: { source: hashMigrationValue(['source']) },
      },
    });
    const verified = event({
      sequence: 2,
      state: 'verified',
      previousEventHash: planned.eventHash,
      details: { counts: { active: 3, quarantined: 1 } },
    });

    expect(verifyMigrationExecutionChain([started, planned, verified])).toEqual({ valid: true, errors: [] });
    const fetchedFromMongo = { ...planned, _id: new ObjectId() } as ThinkForgeMigrationExecutionEventV1;
    expect(verifyMigrationExecutionChain([started, fetchedFromMongo, verified]).valid).toBe(true);

    const tampered = {
      ...planned,
      details: { ...planned.details, counts: { scanned: 5, quarantined: 1 } },
    };
    expect(verifyMigrationExecutionChain([started, tampered, verified])).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['event_hash:1']),
    });
    expect(verifyMigrationExecutionChain([planned, started, verified]).valid).toBe(false);

    const impossibleVerified = event({
      sequence: 1,
      state: 'verified',
      previousEventHash: started.eventHash,
    });
    const afterTerminal = event({
      sequence: 2,
      state: 'planned',
      previousEventHash: impossibleVerified.eventHash,
    });
    expect(verifyMigrationExecutionChain([])).toEqual({ valid: false, errors: ['empty_chain'] });
    expect(verifyMigrationExecutionChain([started, impossibleVerified, afterTerminal])).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'transition:1:started:verified',
        'transition:2:verified:planned',
      ]),
    });
  });

  it('requires an explicit operator for every mutation mode', () => {
    expect(resolveMigrationOperator('dry_run', [])).toBeNull();
    expect(() => resolveMigrationOperator('apply', [])).toThrow('requires --operator');
    expect(() => resolveMigrationOperator('rollback', [])).toThrow('requires --operator');
    expect(resolveMigrationOperator('apply', ['--operator=operator@example.com']))
      .toBe('operator@example.com');
    expect(() => createMigrationExecutionEvent({
      ...IDENTITY,
      operator: null,
      sequence: 0,
      state: 'started',
      occurredAt: '2026-08-17T00:00:00.000Z',
      previousEventHash: null,
    })).toThrow('operator is required');
  });

  it('builds exact CAS predicates that distinguish missing, null, and changed values', () => {
    const planned = captureMigrationCasFields({
      present: null,
      nested: {},
      changed: 'before',
    }, ['present', 'absent', 'nested.value', 'changed']);
    const filter = buildMigrationCasFilter<{ _id: string }>({ _id: 'record_1' }, planned);

    expect(filter).toEqual({
      $and: [
        { _id: 'record_1' },
        { present: { $exists: true, $eq: null } },
        { absent: { $exists: false } },
        { 'nested.value': { $exists: false } },
        { changed: { $exists: true, $eq: 'before' } },
      ],
    });

    const changedFilter = buildMigrationCasFilter<{ _id: string }>(
      { _id: 'record_1' },
      captureMigrationCasFields({ present: null, nested: {}, changed: 'after' }, [
        'present',
        'absent',
        'nested.value',
        'changed',
      ]),
    );
    const nowPresentFilter = buildMigrationCasFilter<{ _id: string }>(
      { _id: 'record_1' },
      captureMigrationCasFields({ present: null, absent: 'late write' }, ['present', 'absent']),
    );

    expect(changedFilter).not.toEqual(filter);
    expect(nowPresentFilter).toEqual({
      $and: [
        { _id: 'record_1' },
        { present: { $exists: true, $eq: null } },
        { absent: { $exists: true, $eq: 'late write' } },
      ],
    });
  });
});
